import { computeDeckMetrics, countWords } from "@/lib/ai/deck-metrics";
import type { CompleteFn } from "@/lib/ai/generate";
import { isAiDeckGenPackageTemplatesEnabled } from "@/lib/ai/config";
import {
  runDeckGeneration,
  type RunDeckGenerationInput,
  type RunDeckGenerationResult,
} from "@/lib/ai/run-deck-generation";
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

export type GenerateDeckMode = "legacy" | "package-template";

export interface GenerateDeckRouteResult {
  deck: Deck;
  truncated: boolean;
  requestedGenerationMode: GenerateDeckMode;
  generationMode: GenerateDeckMode;
  themePackageId?: ThemePackageId;
  selectedKindCounts?: Record<string, number>;
  fallbackReason?: string;
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
  isPackageTemplatesEnabled(): boolean;
  runLegacy(input: RunDeckGenerationInput): Promise<RunDeckGenerationResult>;
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
  isPackageTemplatesEnabled: isAiDeckGenPackageTemplatesEnabled,
  runLegacy: runDeckGeneration,
  runPackageTemplate: runPackageTemplateDeckGeneration,
  buildBaseDeck: (payload) => {
    const baseline = buildDeckFromBlocks([...payload.blocks], "indigo");
    return stampDeckContentHash(baseline, computeDeckContentHash(baseline));
  },
  logInfo,
};

function fallbackReason(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function requestedGenerationMode(
  payload: GenerateDeckPayload,
): GenerateDeckMode {
  return payload.generationMode ?? "legacy";
}

export async function generateDeckForRoute(
  input: {
    payload: GenerateDeckPayload;
    complete: CompleteFn;
    requestId?: string;
  },
  overrides: Partial<GenerateDeckRouteDeps> = {},
): Promise<GenerateDeckRouteResult> {
  const deps = { ...defaultDeps, ...overrides };
  const { payload, complete, requestId } = input;
  const requestedMode = requestedGenerationMode(payload);

  const runLegacy = async (
    reason?: string,
  ): Promise<GenerateDeckRouteResult> => {
    const result = await deps.runLegacy({
      contentJson: payload.contentJson,
      visuals: payload.visuals,
      complete,
      options: payload.options,
      preferredTheme: payload.preferredTheme,
    });
    return {
      deck: result.deck,
      truncated: result.truncated,
      requestedGenerationMode: requestedMode,
      generationMode: "legacy",
      ...(payload.themePackageId
        ? { themePackageId: payload.themePackageId }
        : {}),
      ...(reason ? { fallbackReason: reason } : {}),
    };
  };

  if (
    payload.generationMode === "package-template" &&
    payload.themePackageId &&
    deps.isPackageTemplatesEnabled()
  ) {
    try {
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
    } catch (error) {
      const reason = fallbackReason(error);
      deps.logInfo(GENERATE_DECK_LOG_SCOPE, "package-template-fallback", {
        requestId,
        reason,
        packageId: payload.themePackageId,
      });
      return runLegacy(reason);
    }
  }

  return runLegacy();
}

export function countTableSlides(deck: Deck): number {
  let count = 0;
  for (const slide of deck.slides) {
    const elements = Array.isArray(slide.elements) ? slide.elements : [];
    if (elements.some((element: SlideElement) => element.kind === "table")) {
      count += 1;
    }
  }
  return count;
}

export function buildGenerateDeckResponseMetadata(
  result: GenerateDeckRouteResult,
  schemaValid: boolean,
): GenerateDeckResponseMetadata {
  return {
    requestedGenerationMode: result.requestedGenerationMode,
    generationMode: result.generationMode,
    fallback: result.fallbackReason !== undefined,
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
    fallback: result.fallbackReason !== undefined,
    ...(result.themePackageId ? { packageId: result.themePackageId } : {}),
    ...(result.selectedKindCounts
      ? { selectedKindCounts: result.selectedKindCounts }
      : {}),
    ...(result.fallbackReason ? { fallbackReason: result.fallbackReason } : {}),
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
