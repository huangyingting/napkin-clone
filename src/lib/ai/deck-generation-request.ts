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

import type { DeckGenerationOptions } from "@/lib/ai/deck-generation-options";
import { apiErrorMessageFromPayload } from "@/lib/api/error-message";
import {
  isThemePackageId,
  type ThemePackageId,
} from "@/lib/presentation/theme-packages";
import { safeParseDeckV7 } from "@/lib/presentation-vnext/validation";
import type { DeckV7 } from "@/lib/presentation-vnext/schema";

export type { DeckGenerationOptions } from "@/lib/ai/deck-generation-options";

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
export interface DeckGenerationResponseMetadata {
  requestedGenerationMode?: "package-template" | "vnext";
  generationMode?: "package-template" | "vnext";
  fallback?: boolean;
  tableSlideCount?: number;
  schemaValid?: boolean;
  themePackageId?: ThemePackageId;
  selectedKindCounts?: Record<string, number>;
}

export type DeckGenerateResult =
  | {
      ok: true;
      deckV7: DeckV7;
      truncated: boolean;
      metadata?: DeckGenerationResponseMetadata;
    }
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

/**
 * Build the `/api/generate-deck` request body from the live document content and
 * the optional length/tone/audience tuning. Blank/whitespace-only tone and
 * audience values are omitted, and the `options` object is only included when at
 * least one knob is set — mirroring how `buildGenerateBody` omits unset knobs.
 */
export function buildDeckGenerationBody(
  contentJson: unknown,
  options: DeckGenerationOptions = {},
  request?: {
    themePackageId?: ThemePackageId;
  },
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
  if (request?.themePackageId !== undefined) {
    body.themePackageId = request.themePackageId;
  }
  return body;
}

/* node:coverage ignore start */
/* Coverage rationale: response parser JSDoc is documentation-only; parser branches are asserted. */
/**
 * Validate a `{ deck, truncated }` response payload. Returns the parsed DeckV7
 * and the `truncated` flag, or `null` when the payload is missing/invalid.
 */
/* node:coverage ignore stop */
function parseGenerationMode(
  value: unknown,
): "package-template" | "vnext" | undefined {
  return value === "package-template" || value === "vnext" ? value : undefined;
}

function parseKindCounts(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const counts: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    if (typeof count === "number" && Number.isFinite(count) && count >= 0) {
      counts[key] = count;
    }
  }
  return Object.keys(counts).length > 0 ? counts : undefined;
}

function parseDeckResponseMetadata(
  value: unknown,
): DeckGenerationResponseMetadata | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const metadata: DeckGenerationResponseMetadata = {};
  const requestedGenerationMode = parseGenerationMode(
    raw.requestedGenerationMode,
  );
  if (requestedGenerationMode) {
    metadata.requestedGenerationMode = requestedGenerationMode;
  }
  const generationMode = parseGenerationMode(raw.generationMode);
  if (generationMode) {
    metadata.generationMode = generationMode;
  }
  if (typeof raw.fallback === "boolean") {
    metadata.fallback = raw.fallback;
  }
  if (typeof raw.tableSlideCount === "number" && raw.tableSlideCount >= 0) {
    metadata.tableSlideCount = raw.tableSlideCount;
  }
  if (typeof raw.schemaValid === "boolean") {
    metadata.schemaValid = raw.schemaValid;
  }
  if (isThemePackageId(raw.themePackageId)) {
    metadata.themePackageId = raw.themePackageId;
  }
  const selectedKindCounts = parseKindCounts(raw.selectedKindCounts);
  if (selectedKindCounts) {
    metadata.selectedKindCounts = selectedKindCounts;
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

export function parseDeckResponse(payload: unknown): {
  deckV7: DeckV7;
  truncated: boolean;
  metadata?: DeckGenerationResponseMetadata;
} | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const rawDeck = (payload as { deck?: unknown }).deck;
  const truncated = (payload as { truncated?: unknown }).truncated === true;
  const metadata = parseDeckResponseMetadata(
    (payload as { metadata?: unknown }).metadata,
  );
  const metaField = metadata ? { metadata } : {};

  if (
    rawDeck !== null &&
    typeof rawDeck === "object" &&
    !Array.isArray(rawDeck) &&
    (rawDeck as Record<string, unknown>).schemaVersion === 7
  ) {
    const v7Result = safeParseDeckV7(rawDeck);
    if (!v7Result.success) return null;
    return { deckV7: v7Result.data, truncated, ...metaField };
  }

  return null;
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
  request?: {
    themePackageId?: ThemePackageId;
  },
): Promise<DeckGenerateResult> {
  let response: Response;
  try {
    response = await fetchImpl("/api/generate-deck", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildDeckGenerationBody(contentJson, options, request),
      ),
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
        error: apiErrorMessageFromPayload(payload, UNAVAILABLE_ERROR),
        errorKind: "unavailable",
      };
    }
    if (response.status === 402) {
      return {
        ok: false,
        error: apiErrorMessageFromPayload(payload, FALLBACK_REQUEST_ERROR),
        errorKind: "credit",
      };
    }
    if (response.status === 504) {
      return {
        ok: false,
        error: apiErrorMessageFromPayload(payload, TIMEOUT_ERROR),
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
      error: apiErrorMessageFromPayload(payload, FALLBACK_REQUEST_ERROR),
      errorKind: "other",
    };
  }

  const parsed = parseDeckResponse(payload);
  if (!parsed) {
    return { ok: false, error: BAD_PAYLOAD_ERROR, errorKind: "other" };
  }
  return {
    ok: true,
    deckV7: parsed.deckV7,
    truncated: parsed.truncated,
    ...(parsed.metadata ? { metadata: parsed.metadata } : {}),
  };
}
