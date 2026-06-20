/**
 * POST /api/generate — turn text into candidate visuals (US-010).
 *
 * Flow: parse → validate (length/type, before any LLM call) → check Azure config
 * → identify the user → enforce quota (anonymous trial cookie) or rate limit
 * (authenticated, per user) + credit metering → generate via Azure OpenAI →
 * charge credits on success → return `{ candidates }`.
 *
 * Anonymous callers get a NON-resetting lifetime trial tracked by a signed
 * cookie AND a server-side fixed-window throttle keyed by hashed client IP, so
 * clearing the cookie does not grant unlimited generations; authenticated
 * callers are rate limited per user AND have their credit balance decremented
 * (~1 credit/word). Generation is blocked at zero credits with a clear 402
 * error, and exceeded limits return 429 with a `Retry-After` header.
 */

import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import {
  AzureConfigError,
  azureChatComplete,
  getAzureConfig,
} from "@/lib/ai/azure";
import {
  GenerationError,
  InputTooLongError,
  MAX_INPUT_CHARS,
  generateVisuals,
  type CompleteFn,
} from "@/lib/ai/generate";
import {
  DETAIL_LEVELS,
  ORIENTATIONS,
  isDetailLevel,
  isOrientation,
  type DetailLevel,
  type Orientation,
} from "@/lib/ai/prompt";
import {
  ANON_COOKIE_NAME,
  anonTrialLimit,
  checkRateLimitWithStore,
  newAnonState,
  parseAnonCookie,
  signAnonState,
  userRateLimit,
  userRateWindowMs,
} from "@/lib/ai/quota";
import {
  anonIpRateLimit,
  anonIpRateWindowMs,
  getClientIp,
  hashIdentifier,
  prismaRateLimitStore,
  rateLimitSubject,
  retryAfterSeconds,
} from "@/lib/rate-limit";
import {
  computeCreditCost,
  deductCredits,
  getUserCreditState,
  hasSufficientCredits,
  InsufficientCreditsError,
} from "@/lib/billing/credits";
import { isUnlimitedCreditsEnabled } from "@/lib/billing/entitlements";
import { getCurrentUser } from "@/lib/session";
import { logError } from "@/lib/log";
import {
  VISUAL_KINDS,
  isVisualKind,
  type VisualKind,
} from "@/lib/visual/schema";

// Use the Node.js runtime: the Azure call and node:crypto signing need it.
export const runtime = "nodejs";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Scope tag for structured error logs from this route. */
const LOG_SCOPE = "api.generate";

function errorResponse(
  status: number,
  message: string,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json({ error: message }, { status, headers });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Correlation id shared by every structured log line for this request so an
  // operator can trace a single generation across log entries.
  const requestId = randomUUID();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "Request body must be valid JSON.");
  }
  if (!isPlainObject(body)) {
    return errorResponse(400, "Request body must be a JSON object.");
  }

  const text = typeof body.text === "string" ? body.text : "";
  if (text.trim().length === 0) {
    return errorResponse(400, "`text` is required.");
  }
  // Reject oversized input BEFORE any LLM call.
  if (text.length > MAX_INPUT_CHARS) {
    return errorResponse(
      413,
      `Input text is too long (${text.length} characters). The maximum is ${MAX_INPUT_CHARS}.`,
    );
  }

  let type: VisualKind | undefined;
  if (body.type !== undefined && body.type !== null) {
    if (!isVisualKind(body.type)) {
      return errorResponse(
        400,
        `\`type\` must be one of: ${VISUAL_KINDS.join(", ")}.`,
      );
    }
    type = body.type;
  }

  let orientation: Orientation | undefined;
  if (body.orientation !== undefined && body.orientation !== null) {
    if (!isOrientation(body.orientation)) {
      return errorResponse(
        400,
        `\`orientation\` must be one of: ${ORIENTATIONS.join(", ")}.`,
      );
    }
    orientation = body.orientation;
  }

  let detailLevel: DetailLevel | undefined;
  if (body.detailLevel !== undefined && body.detailLevel !== null) {
    if (!isDetailLevel(body.detailLevel)) {
      return errorResponse(
        400,
        `\`detailLevel\` must be one of: ${DETAIL_LEVELS.join(", ")}.`,
      );
    }
    detailLevel = body.detailLevel;
  }

  const stayCloserToText = body.stayCloserToText === true ? true : undefined;

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    logError(LOG_SCOPE, new Error("Missing AUTH_SECRET"), {
      requestId,
      reason: "missing-auth-secret",
      status: 500,
    });
    return errorResponse(500, "Server is misconfigured (missing AUTH_SECRET).");
  }

  // Resolve the Azure client up front so misconfiguration is a clear 503 and
  // never consumes the caller's quota.
  let complete: CompleteFn;
  try {
    const config = getAzureConfig();
    complete = (messages) => azureChatComplete(messages, { config });
  } catch (error) {
    if (error instanceof AzureConfigError) {
      logError(LOG_SCOPE, error, {
        requestId,
        reason: "azure-config",
        status: 503,
      });
      return errorResponse(503, "AI generation is not configured.");
    }
    logError(LOG_SCOPE, error, {
      requestId,
      reason: "azure-config-unexpected",
      status: 500,
    });
    throw error;
  }

  const user = await getCurrentUser();

  // Quota / rate limiting + credit metering.
  let commitAnonUsage: (() => void) | null = null;
  let setAnonCookie: string | null = null;
  // For authenticated users: compute credit cost up-front; deduct after success.
  let creditCost = 0;

  if (user) {
    const result = await checkRateLimitWithStore(
      prismaRateLimitStore,
      rateLimitSubject("gen-user", user.id),
      {
        limit: userRateLimit(),
        windowMs: userRateWindowMs(),
        now: Date.now(),
      },
    );
    if (!result.allowed) {
      const retryAfter = Math.max(
        1,
        Math.ceil((result.resetAt - Date.now()) / 1000),
      );
      return errorResponse(
        429,
        "Rate limit exceeded. Please wait a moment and try again.",
        { "Retry-After": String(retryAfter) },
      );
    }

    // Credit pre-check: ensure period is initialised and balance is sufficient.
    // Skipped entirely when credits are unlimited (creditCost stays 0, so the
    // deduction below is also a no-op).
    if (!isUnlimitedCreditsEnabled()) {
      creditCost = computeCreditCost(text);
      const creditState = await getUserCreditState(user.id);
      if (!hasSufficientCredits(creditState.balance, creditCost)) {
        return errorResponse(
          402,
          `Insufficient credits: you need ${creditCost} but have ${creditState.balance}. ` +
            `Your credits reset on ${creditState.periodEnd.toLocaleDateString()}. ` +
            `Upgrade your plan or wait for your credits to reset.`,
        );
      }
    }
  } else {
    // Server-side throttle keyed by hashed client IP (#96, criterion 2). This
    // backs the signed cookie trial: because the window is persisted in the
    // shared store keyed by IP, clearing the cookie does NOT reset it, so it is
    // materially harder to reset than the local cookie alone.
    const clientIp = getClientIp(request.headers) ?? "unknown";
    const ipKey = rateLimitSubject(
      "gen-anon-ip",
      hashIdentifier(clientIp, secret),
    );
    const now = Date.now();
    const ipResult = await checkRateLimitWithStore(
      prismaRateLimitStore,
      ipKey,
      {
        limit: anonIpRateLimit(),
        windowMs: anonIpRateWindowMs(),
        now,
      },
    );
    if (!ipResult.allowed) {
      return errorResponse(
        429,
        "Too many anonymous generations from your network. Please wait and try again, or sign in.",
        { "Retry-After": String(retryAfterSeconds(ipResult.resetAt, now)) },
      );
    }

    const state =
      parseAnonCookie(request.cookies.get(ANON_COOKIE_NAME)?.value, secret) ??
      newAnonState();
    if (state.count >= anonTrialLimit()) {
      return errorResponse(
        429,
        "You've used all your free generations. Sign in to keep creating visuals.",
      );
    }
    // Defer incrementing until a generation actually succeeds.
    commitAnonUsage = () => {
      const next = { id: state.id, count: state.count + 1 };
      setAnonCookie = signAnonState(next, secret);
    };
  }

  // Generate.
  try {
    const candidates = await generateVisuals(
      { text, type, orientation, detailLevel, stayCloserToText },
      { complete },
    );

    // Commit side effects only on success.
    commitAnonUsage?.();

    // Deduct credits for authenticated users (best-effort; mirrors existing
    // soft-quota semantics — a small TOCTOU race is acceptable).
    if (user && creditCost > 0) {
      try {
        await deductCredits(user.id, creditCost);
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          // Balance was depleted by a concurrent request between our pre-check
          // and now — return the same 402 with updated info.
          return errorResponse(402, err.message);
        }
        // Non-fatal — log but don't fail the generation response.
        logError(LOG_SCOPE, err, { requestId, reason: "credit-deduct-failed" });
      }
    }

    const response = NextResponse.json({ candidates });
    if (setAnonCookie) {
      response.cookies.set(ANON_COOKIE_NAME, setAnonCookie, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: ONE_YEAR_SECONDS,
      });
    }
    return response;
  } catch (error) {
    if (error instanceof InputTooLongError) {
      return errorResponse(413, error.message);
    }
    if (error instanceof GenerationError) {
      logError(LOG_SCOPE, error, {
        requestId,
        reason: "generation-failed",
        status: 502,
      });
      return errorResponse(
        502,
        "We couldn't generate visuals from that text. Please try again.",
      );
    }
    logError(LOG_SCOPE, error, {
      requestId,
      reason: "unexpected",
      status: 500,
    });
    return errorResponse(500, "Unexpected error while generating visuals.");
  }
}
