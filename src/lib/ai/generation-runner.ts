import type { ChatMessage } from "@/lib/ai/prompt";
import {
  reportGenerationFailure,
  type GenerationFailureContext,
} from "@/lib/ai/generation-diagnostics";

/** A function that performs one chat completion and returns the raw content. */
export type CompleteFn = (messages: ChatMessage[]) => Promise<string>;

export interface AttemptFailureMeta {
  rawCandidateCount?: number;
  validCandidateCount?: number;
  minCandidateCount?: number;
  slideCount?: number;
  inventoryCount?: number;
}

export type AttemptResult<T> =
  | { success: true; data: T; meta?: AttemptFailureMeta }
  | { success: false; reason: string; meta?: AttemptFailureMeta };

export interface GenerationAttemptRunnerOptions<TRepaired, TValidated> {
  pipeline: GenerationFailureContext["pipeline"];
  maxAttempts: number;
  initialFailureReason: string;
  complete: CompleteFn;
  buildMessages: (retryReason: string | undefined) => ChatMessage[];
  repair: (parsed: unknown) => AttemptResult<TRepaired>;
  validate: (repaired: TRepaired) => AttemptResult<TValidated>;
  makeServiceError: (reason: string, cause: unknown) => Error;
  makeFinalError: (maxAttempts: number, lastReason: string) => Error;
  reportFailure?: (context: GenerationFailureContext) => void;
}

/** Strips a single ```...``` / ```json ... ``` fence if the content is wrapped. */
function stripCodeFence(raw: string): string {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match ? match[1] : raw;
}

/**
 * Best-effort extraction of a JSON value from raw model output. Handles code
 * fences and leading/trailing prose by falling back to the first balanced-ish
 * `{...}` or `[...]` slice. Returns `undefined` when nothing parses.
 */
export function extractJson(raw: string): unknown {
  const text = stripCodeFence(raw).trim();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    // fall through to substring extraction
  }

  const candidates: Array<[number, number]> = [];
  const objStart = text.indexOf("{");
  const objEnd = text.lastIndexOf("}");
  if (objStart !== -1 && objEnd > objStart) {
    candidates.push([objStart, objEnd]);
  }
  const arrStart = text.indexOf("[");
  const arrEnd = text.lastIndexOf("]");
  if (arrStart !== -1 && arrEnd > arrStart) {
    candidates.push([arrStart, arrEnd]);
  }

  for (const [start, end] of candidates) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      // try the next candidate slice
    }
  }

  return undefined;
}

function diagnosticContext(
  options: Pick<
    GenerationAttemptRunnerOptions<unknown, unknown>,
    "pipeline" | "maxAttempts"
  >,
  stage: GenerationFailureContext["stage"],
  attempt: number,
  reason: string,
  meta: AttemptFailureMeta = {},
): GenerationFailureContext {
  return {
    pipeline: options.pipeline,
    stage,
    attempt,
    maxAttempts: options.maxAttempts,
    reason,
    ...meta,
  };
}

export async function runGenerationAttempts<TRepaired, TValidated>(
  options: GenerationAttemptRunnerOptions<TRepaired, TValidated>,
): Promise<TValidated> {
  const reportFailure = options.reportFailure ?? reportGenerationFailure;
  let lastReason = options.initialFailureReason;

  for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
    const messages = options.buildMessages(
      attempt > 0 ? lastReason : undefined,
    );

    let raw: string;
    try {
      raw = await options.complete(messages);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw options.makeServiceError(reason, error);
    }

    const parsed = extractJson(raw);
    if (parsed === undefined) {
      lastReason = "The AI response was not valid JSON.";
      reportFailure(
        diagnosticContext(options, "json-extract", attempt, lastReason),
      );
      continue;
    }

    const repaired = options.repair(parsed);
    if (!repaired.success) {
      lastReason = repaired.reason;
      reportFailure(
        diagnosticContext(
          options,
          "repair",
          attempt,
          lastReason,
          repaired.meta,
        ),
      );
      continue;
    }

    const validated = options.validate(repaired.data);
    if (!validated.success) {
      lastReason = validated.reason;
      reportFailure(
        diagnosticContext(
          options,
          "validation",
          attempt,
          lastReason,
          validated.meta,
        ),
      );
      continue;
    }

    return validated.data;
  }

  throw options.makeFinalError(options.maxAttempts, lastReason);
}
