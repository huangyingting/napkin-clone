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

import { NextResponse, type NextRequest } from "next/server";

import { buildDeckSource } from "@/lib/ai/deck-source";
import { computeDeckMetrics, countWords } from "@/lib/ai/deck-metrics";
import {
  EmptyInputError,
  GenerationError,
  InputTooLongError,
  MAX_INPUT_CHARS,
} from "@/lib/ai/generate";
import type { DeckGenerationOptions } from "@/lib/ai/generate-deck";
import {
  DECK_OUTPUT_TOKEN_BUDGET,
  formatDeckInputTooLongError,
} from "@/lib/limits";
import {
  createGenerationRouteHandler,
  errorResponse,
  isPlainObject,
  type PayloadParseResult,
} from "@/lib/ai/generation-route";
import { runDeckGeneration } from "@/lib/ai/run-deck-generation";
import { isAiDeckGenEnabled } from "@/lib/ai/config";
import { logInfo } from "@/lib/log";
import { inferDeckTheme } from "@/lib/presentation/infer-theme";
import { collectDocumentBlocks, type DocumentBlock } from "@/lib/content";
import type { Visual } from "@/lib/visual/schema";

// Use the Node.js runtime: the Azure call and node:crypto signing need it.
export const runtime = "nodejs";

/** Scope tag for structured error logs from this route. */
const LOG_SCOPE = "api.generate-deck";

const DECK_LENGTHS: readonly NonNullable<DeckGenerationOptions["length"]>[] = [
  "short",
  "medium",
  "long",
];

interface GenerateDeckPayload {
  contentJson: unknown;
  options: DeckGenerationOptions;
  blocks: ReadonlyArray<DocumentBlock>;
  visuals: Map<string, Visual>;
  outline: string;
  truncated: boolean;
  preferredTheme: ReturnType<typeof inferDeckTheme>;
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

function parsePayload(
  body: Record<string, unknown>,
): PayloadParseResult<GenerateDeckPayload> {
  if (body.contentJson === undefined || body.contentJson === null) {
    return { ok: false, status: 400, message: "`contentJson` is required." };
  }

  const parsedOptions = parseOptions(body.options);
  if ("error" in parsedOptions) {
    return { ok: false, status: 400, message: parsedOptions.error };
  }

  const blocks = collectDocumentBlocks(body.contentJson);
  const visuals = visualsFromContent(blocks);
  const { outline, truncated } = buildDeckSource(body.contentJson, visuals);
  const preferredTheme = inferDeckTheme(blocks);

  if (outline.trim().length === 0) {
    return {
      ok: false,
      status: 400,
      message: "`contentJson` does not contain any usable outline content.",
    };
  }
  // Reject oversized input BEFORE any LLM call.
  if (outline.length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      status: 413,
      message: formatDeckInputTooLongError(outline.length),
    };
  }

  return {
    ok: true,
    payload: {
      contentJson: body.contentJson,
      options: parsedOptions.options,
      blocks,
      visuals,
      outline,
      truncated,
      preferredTheme,
    },
  };
}

type DeckGenerationResult = Awaited<ReturnType<typeof runDeckGeneration>>;

const handleGenerateDeck = createGenerationRouteHandler<
  GenerateDeckPayload,
  DeckGenerationResult
>({
  logScope: LOG_SCOPE,
  operation: "generate-deck",
  rateLimitSubjects: {
    user: "gen-deck-user",
    anonymousIp: "gen-deck-anon-ip",
  },
  anonymousQuotaExceededMessage:
    "You've used all your free generations. Sign in to keep creating decks.",
  unexpectedErrorMessage: "Unexpected error while generating the deck.",
  azureMaxOutputTokens: DECK_OUTPUT_TOKEN_BUDGET,
  parsePayload,
  creditText: (payload) => payload.outline,
  generate: ({ payload, complete }) =>
    runDeckGeneration({
      contentJson: payload.contentJson,
      visuals: payload.visuals,
      complete,
      options: payload.options,
      preferredTheme: payload.preferredTheme,
    }),
  successResponse: ({ deck }, { payload }) =>
    NextResponse.json({ deck, truncated: payload.truncated }),
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
          "We couldn't generate a deck from that document. Please try again.",
        log: { reason: "generation-failed", status: 502 },
      };
    }
    return null;
  },
  onSuccess: ({ deck }, { payload, requestId, latencyMs }) => {
    try {
      const metrics = computeDeckMetrics(deck, {
        sourceWordCount: countWords(payload.outline),
      });
      logInfo(LOG_SCOPE, "deck-generated", {
        requestId,
        latencyMs,
        outlineChars: payload.outline.length,
        outlineWords: metrics.sourceWordCount ?? 0,
        slideCount: metrics.slideCount,
        wordsPerSlide: metrics.wordsPerSlide,
        percentSlidesWithVisual: metrics.percentSlidesWithVisual,
        schemaValid: metrics.schemaValid,
        truncated: payload.truncated,
      });
    } catch {
      // Metrics logging is best-effort and must never affect the response.
    }
  },
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Disabled-by-default feature flag: bail out BEFORE doing any work so the
  // route is invisible until an operator opts in.
  if (!isAiDeckGenEnabled()) {
    return errorResponse(404, "Not found.");
  }

  return handleGenerateDeck(request);
}
