/**
 * Pure helpers for the document-level "overall adjustments" toolbox (issue #41).
 *
 * These are intentionally DOM-free and React-free so they can be called in
 * unit tests (`node --test`) without a browser environment.
 */

import type { EditorContextKind } from "./editor-context";

/**
 * Returns `true` when the overall-adjustments toolbox should be shown in the
 * right rail.  The toolbox is visible when no specific element (text range or
 * visual) is selected — i.e. the editor is idle or the cursor is in an empty
 * block.  It must NOT show while a text range or a visual node is selected,
 * because those contexts show their own per-element panels.
 *
 * @param kind - The current {@link EditorContextKind} from the editor snapshot.
 */
export function shouldShowOverallToolbox(kind: EditorContextKind): boolean {
  return kind === "none" || kind === "empty-block";
}
