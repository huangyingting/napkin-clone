/**
 * Deterministic stage labels for AI visual generation (issue #73).
 *
 * This module is intentionally free of React / DOM dependencies so it can be
 * unit-tested with `node --test` and reused across every call site.
 *
 * The `getStageLabel` function is a pure function: given the number of
 * milliseconds elapsed since generation started, it returns the descriptive
 * label for the current phase of the LLM pipeline.
 */

export type GenerationStage = {
  /** Human-readable label shown in the UI during this phase. */
  label: string;
  /** Elapsed ms at which this stage becomes active (inclusive lower bound). */
  from: number;
};

/**
 * Ordered stage sequence, tuned to realistic LLM pipeline phases.
 * Must be sorted by ascending `from` values.
 */
export const GENERATION_STAGES: readonly GenerationStage[] = [
  { label: "Analysing text…", from: 0 },
  { label: "Building structure…", from: 3_000 },
  { label: "Finishing…", from: 9_000 },
] as const;

/** ETA hint shown on the first generation of the session (or on hover). */
export const ETA_HINT = "~10–15 s";

/**
 * Returns the current stage label based on elapsed time since generation
 * started.
 *
 * This is a pure function — no side effects, no React, fully unit-testable.
 *
 * @param elapsedMs - Milliseconds elapsed since the generation request began.
 * @returns The label for the latest stage whose `from` threshold has been met.
 */
export function getStageLabel(elapsedMs: number): string {
  let current: GenerationStage = GENERATION_STAGES[0];
  for (const stage of GENERATION_STAGES) {
    if (elapsedMs >= stage.from) {
      current = stage;
    }
  }
  return current.label;
}
