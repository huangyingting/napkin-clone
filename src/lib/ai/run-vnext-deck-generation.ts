/**
 * vNext (v7) deck generation pipeline.
 *
 * Produces a `DeckV7` from AI output via:
 *   AiDeckPlanV1 → repairAiDeckPlan → compileSlide (per slide) → DeckV7
 *
 * This module does NOT materialise v6 element trees. The output is always a
 * valid `DeckV7` ready for `safeParseDeckV7`, render resolution, and export.
 *
 * Migration note: the v6 path (`runPackageTemplateDeckGeneration`) is
 * intentionally untouched. Switch the API route to this module once the
 * frontend cutover (Switch) is complete.
 */

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
import { buildVnextDeckMessages } from "@/lib/ai/vnext-deck-prompt";
import type { Visual } from "@/lib/visual/schema";
import { repairAiDeckPlan } from "@/lib/presentation-vnext/ai-plan-repair";
import { compileSlide } from "@/lib/presentation-vnext/template-compiler";
import { createDefaultTemplateRegistry } from "@/lib/presentation-vnext/theme-packages";
import { safeParseDeckV7 } from "@/lib/presentation-vnext/validation";
import { DECK_SCHEMA_VERSION_V7 } from "@/lib/presentation-vnext/schema";
import type { DeckV7, SlideNode } from "@/lib/presentation-vnext/schema";
import type { CanvasSpec } from "@/lib/presentation-vnext/types";
import type { PresentationDiagnostic } from "@/lib/presentation-vnext/diagnostics";
import type { AiDeckPlanV1 } from "@/lib/presentation-vnext/ai-plan-schema";

const DEFAULT_MAX_ATTEMPTS = 2;

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

export interface RunVnextDeckGenerationInput {
  contentJson: unknown;
  visuals: ReadonlyMap<string, Visual>;
  themePackageId: string;
  complete: CompleteFn;
  /** Pre-built source; if omitted it is derived from contentJson + visuals. */
  source?: DeckGenerationSource;
  options?: DeckGenerationOptions;
  /** Canvas spec for the generated deck. Defaults to 16:9. */
  canvas?: CanvasSpec;
  maxAttempts?: number;
}

export interface RunVnextDeckGenerationResult {
  deck: DeckV7;
  truncated: boolean;
  selectedKindCounts: Record<string, number>;
  /** Diagnostics collected during repair + compile. */
  diagnostics: PresentationDiagnostic[];
}

// ---------------------------------------------------------------------------
// Default canvas
// ---------------------------------------------------------------------------

const DEFAULT_CANVAS: CanvasSpec = {
  format: "16:9",
  width: 100,
  height: 56.25,
  unit: "percent",
};

// ---------------------------------------------------------------------------
// Repaired plan shape (returned from runGenerationAttempts)
// ---------------------------------------------------------------------------

interface RepairedVnextPlan {
  plan: AiDeckPlanV1;
  diagnostics: PresentationDiagnostic[];
  selectedKindCounts: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Runs the vNext AI generation pipeline:
 *   1. Extracts an outline + visual inventory from the document.
 *   2. Calls the AI with a semantic-template prompt.
 *   3. Repairs the raw AI response with `repairAiDeckPlan`.
 *   4. Compiles each slide spec into a `SlideNode` tree.
 *   5. Assembles and validates a `DeckV7`.
 *
 * Throws `EmptyInputError`, `InputTooLongError`, or `GenerationError` on
 * unrecoverable failures.
 */
export async function runVnextDeckGeneration(
  input: RunVnextDeckGenerationInput,
): Promise<RunVnextDeckGenerationResult> {
  const source =
    input.source ?? buildDeckGenerationSource(input.contentJson, input.visuals);

  const outline = source.outline.trim();
  if (!outline) throw new EmptyInputError();
  if (outline.length > MAX_INPUT_CHARS) {
    throw new InputTooLongError(outline.length);
  }

  const registry = createDefaultTemplateRegistry();

  const repairedPlan = await runGenerationAttempts<
    RepairedVnextPlan,
    RepairedVnextPlan
  >({
    pipeline: "deck",
    maxAttempts: Math.max(1, input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS),
    initialFailureReason:
      "The AI did not return a valid v7 semantic deck plan.",
    complete: input.complete,
    buildMessages: (retryReason) =>
      buildVnextDeckMessages({
        outline,
        themePackageId: input.themePackageId,
        visualInventory: source.visualInventory,
        ...(input.options !== undefined ? { options: input.options } : {}),
        ...(retryReason !== undefined ? { retryReason } : {}),
      }),
    repair: (parsed) => {
      const result = repairAiDeckPlan(parsed, registry);
      const hasFatal = result.diagnostics.some(
        (d) => d.severity === "fatal" || d.severity === "error",
      );
      if (hasFatal || result.plan.slides.length === 0) {
        return {
          success: false,
          reason: "The AI response was not a valid v7 semantic deck plan.",
          meta: { slideCount: result.plan.slides.length },
        };
      }
      const selectedKindCounts: Record<string, number> = {};
      for (const slide of result.plan.slides) {
        selectedKindCounts[slide.kind] =
          (selectedKindCounts[slide.kind] ?? 0) + 1;
      }
      return {
        success: true,
        data: {
          plan: result.plan,
          diagnostics: result.diagnostics,
          selectedKindCounts,
        },
        meta: { slideCount: result.plan.slides.length },
      };
    },
    validate: (repaired) => ({ success: true, data: repaired }),
    makeServiceError: (reason, cause) =>
      new GenerationError(`The AI service could not be reached: ${reason}`, {
        cause,
      }),
    makeFinalError: (attempts, lastReason) =>
      new GenerationError(
        `Could not generate a valid v7 deck plan after ${attempts} attempt(s). ${lastReason}`,
      ),
  });

  // Compile each slide spec into a SlideNode tree
  const compiledSlides: SlideNode[] = [];
  const allDiagnostics: PresentationDiagnostic[] = [
    ...repairedPlan.diagnostics,
  ];

  for (let i = 0; i < repairedPlan.plan.slides.length; i++) {
    const spec = repairedPlan.plan.slides[i];
    const template = registry.get(spec.kind);
    if (!template) {
      // Should not happen after repair; use content as fallback
      const fallback = registry.get("content")!;
      const { slide, diagnostics } = compileSlide(spec, fallback, i);
      compiledSlides.push(slide);
      allDiagnostics.push(...diagnostics);
    } else {
      const { slide, diagnostics } = compileSlide(spec, template, i);
      compiledSlides.push(slide);
      allDiagnostics.push(...diagnostics);
    }
  }

  if (compiledSlides.length === 0) {
    throw new GenerationError("Template compiler produced no slides.");
  }

  const canvas = input.canvas ?? DEFAULT_CANVAS;
  const rawDeck: DeckV7 = {
    schemaVersion: DECK_SCHEMA_VERSION_V7,
    canvas,
    theme: { packageId: input.themePackageId },
    assets: { images: {} },
    slides: compiledSlides,
    ...(repairedPlan.plan.title ? { title: repairedPlan.plan.title } : {}),
    metadata: {
      createdAt: new Date().toISOString(),
      ...(repairedPlan.plan.locale ? { locale: repairedPlan.plan.locale } : {}),
    },
  };

  const parsed = safeParseDeckV7(rawDeck);
  if (!parsed.success) {
    const errors = parsed.success === false ? parsed.errors : [];
    throw new GenerationError(
      `Generated deck failed v7 validation: ${errors.join("; ")}`,
    );
  }

  return {
    deck: parsed.data,
    truncated: source.truncated,
    selectedKindCounts: repairedPlan.selectedKindCounts,
    diagnostics: allDiagnostics,
  };
}
