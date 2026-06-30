import { buildPackageTemplateDeckMessages } from "@/lib/ai/package-template-deck-prompt";
import {
  repairPackageDeckPlan,
  type RepairedPackageDeckPlan,
} from "@/lib/ai/package-template-deck-plan";
import {
  EmptyInputError,
  GenerationError,
  InputTooLongError,
  MAX_INPUT_CHARS,
  type CompleteFn,
} from "@/lib/ai/generate";
import { runGenerationAttempts } from "@/lib/ai/generation-runner";
import {
  buildDeckGenerationSource,
  type DeckGenerationSource,
} from "@/lib/ai/deck-source";
import type { DeckGenerationOptions } from "@/lib/ai/deck-generation-options";
import { safeParseDeck } from "@/lib/presentation/deck-schema";
import type { Deck } from "@/lib/presentation/deck";
import { materializePackageTemplateDeck } from "@/lib/presentation/package-template-materializer";
import type { ThemePackageId } from "@/lib/presentation/theme-packages";
import type { Visual } from "@/lib/visual/schema";

const DEFAULT_MAX_ATTEMPTS = 2;

export interface RunPackageTemplateDeckGenerationInput {
  contentJson: unknown;
  visuals: ReadonlyMap<string, Visual>;
  baseDeck: Deck;
  packageId: ThemePackageId;
  complete: CompleteFn;
  source?: DeckGenerationSource;
  options?: DeckGenerationOptions;
  maxAttempts?: number;
}

export interface RunPackageTemplateDeckGenerationResult {
  deck: Deck;
  truncated: boolean;
  selectedKindCounts: Record<string, number>;
}

export async function runPackageTemplateDeckGeneration(
  input: RunPackageTemplateDeckGenerationInput,
): Promise<RunPackageTemplateDeckGenerationResult> {
  const source =
    input.source ?? buildDeckGenerationSource(input.contentJson, input.visuals);
  const outline = source.outline.trim();
  if (!outline) throw new EmptyInputError();
  if (outline.length > MAX_INPUT_CHARS) {
    throw new InputTooLongError(outline.length);
  }

  const plan = await runGenerationAttempts<
    RepairedPackageDeckPlan,
    RepairedPackageDeckPlan
  >({
    pipeline: "deck",
    maxAttempts: Math.max(1, input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS),
    initialFailureReason:
      "The AI did not return a valid package-template deck plan.",
    complete: input.complete,
    buildMessages: (retryReason) =>
      buildPackageTemplateDeckMessages({
        outline,
        packageId: input.packageId,
        visualInventory: source.visualInventory,
        ...(input.options !== undefined ? { options: input.options } : {}),
        ...(retryReason !== undefined ? { retryReason } : {}),
      }),
    repair: (parsed) => {
      const repaired = repairPackageDeckPlan(parsed, source.visualInventory);
      return repaired
        ? {
            success: true,
            data: repaired,
            meta: {
              slideCount: repaired.slides.length,
              inventoryCount: source.visualInventory.length,
            },
          }
        : {
            success: false,
            reason: "The AI response was not a valid package-template plan.",
            meta: { inventoryCount: source.visualInventory.length },
          };
    },
    validate: (repaired) => ({ success: true, data: repaired }),
    makeServiceError: (reason, cause) =>
      new GenerationError(`The AI service could not be reached: ${reason}`, {
        cause,
      }),
    makeFinalError: (attempts, lastReason) =>
      new GenerationError(
        `Could not generate a valid package-template deck plan after ${attempts} attempt(s). ${lastReason}`,
      ),
  });

  const materialized = materializePackageTemplateDeck({
    baseDeck: input.baseDeck,
    packageId: input.packageId,
    plan,
  });
  if (!materialized) {
    throw new GenerationError("Could not materialize package-template deck.");
  }
  const parsed = safeParseDeck(materialized);
  if (!parsed.success) {
    throw new GenerationError(parsed.error);
  }
  return {
    deck: parsed.data,
    truncated: source.truncated,
    selectedKindCounts: plan.selectedKindCounts,
  };
}
