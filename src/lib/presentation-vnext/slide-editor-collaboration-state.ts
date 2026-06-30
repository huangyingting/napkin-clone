import type { DeckV7 } from "./schema";

export const SAVE_CONFLICT_AUTOSAVE_BLOCKED_MESSAGE =
  "Save conflict: resolve the collaboration conflict before autosaving.";

export interface SlideEditorConflictStateV7 {
  localDeck: DeckV7;
  serverRevisionToken: string | null;
}

export function hasUnresolvedDeckSaveConflict(
  conflictState: SlideEditorConflictStateV7 | null,
): conflictState is SlideEditorConflictStateV7 {
  return conflictState !== null;
}

export function updateConflictLocalDeck(
  conflictState: SlideEditorConflictStateV7,
  localDeck: DeckV7,
): SlideEditorConflictStateV7 {
  return {
    ...conflictState,
    localDeck,
  };
}
