/**
 * POST /api/generate — turn text into candidate visuals (US-010).
 *
 * Flow: parse → validate (length/type, before any LLM call) → check Azure config
 * → identify the user → enforce quota (anonymous trial cookie) or rate limit
 * (authenticated, per user) → generate via Azure OpenAI → return `{ candidates }`.
 *
 * Anonymous callers get a NON-resetting lifetime trial tracked by a signed
 * cookie; authenticated callers are rate limited per user.
 */

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
  ANON_COOKIE_NAME,
  anonTrialLimit,
  checkRateLimit,
  newAnonState,
  parseAnonCookie,
  signAnonState,
  userRateLimit,
  userRateWindowMs,
  type RateLimitWindow,
} from "@/lib/ai/quota";
import { getCurrentUser } from "@/lib/session";
import {
  VISUAL_KINDS,
  isVisualKind,
  type VisualKind,
} from "@/lib/visual/schema";

// Use the Node.js runtime: the Azure call and node:crypto signing need it.
export const runtime = "nodejs";

/** Module-level store for the per-user fixed-window rate limiter. */
const userRateStore = new Map<string, RateLimitWindow>();

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

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

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
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
      return errorResponse(503, "AI generation is not configured.");
    }
    throw error;
  }

  const user = await getCurrentUser();

  // Quota / rate limiting.
  let commitAnonUsage: (() => void) | null = null;
  let setAnonCookie: string | null = null;

  if (user) {
    const result = checkRateLimit(userRateStore, user.id, {
      limit: userRateLimit(),
      windowMs: userRateWindowMs(),
      now: Date.now(),
    });
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
  } else {
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
    const candidates = await generateVisuals({ text, type }, { complete });
    commitAnonUsage?.();

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
      return errorResponse(
        502,
        "We couldn't generate visuals from that text. Please try again.",
      );
    }
    return errorResponse(500, "Unexpected error while generating visuals.");
  }
}
