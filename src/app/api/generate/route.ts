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

import { NextResponse, type NextRequest } from "next/server";

import {
  EmptyInputError,
  GenerationError,
  InputTooLongError,
  MAX_INPUT_CHARS,
  generateVisuals,
} from "@/lib/ai/generate";
import {
  createGenerationRouteHandler,
  type PayloadParseResult,
} from "@/lib/ai/generation-route";
import {
  DETAIL_LEVELS,
  ORIENTATIONS,
  isDetailLevel,
  isOrientation,
  type DetailLevel,
  type Orientation,
} from "@/lib/ai/prompt";
import {
  VISUAL_KINDS,
  isVisualKind,
  type Visual,
  type VisualKind,
} from "@/lib/visual/schema";

// Use the Node.js runtime: the Azure call and node:crypto signing need it.
export const runtime = "nodejs";

/** Scope tag for structured error logs from this route. */
const LOG_SCOPE = "api.generate";

interface GeneratePayload {
  text: string;
  type?: VisualKind;
  orientation?: Orientation;
  detailLevel?: DetailLevel;
  stayCloserToText?: boolean;
}

function parsePayload(
  body: Record<string, unknown>,
): PayloadParseResult<GeneratePayload> {
  const text = typeof body.text === "string" ? body.text : "";
  if (text.trim().length === 0) {
    return { ok: false, status: 400, message: "`text` is required." };
  }
  // Reject oversized input BEFORE any LLM call.
  if (text.length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      status: 413,
      message: `Input text is too long (${text.length} characters). The maximum is ${MAX_INPUT_CHARS}.`,
    };
  }

  let type: VisualKind | undefined;
  if (body.type !== undefined && body.type !== null) {
    if (!isVisualKind(body.type)) {
      return {
        ok: false,
        status: 400,
        message: `\`type\` must be one of: ${VISUAL_KINDS.join(", ")}.`,
      };
    }
    type = body.type;
  }

  let orientation: Orientation | undefined;
  if (body.orientation !== undefined && body.orientation !== null) {
    if (!isOrientation(body.orientation)) {
      return {
        ok: false,
        status: 400,
        message: `\`orientation\` must be one of: ${ORIENTATIONS.join(", ")}.`,
      };
    }
    orientation = body.orientation;
  }

  let detailLevel: DetailLevel | undefined;
  if (body.detailLevel !== undefined && body.detailLevel !== null) {
    if (!isDetailLevel(body.detailLevel)) {
      return {
        ok: false,
        status: 400,
        message: `\`detailLevel\` must be one of: ${DETAIL_LEVELS.join(", ")}.`,
      };
    }
    detailLevel = body.detailLevel;
  }

  const stayCloserToText = body.stayCloserToText === true ? true : undefined;

  return {
    ok: true,
    payload: { text, type, orientation, detailLevel, stayCloserToText },
  };
}

const handleGenerate = createGenerationRouteHandler<GeneratePayload, Visual[]>({
  logScope: LOG_SCOPE,
  operation: "generate",
  rateLimitSubjects: {
    user: "gen-user",
    anonymousIp: "gen-anon-ip",
  },
  anonymousQuotaExceededMessage:
    "You've used all your free generations. Sign in to keep creating visuals.",
  unexpectedErrorMessage: "Unexpected error while generating visuals.",
  parsePayload,
  creditText: (payload) => payload.text,
  generate: ({ payload, complete }) => generateVisuals(payload, { complete }),
  successResponse: (candidates) => NextResponse.json({ candidates }),
  mapGenerationError: (error) => {
    if (error instanceof EmptyInputError) {
      return { status: 400, message: error.message };
    }
    if (error instanceof InputTooLongError) {
      return { status: 413, message: error.message };
    }
    if (error instanceof GenerationError) {
      return {
        status: 502,
        message:
          "We couldn't generate visuals from that text. Please try again.",
        log: { reason: "generation-failed", status: 502 },
      };
    }
    return null;
  },
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleGenerate(request);
}
