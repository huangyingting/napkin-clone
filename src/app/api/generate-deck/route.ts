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

import { computeDeckMetrics, countWords } from "@/lib/ai/deck-metrics";
import { DECK_OUTPUT_TOKEN_BUDGET } from "@/lib/limits";
import { createGenerationRouteHandler } from "@/lib/ai/generation-route";
import { notFound } from "@/lib/api/errors";
import { runDeckGeneration } from "@/lib/ai/run-deck-generation";
import {
  isAiDeckGenEnabled,
  isAiDeckGenPackageTemplatesEnabled,
} from "@/lib/ai/config";
import { runPackageTemplateDeckGeneration } from "@/lib/ai/run-package-template-deck-generation";
import { buildDeckFromBlocks } from "@/lib/presentation/deck";
import {
  computeDeckContentHash,
  stampDeckContentHash,
} from "@/lib/presentation/deck-hash";
import { logInfo } from "@/lib/log";

import {
  mapGenerateDeckError,
  parseGenerateDeckPayload,
  type GenerateDeckPayload,
} from "./parser";

// Use the Node.js runtime: the Azure call and node:crypto signing need it.
export const runtime = "nodejs";

/** Scope tag for structured error logs from this route. */
const LOG_SCOPE = "api.generate-deck";

type DeckGenerationResult = Awaited<ReturnType<typeof runDeckGeneration>>;

const handleGenerateDeck = createGenerationRouteHandler<
  GenerateDeckPayload,
  DeckGenerationResult
>({
  logScope: LOG_SCOPE,
  operation: "generate-deck",
  rateLimitSubjects: {
    user: "ai.deck.user",
    anonymousIp: "ai.deck.anonymous-ip",
  },
  anonymousQuotaExceededMessage:
    "You've used all your free generations. Sign in to keep creating decks.",
  unexpectedErrorMessage: "Unexpected error while generating the deck.",
  azureMaxOutputTokens: DECK_OUTPUT_TOKEN_BUDGET,
  parsePayload: parseGenerateDeckPayload,
  creditText: (payload) => payload.outline,
  generate: async ({ payload, complete }) => {
    const runLegacy = () =>
      runDeckGeneration({
        contentJson: payload.contentJson,
        visuals: payload.visuals,
        complete,
        options: payload.options,
        preferredTheme: payload.preferredTheme,
      });
    if (
      payload.generationMode === "package-template" &&
      payload.themePackageId &&
      isAiDeckGenPackageTemplatesEnabled()
    ) {
      try {
        const baseline = buildDeckFromBlocks(payload.blocks as any, "indigo");
        const baseDeck = stampDeckContentHash(
          baseline,
          computeDeckContentHash(baseline),
        );
        return await runPackageTemplateDeckGeneration({
          contentJson: payload.contentJson,
          visuals: payload.visuals,
          baseDeck,
          packageId: payload.themePackageId,
          complete,
          options: payload.options,
        });
      } catch (error) {
        logInfo(LOG_SCOPE, "package-template-fallback", {
          reason: error instanceof Error ? error.message : String(error),
          packageId: payload.themePackageId,
        });
        return runLegacy();
      }
    }
    return runLegacy();
  },
  successResponse: ({ deck }, { payload }) =>
    NextResponse.json({ deck, truncated: payload.truncated }),
  mapGenerationError: mapGenerateDeckError,
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
    return notFound("Not found.");
  }

  return handleGenerateDeck(request);
}
