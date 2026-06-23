/**
 * Patch-based deck autosave adapter (issue #473).
 *
 * Extracts the patch-vs-whole-deck save logic into a pure, testable function.
 * The UI layer (`slide-editor-button.tsx`) delegates to `attemptPatchAutosave`
 * so the branching (patch → fallback → conflict) can be verified without
 * React fixtures.
 *
 * Strategy:
 *  1. If `patches` is non-empty, attempt `savePatchFn`.
 *     - `ok: true`      → return success + token (method: "patch").
 *     - `ok: "conflict"` → return conflict (same as whole-deck conflict).
 *     - `ok: "fallback"` | error → fall through to step 2.
 *  2. Call `saveDeckFn` with the full deck.
 *     - `ok: true`       → return success + token (method: "deck").
 *     - `ok: "conflict"` → return conflict.
 *     - error            → return error.
 */

import type { Deck } from "@/lib/presentation/deck";
import type { DeckPatch } from "@/lib/presentation/slide-commands";
import type {
  SaveDeckResult,
  SaveDeckPatchResult,
} from "@/lib/document/persistence-service";

// ---------------------------------------------------------------------------
// Type aliases for the injected save functions
// ---------------------------------------------------------------------------

export type PatchSaveFn = (
  id: string,
  patches: DeckPatch[],
  clientToken: string | null | undefined,
) => Promise<SaveDeckPatchResult>;

export type DeckSaveFn = (
  id: string,
  deck: Deck,
  clientToken?: string | null,
) => Promise<SaveDeckResult>;

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export type AutosaveResult =
  | { ok: true; revisionToken: string; method: "patch" | "deck" }
  | { ok: "conflict"; serverRevisionToken: string | null }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Attempts to save a deck using patches first, falling back to whole-deck
 * save when patches are unavailable, unreplayable, or return conflict/error.
 *
 * @param documentId  The document to save.
 * @param deck        The full deck (used for fallback whole-deck save).
 * @param patches     Domain patches emitted by slide commands since last save.
 * @param clientToken Optimistic revision token from the last save or fetch.
 * @param savePatchFn Server action for patch-based save.
 * @param saveDeckFn  Server action for whole-deck save.
 */
export async function attemptPatchAutosave(
  documentId: string,
  deck: Deck,
  patches: DeckPatch[],
  clientToken: string | null | undefined,
  savePatchFn: PatchSaveFn,
  saveDeckFn: DeckSaveFn,
): Promise<AutosaveResult> {
  // Patch path: only when we have serialisable patches.
  if (patches.length > 0) {
    let patchResult: SaveDeckPatchResult;
    try {
      patchResult = await savePatchFn(documentId, patches, clientToken);
    } catch {
      // Network / unexpected error — fall through to whole-deck save.
      return wholeDeckSave(documentId, deck, clientToken, saveDeckFn);
    }

    if (patchResult.ok === true) {
      return {
        ok: true,
        revisionToken: patchResult.revisionToken,
        method: "patch",
      };
    }
    if (patchResult.ok === "conflict") {
      return {
        ok: "conflict",
        serverRevisionToken: patchResult.serverRevisionToken,
      };
    }
    // ok === "fallback" or ok === false → fall through to whole-deck save.
  }

  return wholeDeckSave(documentId, deck, clientToken, saveDeckFn);
}

async function wholeDeckSave(
  documentId: string,
  deck: Deck,
  clientToken: string | null | undefined,
  saveDeckFn: DeckSaveFn,
): Promise<AutosaveResult> {
  let result: SaveDeckResult;
  try {
    result = await saveDeckFn(documentId, deck, clientToken);
  } catch {
    return { ok: false, error: "Network error during save." };
  }

  if (result.ok === true) {
    return { ok: true, revisionToken: result.revisionToken, method: "deck" };
  }
  if (result.ok === "conflict") {
    return {
      ok: "conflict",
      serverRevisionToken: result.serverRevisionToken,
    };
  }
  return { ok: false, error: result.error };
}
