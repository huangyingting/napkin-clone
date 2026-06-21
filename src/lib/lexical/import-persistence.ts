import { COLLABORATION_TAG, HISTORIC_TAG } from "lexical";

/**
 * Custom Lexical update tag applied when an editor-state replacement originates
 * from an explicit document import (Markdown/file upload).
 *
 * Imports were previously tagged {@link HISTORIC_TAG}, but that tag makes BOTH
 * the autosave handler and the Yjs binding skip the update — so an import was
 * never persisted to the database and never synced to collaborators (it only
 * mutated the local editor view). Tagging imports distinctly lets autosave
 * recognise a user-initiated replacement it MUST persist, while still treating
 * remote merges (`COLLABORATION_TAG`) and history replays (`HISTORIC_TAG`) as
 * non-persisting.
 */
export const IMPORT_TAG = "import";

/**
 * Custom Lexical update tag applied when restoring from document version
 * history. The server action has already written the restored state to the
 * database, so autosave must skip this local replacement. We intentionally do
 * NOT use {@link HISTORIC_TAG}: the Yjs binding treats that as non-syncing, but
 * restore must update the live collaboration room so stale in-memory state does
 * not overwrite the restored database state on reconnect.
 */
export const RESTORE_TAG = "restore";

/**
 * Decides whether an editor update should trigger an autosave to the database.
 *
 * Remote CRDT merges (`COLLABORATION_TAG`) and history replays / programmatic
 * historic replacements (`HISTORIC_TAG`) are skipped: only the client that made
 * a local edit persists it, and undo/redo/remote merges must not write. An
 * explicit import (`IMPORT_TAG`) is a user-initiated replacement that must
 * persist, so it overrides the skip. Version restores (`RESTORE_TAG`) are
 * skipped because the restore server action has already persisted the restored
 * state; the local editor update exists to refresh/sync the live room.
 */
export function shouldAutosaveUpdate(tags: ReadonlySet<string>): boolean {
  if (tags.has(IMPORT_TAG)) {
    return true;
  }
  if (
    tags.has(COLLABORATION_TAG) ||
    tags.has(HISTORIC_TAG) ||
    tags.has(RESTORE_TAG)
  ) {
    return false;
  }
  return true;
}

/**
 * Decides whether importing into the current document requires explicit user
 * confirmation. Replacing a non-empty document is destructive, so confirmation
 * is required; importing into an empty document is not.
 */
export function importRequiresConfirmation(isDocumentEmpty: boolean): boolean {
  return !isDocumentEmpty;
}

/**
 * Resolves the next step of the import flow given whether the target document is
 * empty and whether the user has already confirmed a destructive replacement:
 *
 *  - `"insert"`: apply the import now (document is empty, or already confirmed).
 *  - `"confirm"`: pause and ask the user to confirm replacing existing content.
 *
 * A cancelled confirmation never advances past `"confirm"`, so the import is
 * never applied and no save is triggered.
 */
export function resolveImportStep(
  isDocumentEmpty: boolean,
  confirmed: boolean,
): "insert" | "confirm" {
  if (isDocumentEmpty || confirmed) {
    return "insert";
  }
  return "confirm";
}
