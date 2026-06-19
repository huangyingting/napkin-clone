/**
 * Shared Lexical commands for the editor's contextual surfaces.
 *
 * Commands are the Yjs-safe contract between a UI affordance (a tool in the
 * {@link "./tool-registry".EditorTool} registry, an insert menu, a toolbar) and
 * the editor mutation it triggers. A surface dispatches a command; a registered
 * handler runs inside `editor.update()`. Nothing here touches Yjs directly or
 * persists NodeKeys — `contentJson` (the Lexical state) stays the single source
 * of truth, and the existing debounced save mirrors any inserted visual to its
 * derived `Visual`/`VisualRevision` rows.
 */

import { createCommand, type LexicalCommand } from "lexical";

import type { VisualKind } from "@/lib/visual/schema";

/**
 * Payload for {@link INSERT_VISUAL_COMMAND}: the deterministic, non-AI "Insert
 * Visual" action.
 *
 * - `kind` — which {@link VisualKind} to seed (a blank template is built via
 *   `createBlankVisual(kind)`; no network/AI call).
 * - `afterNodeKey` — optional Lexical NodeKey of the block to insert the new
 *   visual *after*. When omitted (or unresolvable), the handler inserts at the
 *   current selection's top-level block, falling back to the end of the
 *   document. NodeKeys are transient and used only within the dispatching
 *   update — never persisted.
 */
export type InsertVisualPayload = {
  kind: VisualKind;
  afterNodeKey?: string;
};

/**
 * Inserts a blank (deterministically seeded) visual block into the document.
 * Dispatch with `editor.dispatchCommand(INSERT_VISUAL_COMMAND, { kind })`. The
 * handler ({@link "../../app/app/documents/[id]/insert-visual-plugin"}) builds a
 * `VisualNode` and inserts + selects it, all within a single `editor.update()`.
 */
export const INSERT_VISUAL_COMMAND: LexicalCommand<InsertVisualPayload> =
  createCommand("INSERT_VISUAL_COMMAND");
