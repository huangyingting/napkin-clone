"use client";

/**
 * Deck save-conflict recovery dialog (issue #404).
 *
 * Surfaces when {@link saveDeckJson} (or {@link saveDeckPatch}) returns
 * `{ ok: "conflict" }`, meaning another session saved the deck between the
 * client's last fetch and this save attempt. The user is offered three
 * recovery paths:
 *
 * 1. **Keep mine** — re-saves the local snapshot using the server's current
 *    revision token as the new `clientToken`, forcing the write through.
 * 2. **Use theirs** — discards local changes and loads the server's current
 *    deck state (caller receives it via `onUseTheirs`).
 * 3. **Retry** — refreshes the server deck, replays any local patches if
 *    possible, or falls back to a merge prompt (caller handles via
 *    `onRetry`).
 *
 * ## Self-conflict (two tabs)
 *
 * When the same user has two tabs open they can trigger a conflict with
 * themselves. The dialog copy makes no assumption about whether the conflict
 * came from another user or another tab — both cases are handled identically.
 *
 * ## Revision token update
 *
 * After "Keep mine" succeeds the dialog calls `onResolved` with the new
 * revision token so the editor can update its token state and the next
 * autosave is not immediately stale.
 */

import { AlertTriangle, RefreshCw, Save, Trash2 } from "lucide-react";
import { useState, useId } from "react";

import { Button, Dialog } from "@/components/ui";
import { cx } from "@/components/ui/tokens";
import type { Deck } from "@/lib/presentation/deck";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConflictRecoveryDialogProps {
  /** Whether the dialog is visible. */
  open: boolean;
  /**
   * The local deck snapshot captured at the moment the conflict was detected.
   * Passed back to `onKeepMine` so the caller can re-save it.
   */
  localDeck: Deck;
  /**
   * The server's current revision token, returned in the conflict response.
   * Used as the `clientToken` for a "Keep mine" force-save so the write is
   * accepted server-side.
   */
  serverRevisionToken: string | null;
  /**
   * Called when the user chooses "Keep mine". Receives the local deck snapshot
   * and the server token to use for the re-save. The dialog stays open and
   * shows a saving spinner until the callback resolves; on success the dialog
   * closes. The caller is responsible for updating the revision token ref.
   */
  onKeepMine: (
    localDeck: Deck,
    serverRevisionToken: string | null,
  ) => Promise<void>;
  /**
   * Called when the user chooses "Use theirs". The caller should discard the
   * local snapshot and reload the server's current deck state. The dialog
   * closes immediately when this is called.
   */
  onUseTheirs: () => void;
  /**
   * Called when the dialog is dismissed without resolution (e.g. the user
   * presses Escape or clicks away). The unsaved changes remain in the editor.
   */
  onDismiss: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConflictRecoveryDialog({
  open,
  localDeck,
  serverRevisionToken,
  onKeepMine,
  onUseTheirs,
  onDismiss,
}: ConflictRecoveryDialogProps) {
  const headingId = useId();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleKeepMine() {
    setIsSaving(true);
    setSaveError(null);
    try {
      await onKeepMine(localDeck, serverRevisionToken);
    } catch {
      setSaveError(
        "Couldn't save your version. Check your connection and retry.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function handleUseTheirs() {
    setSaveError(null);
    onUseTheirs();
  }

  return (
    <Dialog
      open={open}
      onClose={onDismiss}
      aria-labelledby={headingId}
      aria-busy={isSaving}
      className="max-w-sm"
    >
      <div className="flex flex-col gap-4 p-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <AlertTriangle
            className="mt-0.5 shrink-0 text-amber-500"
            size={20}
            aria-hidden
          />
          <div className="flex flex-col gap-1">
            <h2
              id={headingId}
              className="text-sm font-semibold leading-snug text-[--ds-text]"
            >
              Save conflict detected
            </h2>
            <p className="text-xs text-[--ds-text-subtle]">
              Another session saved this deck after you last loaded it. Choose
              how to resolve the conflict.
            </p>
          </div>
        </div>

        {/* Error message */}
        {saveError && (
          <p
            role="alert"
            className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-400"
          >
            {saveError}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button
            variant="solid"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => void handleKeepMine()}
            disabled={isSaving}
          >
            <Save size={14} aria-hidden />
            {isSaving ? "Saving…" : "Keep my version"}
          </Button>

          <Button
            variant="subtle"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={handleUseTheirs}
            disabled={isSaving}
          >
            <RefreshCw size={14} aria-hidden />
            Use server version
          </Button>

          <button
            type="button"
            className={cx(
              "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs",
              "text-[--ds-text-subtle] hover:text-[--ds-text] transition-colors",
            )}
            onClick={onDismiss}
            disabled={isSaving}
          >
            <Trash2 size={12} aria-hidden className="shrink-0" />
            Dismiss — keep editing (conflict may recur)
          </button>
        </div>
      </div>
    </Dialog>
  );
}
