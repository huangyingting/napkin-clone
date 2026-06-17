/**
 * Core text → visual generation logic (US-010).
 *
 * This module is intentionally free of any network or framework dependencies:
 * the LLM call is injected as a `complete` function so the logic can be unit
 * tested deterministically. The route handler wires in the real Azure client.
 *
 * Responsibilities:
 *   - reject empty input and input longer than {@link MAX_INPUT_CHARS} BEFORE
 *     calling the model,
 *   - ask the model for `>= MIN_CANDIDATES` visuals,
 *   - tolerate code fences / surrounding prose when extracting JSON,
 *   - validate every candidate against the canonical visual schema,
 *   - retry on garbled / insufficient output and, when retries are exhausted,
 *     throw a {@link GenerationError} with a clear message.
 */

import { buildGenerationMessages, type ChatMessage } from "@/lib/ai/prompt";
import {
  safeParseVisual,
  type Visual,
  type VisualKind,
} from "@/lib/visual/schema";

/** Maximum accepted input length; longer text is rejected before any LLM call. */
export const MAX_INPUT_CHARS = 10_000;

/** Minimum number of valid candidate visuals a generation must yield. */
export const MIN_CANDIDATES = 3;

/** Upper bound on returned candidates to keep responses small. */
export const MAX_CANDIDATES = 6;

/** Default number of LLM attempts (the first try plus retries). */
export const DEFAULT_MAX_ATTEMPTS = 2;

/** Thrown when the input text is empty/blank. */
export class EmptyInputError extends Error {
  constructor() {
    super("Input text is required.");
    this.name = "EmptyInputError";
  }
}

/** Thrown when the input text exceeds {@link MAX_INPUT_CHARS}. */
export class InputTooLongError extends Error {
  readonly length: number;
  readonly limit: number;
  constructor(length: number) {
    super(
      `Input text is too long (${length} characters). The maximum is ${MAX_INPUT_CHARS}.`,
    );
    this.name = "InputTooLongError";
    this.length = length;
    this.limit = MAX_INPUT_CHARS;
  }
}

/** Thrown when the model cannot produce enough valid candidates. */
export class GenerationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GenerationError";
  }
}

/** A function that performs one chat completion and returns the raw content. */
export type CompleteFn = (messages: ChatMessage[]) => Promise<string>;

export interface GenerateInput {
  text: string;
  /** Optional desired visual type. */
  type?: VisualKind;
  /** Override the minimum number of candidates requested. */
  count?: number;
}

export interface GenerateDeps {
  complete: CompleteFn;
  /** First attempt + retries. Defaults to {@link DEFAULT_MAX_ATTEMPTS}. */
  maxAttempts?: number;
  /** Minimum valid candidates required. Defaults to {@link MIN_CANDIDATES}. */
  minCandidates?: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

/** Normalizes a parsed payload into an array of candidate visual objects. */
export function coerceCandidates(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (isPlainObject(parsed)) {
    for (const key of ["visuals", "candidates", "options", "results"]) {
      const value = parsed[key];
      if (Array.isArray(value)) {
        return value;
      }
    }
    // A bare single-visual object.
    if ("nodes" in parsed || "type" in parsed) {
      return [parsed];
    }
  }
  return [];
}

/** Puts candidates matching `type` first while preserving relative order. */
function preferType(candidates: Visual[], type: VisualKind): Visual[] {
  const matching = candidates.filter((visual) => visual.type === type);
  const rest = candidates.filter((visual) => visual.type !== type);
  return [...matching, ...rest];
}

/**
 * Turns text into `>= minCandidates` validated {@link Visual} candidates.
 *
 * @throws {EmptyInputError} when the text is blank.
 * @throws {InputTooLongError} when the text exceeds {@link MAX_INPUT_CHARS}.
 * @throws {GenerationError} when no valid set of candidates can be produced.
 */
export async function generateVisuals(
  input: GenerateInput,
  deps: GenerateDeps,
): Promise<Visual[]> {
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (!text) {
    throw new EmptyInputError();
  }
  if (text.length > MAX_INPUT_CHARS) {
    throw new InputTooLongError(text.length);
  }

  const minCandidates = deps.minCandidates ?? MIN_CANDIDATES;
  const maxAttempts = Math.max(1, deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const requested = Math.max(minCandidates, input.count ?? minCandidates);

  let lastReason = "The AI did not return any valid visuals.";

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const messages = buildGenerationMessages({
      text,
      type: input.type,
      count: requested,
      retryReason: attempt > 0 ? lastReason : undefined,
    });

    let raw: string;
    try {
      raw = await deps.complete(messages);
    } catch (error) {
      // A hard service/transport failure is not retried here; surface it.
      const reason = error instanceof Error ? error.message : String(error);
      throw new GenerationError(
        `The AI service could not be reached: ${reason}`,
        { cause: error },
      );
    }

    const parsed = extractJson(raw);
    if (parsed === undefined) {
      lastReason = "The AI response was not valid JSON.";
      continue;
    }

    const rawCandidates = coerceCandidates(parsed);
    const valid: Visual[] = [];
    for (const candidate of rawCandidates) {
      const result = safeParseVisual(candidate);
      if (result.success) {
        valid.push(result.data);
      }
    }

    if (valid.length >= minCandidates) {
      const ordered = input.type ? preferType(valid, input.type) : valid;
      return ordered.slice(0, MAX_CANDIDATES);
    }

    lastReason =
      rawCandidates.length === 0
        ? "The AI response contained no visuals."
        : `Only ${valid.length} of ${rawCandidates.length} visuals were valid (need ${minCandidates}).`;
  }

  throw new GenerationError(
    `Could not generate ${minCandidates} valid visuals after ${maxAttempts} attempt(s). ${lastReason}`,
  );
}
