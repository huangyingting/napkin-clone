import {
  ERROR_CODES,
  buildDiagnostic,
  logDiagnostic,
  type DiagnosticRecord,
} from "@/lib/diagnostics/error-codes";
import redaction from "@/lib/log-redaction-core.cjs";

export const GENERATION_FAILURE_STAGES = [
  "json-extract",
  "repair",
  "validation",
] as const;

export type GenerationFailureStage = (typeof GENERATION_FAILURE_STAGES)[number];

export interface GenerationFailureContext {
  pipeline: "visual" | "deck";
  stage: GenerationFailureStage;
  attempt: number;
  maxAttempts: number;
  reason?: string;
  rawCandidateCount?: number;
  validCandidateCount?: number;
  minCandidateCount?: number;
  slideCount?: number;
  inventoryCount?: number;
}

function safeMeta(
  context: GenerationFailureContext,
): Record<string, string | number | boolean> {
  return redaction.buildSafeTelemetryContext({
    pipeline: context.pipeline,
    stage: context.stage,
    attempt: context.attempt + 1,
    maxAttempts: context.maxAttempts,
    reason: context.reason,
    rawCandidateCount: context.rawCandidateCount,
    validCandidateCount: context.validCandidateCount,
    minCandidateCount: context.minCandidateCount,
    slideCount: context.slideCount,
    inventoryCount: context.inventoryCount,
  }) as Record<string, string | number | boolean>;
}

export function buildGenerationFailureDiagnostic(
  context: GenerationFailureContext,
): DiagnosticRecord {
  return buildDiagnostic(
    ERROR_CODES.AI_GENERATION_REPAIR_FAILED,
    `ai.generation.${context.pipeline}`,
    "AI model output failed extraction, repair, or validation.",
    safeMeta(context),
  );
}

export function reportGenerationFailure(
  context: GenerationFailureContext,
): void {
  logDiagnostic(buildGenerationFailureDiagnostic(context));
}
