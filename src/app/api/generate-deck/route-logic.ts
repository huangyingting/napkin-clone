import { computeDeckMetrics, countWords } from "@/lib/ai/deck-metrics";
import type { CompleteFn } from "@/lib/ai/generate";
import {
  runPackageTemplateDeckGeneration,
  type RunPackageTemplateDeckGenerationInput,
  type RunPackageTemplateDeckGenerationResult,
} from "@/lib/ai/run-package-template-deck-generation";
import {
  buildDeckFromBlocks,
  type Deck,
  type SlideElement,
} from "@/lib/presentation/deck";
import {
  computeDeckContentHash,
  stampDeckContentHash,
} from "@/lib/presentation/deck-hash";
import type { ThemePackageId } from "@/lib/presentation/theme-packages";
import { logInfo } from "@/lib/log";

import type { GenerateDeckPayload } from "./parser";

export const GENERATE_DECK_LOG_SCOPE = "api.generate-deck";

export type GenerateDeckMode = "package-template";

export interface GenerateDeckRouteResult {
  deck: Deck;
  truncated: boolean;
  requestedGenerationMode: GenerateDeckMode;
  generationMode: GenerateDeckMode;
  themePackageId?: ThemePackageId;
  selectedKindCounts?: Record<string, number>;
}

export interface GenerateDeckResponseMetadata {
  requestedGenerationMode: GenerateDeckMode;
  generationMode: GenerateDeckMode;
  fallback: boolean;
  tableSlideCount: number;
  schemaValid: boolean;
  themePackageId?: ThemePackageId;
  selectedKindCounts?: Record<string, number>;
}

export interface GenerateDeckRouteDeps {
  runPackageTemplate(
    input: RunPackageTemplateDeckGenerationInput,
  ): Promise<RunPackageTemplateDeckGenerationResult>;
  buildBaseDeck(payload: GenerateDeckPayload): Deck;
  logInfo(
    scope: string,
    message: string,
    context?: Record<string, unknown>,
  ): void;
}

const defaultDeps: GenerateDeckRouteDeps = {
  runPackageTemplate: runPackageTemplateDeckGeneration,
  buildBaseDeck: (payload) => {
    const baseline = buildDeckFromBlocks([...payload.blocks], "indigo");
    return stampDeckContentHash(baseline, computeDeckContentHash(baseline));
  },
  logInfo,
};

export async function generateDeckForRoute(
  input: {
    payload: GenerateDeckPayload;
    complete: CompleteFn;
    requestId?: string;
  },
  overrides: Partial<GenerateDeckRouteDeps> = {},
): Promise<GenerateDeckRouteResult> {
  const deps = { ...defaultDeps, ...overrides };
  const { payload, complete } = input;
  const requestedMode = payload.generationMode;
  const result = await deps.runPackageTemplate({
    contentJson: payload.contentJson,
    visuals: payload.visuals,
    baseDeck: deps.buildBaseDeck(payload),
    packageId: payload.themePackageId,
    complete,
    options: payload.options,
  });
  return {
    deck: result.deck,
    truncated: result.truncated,
    requestedGenerationMode: requestedMode,
    generationMode: "package-template",
    themePackageId: payload.themePackageId,
    selectedKindCounts: result.selectedKindCounts,
  };
}

function countTableSlides(deck: Deck): number {
  let count = 0;
  for (const slide of deck.slides) {
    const elements = Array.isArray(slide.elements) ? slide.elements : [];
    if (elements.some((element: SlideElement) => element.kind === "table")) {
      count += 1;
    }
  }
  return count;
}

function buildGenerateDeckResponseMetadata(
  result: GenerateDeckRouteResult,
  schemaValid: boolean,
): GenerateDeckResponseMetadata {
  return {
    requestedGenerationMode: result.requestedGenerationMode,
    generationMode: result.generationMode,
    fallback: false,
    tableSlideCount: countTableSlides(result.deck),
    schemaValid,
    ...(result.themePackageId ? { themePackageId: result.themePackageId } : {}),
    ...(result.selectedKindCounts
      ? { selectedKindCounts: result.selectedKindCounts }
      : {}),
  };
}

export function buildGenerateDeckSuccessResponse(
  result: GenerateDeckRouteResult,
): {
  deck: Deck;
  truncated: boolean;
  metadata: GenerateDeckResponseMetadata;
} {
  const metrics = computeDeckMetrics(result.deck);
  return {
    deck: result.deck,
    truncated: result.truncated,
    metadata: buildGenerateDeckResponseMetadata(result, metrics.schemaValid),
  };
}

export function buildGenerateDeckSuccessLogFields(
  result: GenerateDeckRouteResult,
  context: {
    payload: GenerateDeckPayload;
    requestId: string;
    latencyMs: number;
  },
): Record<string, unknown> {
  const metrics = computeDeckMetrics(result.deck, {
    sourceWordCount: countWords(context.payload.outline),
  });
  return {
    requestId: context.requestId,
    latencyMs: context.latencyMs,
    outlineChars: context.payload.outline.length,
    outlineWords: metrics.sourceWordCount ?? 0,
    slideCount: metrics.slideCount,
    wordsPerSlide: metrics.wordsPerSlide,
    percentSlidesWithVisual: metrics.percentSlidesWithVisual,
    schemaValid: metrics.schemaValid,
    truncated: result.truncated,
    requestedGenerationMode: result.requestedGenerationMode,
    generationMode: result.generationMode,
    tableSlideCount: countTableSlides(result.deck),
    fallback: false,
    ...(result.themePackageId ? { packageId: result.themePackageId } : {}),
    ...(result.selectedKindCounts
      ? { selectedKindCounts: result.selectedKindCounts }
      : {}),
  };
}

export function logGenerateDeckSuccess(
  result: GenerateDeckRouteResult,
  context: {
    payload: GenerateDeckPayload;
    requestId: string;
    latencyMs: number;
  },
  logger: GenerateDeckRouteDeps["logInfo"] = logInfo,
): void {
  try {
    logger(
      GENERATE_DECK_LOG_SCOPE,
      "deck-generated",
      buildGenerateDeckSuccessLogFields(result, context),
    );
  } catch {
    // Metrics logging is best-effort and must never affect the response.
  }
}
