/**
 * DOM-free request-shaping, response-parsing, and error-classification helpers
 * for the AI "document → presentation Deck" generation request (issue #268).
 *
 * Kept React-/DOM-free (no `"use client"`, no `react` import) so it can be
 * exercised headlessly under `node --test`, mirroring how
 * `@/lib/visual/generate` separates its pure helpers + `requestVisualCandidates`
 * with an injectable `fetch`. The React hook layer lives in
 * `@/lib/ai/use-deck-generation`.
 */

import type { DeckGenerationOptions } from "@/lib/ai/deck-prompt";
import { safeParseDeck } from "@/lib/presentation/deck-schema";
import type { Deck } from "@/lib/presentation/deck";

export type { DeckGenerationOptions } from "@/lib/ai/deck-prompt";

/**
 * Classifies a failed deck-generation request:
 * - `network`  — the request never reached the server (fetch threw).
 * - `timeout`  — the request was aborted or the server returned 504.
 * - `credit`   — insufficient credits / quota (402).
 * - `unavailable` — the feature flag is OFF server-side (404): the caller
 *   should silently fall back to the deterministic derive path.
 * - `empty`    — the document has no usable outline content (400): the caller
 *   should show a friendly "add some content first" message rather than a
 *   generic error (issue #280).
 * - `other`    — any other non-OK status or an unparseable response.
 */
export type DeckGenerateErrorKind =
  | "network"
  | "timeout"
  | "credit"
  | "unavailable"
  | "empty"
  | "other";

/** A user-facing error plus its classification. */
export interface DeckGenerateError {
  message: string;
  kind: DeckGenerateErrorKind;
}

/** Result of a deck-generation request: a usable deck or a classified error. */
export type DeckGenerateResult =
  | { ok: true; deck: Deck; truncated: boolean }
  | { ok: false; error: string; errorKind: DeckGenerateErrorKind };

const FALLBACK_REQUEST_ERROR =
  "We couldn't generate a deck from that document. Please try again.";
const UNAVAILABLE_ERROR = "AI deck generation isn't available right now.";
const TIMEOUT_ERROR = "The AI took too long to respond. Please try again.";
const NETWORK_ERROR =
  "Couldn't reach the generator. Check your connection and try again.";
const BAD_PAYLOAD_ERROR =
  "The generator returned an unexpected response. Please try again.";
/** Shown when the document has no usable outline content yet (issue #280). */
export const EMPTY_CONTENT_ERROR =
  "Add some content to your document first, then generate slides.";

/**
 * Marker substring of the route's empty-outline 400 message
 * ("`contentJson` does not contain any usable outline content."). Matched
 * loosely so the empty-document case is classified distinctly from generic
 * 400s (issue #280).
 */
const EMPTY_OUTLINE_MARKER = "does not contain any usable outline content";

/** True when a 400 payload is the route's empty-outline rejection. */
function isEmptyOutline400(payload: unknown): boolean {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error: unknown }).error;
    return typeof error === "string" && error.includes(EMPTY_OUTLINE_MARKER);
  }
  return false;
}

/** Pull a string `error` field off a JSON payload, falling back when absent. */
export function messageFrom(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error: unknown }).error;
    if (typeof error === "string" && error.trim().length > 0) {
      return error;
    }
  }
  return fallback;
}

/**
 * Build the `/api/generate-deck` request body from the live document content and
 * the optional length/tone/audience tuning. Blank/whitespace-only tone and
 * audience values are omitted, and the `options` object is only included when at
 * least one knob is set — mirroring how `buildGenerateBody` omits unset knobs.
 */
export function buildDeckGenerationBody(
  contentJson: unknown,
  options: DeckGenerationOptions = {},
): Record<string, unknown> {
  const opts: Record<string, unknown> = {};
  if (options.length) opts.length = options.length;
  if (typeof options.tone === "string" && options.tone.trim().length > 0) {
    opts.tone = options.tone.trim();
  }
  if (
    typeof options.audience === "string" &&
    options.audience.trim().length > 0
  ) {
    opts.audience = options.audience.trim();
  }
  const body: Record<string, unknown> = { contentJson };
  if (Object.keys(opts).length > 0) {
    body.options = opts;
  }
  return body;
}

/**
 * Validate a `{ deck, truncated }` response payload. Returns the parsed deck and
 * the `truncated` flag, or `null` when the payload is missing/invalid. The deck
 * is validated through {@link safeParseDeck} so only a schema-valid deck (the
 * same contract the open path expects) is ever surfaced.
 */
export function parseDeckResponse(
  payload: unknown,
): { deck: Deck; truncated: boolean } | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const result = safeParseDeck((payload as { deck?: unknown }).deck);
  if (!result.success) {
    return null;
  }
  return {
    deck: result.data,
    truncated: (payload as { truncated?: unknown }).truncated === true,
  };
}

/** True when a thrown fetch error is an abort (client cancel or timeout). */
function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

/**
 * POST the document `contentJson` + tuning options to `/api/generate-deck` and
 * return a parsed deck or a classified error. This is the ONE place the fetch +
 * status/error handling lives. `fetchImpl` is injectable for tests, and an
 * optional `signal` supports cancellation/timeout.
 */
export async function requestDeckGeneration(
  contentJson: unknown,
  options: DeckGenerationOptions = {},
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<DeckGenerateResult> {
  let response: Response;
  try {
    response = await fetchImpl("/api/generate-deck", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildDeckGenerationBody(contentJson, options)),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      return { ok: false, error: TIMEOUT_ERROR, errorKind: "timeout" };
    }
    return { ok: false, error: NETWORK_ERROR, errorKind: "network" };
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 404) {
      return {
        ok: false,
        error: messageFrom(payload, UNAVAILABLE_ERROR),
        errorKind: "unavailable",
      };
    }
    if (response.status === 402) {
      return {
        ok: false,
        error: messageFrom(payload, FALLBACK_REQUEST_ERROR),
        errorKind: "credit",
      };
    }
    if (response.status === 504) {
      return {
        ok: false,
        error: messageFrom(payload, TIMEOUT_ERROR),
        errorKind: "timeout",
      };
    }
    if (response.status === 400 && isEmptyOutline400(payload)) {
      return {
        ok: false,
        error: EMPTY_CONTENT_ERROR,
        errorKind: "empty",
      };
    }
    return {
      ok: false,
      error: messageFrom(payload, FALLBACK_REQUEST_ERROR),
      errorKind: "other",
    };
  }

  const parsed = parseDeckResponse(payload);
  if (!parsed) {
    return { ok: false, error: BAD_PAYLOAD_ERROR, errorKind: "other" };
  }
  return { ok: true, deck: parsed.deck, truncated: parsed.truncated };
}
