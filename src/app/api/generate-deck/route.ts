/**
 * POST /api/generate-deck — turn a document into a presentation Deck (#265).
 *
 * Mirrors the EXACT control flow of `POST /api/generate` (US-010): parse →
 * validate (outline length/shape, before any LLM call) → check Azure config →
 * identify the user → enforce quota (anonymous trial cookie + hashed-IP
 * throttle) or per-user rate limit + credit metering → generate via Azure
 * OpenAI (wrapped in the abort deadline, with an output-token budget) → charge
 * credits on success → return `{ deck, truncated }` (the `truncated` flag tells
 * the UI when the source outline was trimmed to fit the input budget).
 *
 * Request contract
 * ----------------
 *   { contentJson: <serialised Lexical editor state>, options?: { length?,
 *     tone?, audience? } }
 *
 * The document's VISUALS are derived from `contentJson` itself: every embedded
 * visual node carries its own `visual` payload, so {@link collectDocumentBlocks}
 * yields the `{ visualId → Visual }` map with no DB round-trip or document id.
 * Because the caller supplies the content directly (exactly like `/api/generate`
 * accepts raw `text`), there is no cross-document access and no document-id
 * permission check to perform — the route is gated only by quota and credits.
 *
 * The whole route is feature-flagged behind {@link isAiDeckGenEnabled}
 * (`AI_DECK_GEN_ENABLED`, default OFF): when disabled it returns 404 BEFORE
 * doing any work.
 *
 * Status-code semantics match `/api/generate`: 413 input too long, 429 rate
 * limit (+ `Retry-After`), 402 insufficient credits, 502 bad model output, 504
 * timeout, 503 Azure misconfig.
 */

import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import {
  AzureConfigError,
  azureChatComplete,
  getAzureConfig,
} from "@/lib/ai/azure";
import { buildDeckSource } from "@/lib/ai/deck-source";
import {
  GENERATE_TIMEOUT_MS,
  GenerateTimeoutError,
  withAbortDeadline,
} from "@/lib/ai/deadline";
import {
  EmptyInputError,
  GenerationError,
  InputTooLongError,
  MAX_INPUT_CHARS,
  type CompleteFn,
} from "@/lib/ai/generate";
import type { DeckGenerationOptions } from "@/lib/ai/generate-deck";
import { DECK_OUTPUT_TOKEN_BUDGET } from "@/lib/ai/generate-deck";
import { runDeckGeneration } from "@/lib/ai/run-deck-generation";
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
import {
  isAiDeckGenEnabled,
  isUnlimitedCreditsEnabled,
} from "@/lib/billing/entitlements";
import { getCurrentUser } from "@/lib/session";
import { logError } from "@/lib/log";
import {
  collectDocumentBlocks,
  type DocumentBlock,
} from "@/lib/visual/document-export";
import { inferDeckTheme } from "@/lib/presentation/infer-theme";
import type { Visual } from "@/lib/visual/schema";
import { auth as authEnv } from "@/lib/env";

// Use the Node.js runtime: the Azure call and node:crypto signing need it.
export const runtime = "nodejs";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Scope tag for structured error logs from this route. */
const LOG_SCOPE = "api.generate-deck";

const DECK_LENGTHS: readonly NonNullable<DeckGenerationOptions["length"]>[] = [
  "short",
  "medium",
  "long",
];

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

/**
 * Builds the `{ visualId → Visual }` map from a serialised document by reusing
 * the visual payloads embedded in the document's visual nodes (the same source
 * the slide editor uses). No DB lookup is required.
 */
function visualsFromContent(
  blocks: ReadonlyArray<DocumentBlock>,
): Map<string, Visual> {
  const visuals = new Map<string, Visual>();
  for (const block of blocks) {
    if (block.kind === "visual") {
      visuals.set(block.visualId, block.visual);
    }
  }
  return visuals;
}

/**
 * Parses and validates the optional `{ length?, tone?, audience? }` tuning.
 * Returns the parsed options, or an error message string when invalid.
 */
function parseOptions(
  value: unknown,
): { options: DeckGenerationOptions } | { error: string } {
  if (value === undefined || value === null) {
    return { options: {} };
  }
  if (!isPlainObject(value)) {
    return { error: "`options` must be an object." };
  }

  const options: DeckGenerationOptions = {};

  if (value.length !== undefined && value.length !== null) {
    if (
      !DECK_LENGTHS.includes(
        value.length as NonNullable<DeckGenerationOptions["length"]>,
      )
    ) {
      return {
        error: `\`options.length\` must be one of: ${DECK_LENGTHS.join(", ")}.`,
      };
    }
    options.length = value.length as DeckGenerationOptions["length"];
  }
  if (value.tone !== undefined && value.tone !== null) {
    if (typeof value.tone !== "string") {
      return { error: "`options.tone` must be a string." };
    }
    options.tone = value.tone;
  }
  if (value.audience !== undefined && value.audience !== null) {
    if (typeof value.audience !== "string") {
      return { error: "`options.audience` must be a string." };
    }
    options.audience = value.audience;
  }

  return { options };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Disabled-by-default feature flag: bail out BEFORE doing any work so the
  // route is invisible until an operator opts in.
  if (!isAiDeckGenEnabled()) {
    return errorResponse(404, "Not found.");
  }

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

  if (body.contentJson === undefined || body.contentJson === null) {
    return errorResponse(400, "`contentJson` is required.");
  }

  const parsedOptions = parseOptions(body.options);
  if ("error" in parsedOptions) {
    return errorResponse(400, parsedOptions.error);
  }
  const { options } = parsedOptions;

  // Derive the document's outline + visual inventory up front so we can validate
  // (and price) it BEFORE any LLM call. Visuals come from the embedded payloads.
  const blocks = collectDocumentBlocks(body.contentJson);
  const visuals = visualsFromContent(blocks);
  const { outline, truncated } = buildDeckSource(body.contentJson, visuals);
  // Derive a vibrant theme from the document's visuals so a model that returns
  // the bleak "default" theme is upgraded to a document-appropriate one (#281).
  const preferredTheme = inferDeckTheme(blocks);

  if (outline.trim().length === 0) {
    return errorResponse(
      400,
      "`contentJson` does not contain any usable outline content.",
    );
  }
  // Reject oversized input BEFORE any LLM call.
  if (outline.length > MAX_INPUT_CHARS) {
    return errorResponse(
      413,
      `Document outline is too long (${outline.length} characters). The maximum is ${MAX_INPUT_CHARS}.`,
    );
  }

  const secret = authEnv.secret();
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
    complete = (messages) =>
      withAbortDeadline(
        (signal) =>
          azureChatComplete(messages, {
            config,
            signal,
            maxOutputTokens: DECK_OUTPUT_TOKEN_BUDGET,
          }),
        GENERATE_TIMEOUT_MS,
      );
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
      rateLimitSubject("gen-deck-user", user.id),
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
      creditCost = computeCreditCost(outline);
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
      "gen-deck-anon-ip",
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
        "You've used all your free generations. Sign in to keep creating decks.",
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
    const { deck } = await runDeckGeneration({
      contentJson: body.contentJson,
      visuals,
      complete,
      options,
      preferredTheme,
    });

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

    const response = NextResponse.json({ deck, truncated });
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
    if (error instanceof GenerateTimeoutError) {
      logError(LOG_SCOPE, error, {
        requestId,
        reason: "timeout",
        status: 504,
      });
      return errorResponse(
        504,
        "The AI took too long to respond. Please try again.",
      );
    }
    if (error instanceof EmptyInputError) {
      return errorResponse(400, error.message);
    }
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
        "We couldn't generate a deck from that document. Please try again.",
      );
    }
    logError(LOG_SCOPE, error, {
      requestId,
      reason: "unexpected",
      status: 500,
    });
    return errorResponse(500, "Unexpected error while generating the deck.");
  }
}
