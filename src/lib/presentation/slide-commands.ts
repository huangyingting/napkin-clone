/**
 * Slide command envelope, CommandResult type, and command executor.
 *
 * Pure and headless — no DOM, no React, no browser APIs. Fully testable under
 * `node --test`. All mutation helpers from `deck-mutations.ts` are called as
 * lower-level primitives; this module only adds the command envelope, result
 * type, validation, and coalescing logic on top.
 *
 * Design goals:
 *  - `executeCommand` is pure and deterministic: same deck + command → same result.
 *    **Caveat:** commands that create new slides or elements (ADD_SLIDE,
 *    DUPLICATE_SLIDE, ADD_ELEMENT) generate fresh ids via `crypto.randomUUID()`
 *    internally, so those specific results are not replay-identical across calls.
 *  - The input deck is **never mutated** — failures return the same reference.
 *  - Validation errors are explicit and do not partially mutate the deck.
 *  - Slide `id`, `index`, and `theme` fields are structurally immutable: the
 *    `UpdateSlideCommand.patch` type excludes them, and the executor strips any
 *    `id` key that reaches it through an unsafe cast.
 *  - `CommandResult` exposes enough metadata (affected ids, historyKey, patches)
 *    for upstream undo/redo, autosave, patch persistence, and analytics consumers.
 *
 * ## Patch output (issue #401)
 *
 * Each successful `CommandResult` includes a `patches` array of serialisable
 * {@link DeckPatch} records. The patch format is schema-versioned (mirrors
 * `CURRENT_DECK_SCHEMA_VERSION`) and intentionally minimal so it can be
 * validated server-side and forwarded to the persistence epic (#376/#403).
 *
 * Use {@link applyPatch} to re-apply a patch to a deck for testing or
 * server-side replay.
 *
 * ## Command history adapter (issue #402)
 *
 * {@link commitCommand} is the single shared commit path for all command-based
 * editor handlers. It wraps `executeCommand`, extracts `coalesceKey` and
 * `affectedSlideIds` for the history/autosave layer, and returns a
 * {@link CommitCommandResult} that the editor can pass directly to
 * `onDeckChange` (commit) and downstream analytics hooks.
 */

import type {
  Deck,
  DeckTheme,
  ElementBox,
  Slide,
  SlideElement,
  SlideLayout as ReusableSlideLayout,
  SlideLayoutHint,
  SourceRef,
  TextRun,
} from "./deck";
import type { DeckThemeTokenSet } from "./deck-theme-tokens";
import type { DistributiveOmit, ElementPatch } from "./deck-mutations";
import type { AlignMode, DistributeMode, MatchSizeMode } from "./element-align";
import type { ArrangeMode } from "./element-arrange";
import {
  setDeckSlideFormat,
  setDeckTheme,
  resetDeckTemplate,
  setElementPatches,
  updateSlide,
  type DeckTemplatePatch,
} from "./deck-mutations";
import type { SlideFormat } from "./slide-format";
import { executeBackgroundFamilyCommand } from "./slide-command-background-executor";
import { executeDeckThemeFamilyCommand } from "./slide-command-deck-theme-executor";
import { executeElementFamilyCommand } from "./slide-command-element-executor";
import { executeLayoutFamilyCommand } from "./slide-command-layout-executor";
import {
  canCoalesceSlideCommands,
  mergeCoalescedSlideCommands,
} from "./slide-command-metadata";
import { executeSlideFamilyCommand } from "./slide-command-slide-executor";
import { executeSourceRefFamilyCommand } from "./slide-command-source-ref-executor";

// ---------------------------------------------------------------------------
// Command types
// ---------------------------------------------------------------------------

export interface AddSlideCommand {
  type: "ADD_SLIDE";
  /**
   * Insert after the slide with this id. When `null` or `undefined` the new
   * slide is appended to the end of the deck.
   */
  afterSlideId?: string | null;
  commandId?: string;
}

export interface RemoveSlideCommand {
  type: "REMOVE_SLIDE";
  slideId: string;
  commandId?: string;
}

export interface DuplicateSlideCommand {
  type: "DUPLICATE_SLIDE";
  slideId: string;
  commandId?: string;
}

export interface ReorderSlideCommand {
  type: "REORDER_SLIDE";
  slideId: string;
  /** Zero-based destination index in the deck. */
  toIndex: number;
  commandId?: string;
}

export interface UpdateSlideCommand {
  type: "UPDATE_SLIDE";
  slideId: string;
  patch: Partial<Omit<Slide, "id" | "index" | "theme">>;
  /**
   * Optional grouping key — adjacent commands sharing this key may be
   * coalesced into a single undo step by {@link coalesceCommands}.
   */
  coalesceKey?: string;
  commandId?: string;
}

export interface AddElementCommand {
  type: "ADD_ELEMENT";
  slideId: string;
  element: DistributiveOmit<SlideElement, "id" | "zIndex"> & {
    id?: string;
    zIndex?: number;
  };
  commandId?: string;
}

export interface UpdateElementCommand {
  type: "UPDATE_ELEMENT";
  slideId: string;
  elementId: string;
  patch: ElementPatch;
  /**
   * Optional grouping key for coalescing gesture-driven updates (drag, resize,
   * text edits) into a single undo step via {@link coalesceCommands}.
   */
  coalesceKey?: string;
  commandId?: string;
}

export interface RemoveElementCommand {
  type: "REMOVE_ELEMENT";
  slideId: string;
  elementId: string;
  commandId?: string;
}

// ---------------------------------------------------------------------------
// Issue #398 — remaining slide operation commands
// ---------------------------------------------------------------------------

/**
 * Moves the slide at `index` one step in `direction` (positive = toward end,
 * negative = toward start). A move that would fall off either edge is a no-op.
 */
export interface MoveSlideCommand {
  type: "MOVE_SLIDE";
  /** Zero-based index of the slide to move. */
  slideIndex: number;
  /** Direction: positive moves toward the end, negative toward the start. */
  direction: number;
  commandId?: string;
}

/**
 * Inserts a fully-formed template slide (built by the caller) after the slide
 * at `afterIndex` (or at the end when `afterIndex` is `undefined`).
 */
export interface InsertTemplateSlideCommand {
  type: "INSERT_TEMPLATE_SLIDE";
  /** The pre-built slide to insert. */
  slide: Slide;
  /**
   * Zero-based index after which to insert. Defaults to the last slide when
   * omitted, so the new slide is appended to the end of the deck.
   */
  afterIndex?: number;
  commandId?: string;
}

/** Updates the title text of a slide. */
export interface UpdateSlideTitleCommand {
  type: "UPDATE_SLIDE_TITLE";
  slideId: string;
  title: string;
  coalesceKey?: string;
  commandId?: string;
}

/** Updates the body bullets mirrored on a slide. */
export interface UpdateSlideBodyCommand {
  type: "UPDATE_SLIDE_BODY";
  slideId: string;
  bullets: string[];
  coalesceKey?: string;
  commandId?: string;
}

/** Updates the speaker notes of a slide. */
export interface UpdateSlideNotesCommand {
  type: "UPDATE_SLIDE_NOTES";
  slideId: string;
  notes: string;
  coalesceKey?: string;
  commandId?: string;
}

/** Applies a {@link SlideLayoutHint} to a slide's `layout` field. */
export interface UpdateSlideLayoutHintCommand {
  type: "UPDATE_SLIDE_LAYOUT_HINT";
  slideId: string;
  layout: SlideLayoutHint;
  commandId?: string;
}

/** Applies a reusable layout to the selected slide while preserving authored content. */
export interface ApplySlideLayoutCommand {
  type: "APPLY_SLIDE_LAYOUT";
  slideIndex: number;
  layout: ReusableSlideLayout;
  commandId?: string;
}

/** Resets bound element positions to a reusable layout without changing content. */
export interface ResetSlideLayoutCommand {
  type: "RESET_SLIDE_LAYOUT";
  slideIndex: number;
  layout: ReusableSlideLayout;
  commandId?: string;
}

// ---------------------------------------------------------------------------
// Issue #399 — multi-element, group, align/distribute, connector lifecycle
// ---------------------------------------------------------------------------

/** Removes multiple elements from a slide in a single undo step. */
export interface RemoveElementsCommand {
  type: "REMOVE_ELEMENTS";
  slideId: string;
  elementIds: string[];
  commandId?: string;
}

/** Duplicates a single element on a slide and reports the new copy's id. */
export interface DuplicateElementCommand {
  type: "DUPLICATE_ELEMENT";
  slideId: string;
  elementId: string;
  commandId?: string;
}

/** Duplicates multiple elements on a slide in a single undo step. */
export interface DuplicateElementsCommand {
  type: "DUPLICATE_ELEMENTS";
  slideId: string;
  elementIds: string[];
  commandId?: string;
}

/** Nudges multiple elements by `dx`/`dy` percent of the slide dimensions. */
export interface NudgeElementsCommand {
  type: "NUDGE_ELEMENTS";
  slideId: string;
  elementIds: string[];
  dx: number;
  dy: number;
  coalesceKey?: string;
  commandId?: string;
}

/** Groups the named elements under a new shared `groupId`. */
export interface GroupElementsCommand {
  type: "GROUP_ELEMENTS";
  slideId: string;
  elementIds: string[];
  commandId?: string;
}

/** Clears `groupId` from every element in the named group. */
export interface UngroupElementsCommand {
  type: "UNGROUP_ELEMENTS";
  slideId: string;
  groupId: string;
  commandId?: string;
}

/** Aligns the named elements using {@link AlignMode}. */
export interface AlignElementsCommand {
  type: "ALIGN_ELEMENTS";
  slideId: string;
  elementIds: string[];
  mode: AlignMode;
  commandId?: string;
}

/** Distributes the named elements evenly using {@link DistributeMode}. */
export interface DistributeElementsCommand {
  type: "DISTRIBUTE_ELEMENTS";
  slideId: string;
  elementIds: string[];
  mode: DistributeMode;
  commandId?: string;
}

/** Resizes the named elements to match the first element using {@link MatchSizeMode}. */
export interface MatchSizeElementsCommand {
  type: "MATCH_SIZE_ELEMENTS";
  slideId: string;
  elementIds: string[];
  mode: MatchSizeMode;
  commandId?: string;
}

/** Reorders the z-stack of the named elements using {@link ArrangeMode}. */
export interface ArrangeElementsCommand {
  type: "ARRANGE_ELEMENTS";
  slideId: string;
  elementIds: string[];
  mode: ArrangeMode;
  commandId?: string;
}

/** Raises a single element to the top of the z-stack. */
export interface BringElementToFrontCommand {
  type: "BRING_ELEMENT_TO_FRONT";
  slideId: string;
  elementId: string;
  commandId?: string;
}

/** Lowers a single element to the bottom of the z-stack. */
export interface SendElementToBackCommand {
  type: "SEND_ELEMENT_TO_BACK";
  slideId: string;
  elementId: string;
  commandId?: string;
}

/** Sets multiple element boxes in one atomic mutation (group drag). */
export interface SetElementBoxesCommand {
  type: "SET_ELEMENT_BOXES";
  slideId: string;
  /** Map from element id to new box. */
  boxesById: Record<string, ElementBox>;
  coalesceKey?: string;
  commandId?: string;
}

/** Applies per-element patches in one atomic mutation (multi-select resize). */
export interface SetElementPatchesCommand {
  type: "SET_ELEMENT_PATCHES";
  slideId: string;
  /** Map from element id to partial patch. */
  patchesById: Record<string, ElementPatch>;
  coalesceKey?: string;
  commandId?: string;
}

/** Sets or clears the `hidden` flag on a single element. */
export interface SetElementHiddenCommand {
  type: "SET_ELEMENT_HIDDEN";
  slideId: string;
  elementId: string;
  hidden: boolean;
  commandId?: string;
}

/** Sets or clears the `locked` flag on a single element. */
export interface SetElementLockedCommand {
  type: "SET_ELEMENT_LOCKED";
  slideId: string;
  elementId: string;
  locked: boolean;
  commandId?: string;
}

/** Moves an element one step up or down in the z-order. */
export interface MoveElementZOrderCommand {
  type: "MOVE_ELEMENT_ZORDER";
  slideId: string;
  elementId: string;
  direction: "up" | "down";
  commandId?: string;
}

/** Sets the display name of a single element (shown in the layer list). */
export interface RenameElementCommand {
  type: "RENAME_ELEMENT";
  slideId: string;
  elementId: string;
  name: string;
  commandId?: string;
}

/** Moves an element to the z-order position of another (layer drag-reorder). */
export interface ReorderElementCommand {
  type: "REORDER_ELEMENT";
  slideId: string;
  elementId: string;
  targetElementId: string;
  commandId?: string;
}

// ---------------------------------------------------------------------------
// Issue #400 — style, theme, layout, and asset commands
// ---------------------------------------------------------------------------

/** Changes the deck-level theme. */
export interface SetDeckThemeCommand {
  type: "SET_DECK_THEME";
  theme: DeckTheme;
  commandId?: string;
}

/** Edits the global deck template (colors, role typography, defaults) (#614). */
export interface UpdateDeckTemplateCommand {
  type: "UPDATE_DECK_TEMPLATE";
  patch: DeckTemplatePatch;
  /** When true, reset the template back to the built-in theme (#612). */
  reset?: boolean;
  commandId?: string;
}

/** Changes the deck-level slide format (aspect ratio). */
export interface SetDeckFormatCommand {
  type: "SET_DECK_FORMAT";
  slideFormat: SlideFormat;
  commandId?: string;
}

/** Sets (or clears) the per-slide background color override. */
export interface SetSlideBackgroundCommand {
  type: "SET_SLIDE_BACKGROUND";
  slideId: string;
  /** Hex color string, or `undefined` to clear. */
  background: string | undefined;
  commandId?: string;
}

/** Sets (or clears) the per-slide background gradient. */
export interface SetSlideBackgroundGradientCommand {
  type: "SET_SLIDE_BACKGROUND_GRADIENT";
  slideId: string;
  gradient: { from: string; to: string; angle?: number } | undefined;
  commandId?: string;
}

/** Sets (or clears) the per-slide background image URL. */
export interface SetSlideBackgroundImageCommand {
  type: "SET_SLIDE_BACKGROUND_IMAGE";
  slideId: string;
  /** Data URL or remote URL, or `undefined` to clear. */
  image: string | undefined;
  commandId?: string;
}

/**
 * Attaches a server-stored asset as the slide background. Persists both the
 * resolved URL (`backgroundImage`) and the asset id (`backgroundAssetId`).
 * Uses the `setSlideBackgroundAsset` mutation added in epic #374.
 */
export interface SetSlideBackgroundAssetCommand {
  type: "SET_SLIDE_BACKGROUND_ASSET";
  slideId: string;
  /** Asset url + id, or `undefined` to clear. */
  opts: { url: string; assetId: string } | undefined;
  commandId?: string;
}

/** Sets (or clears) the per-slide accent color override. */
export interface SetSlideAccentCommand {
  type: "SET_SLIDE_ACCENT";
  slideId: string;
  /** Hex color string, or `undefined` to clear. */
  accent: string | undefined;
  commandId?: string;
}

// ---------------------------------------------------------------------------
// Epic #494 — source-ref deck commands
//
// Source-link refresh / unlink / relink / orphan-removal used to happen as
// ad-hoc UPDATE_ELEMENT / REMOVE_ELEMENT mutations built in the editor UI.
// These dedicated commands own the source-ref semantics in the pure executor
// so every source action flows through the shared `commitCommand` path, emits
// validated `DeckPatch` records, and preserves geometry/style/z-order plus all
// other element fields (only `sourceRef`, and — for text refresh — `text`/`runs`
// are touched). Stale/orphaned links remain user-visible and are never
// auto-deleted; removal is an explicit user action.
// ---------------------------------------------------------------------------

/**
 * Refreshes an element's content/source link from its (now-fresh) source block.
 *
 * The caller resolves the fresh content from the live document (the deck has no
 * document context) and supplies the rebuilt `sourceRef`. For text elements the
 * refreshed `text` (and optional `runs`) are applied alongside the ref; visual
 * elements only update the `sourceRef`. The target element must already carry a
 * `sourceRef`.
 */
export interface RefreshElementFromSourceCommand {
  type: "REFRESH_ELEMENT_FROM_SOURCE";
  slideId: string;
  elementId: string;
  /** Fresh active source ref reflecting the current source block content. */
  sourceRef: SourceRef;
  /** For text elements: refreshed text content from the source block. */
  text?: string;
  /** For text elements: refreshed inline runs (omit to leave runs unchanged). */
  runs?: TextRun[];
  commandId?: string;
}

/**
 * Marks an element's source link as intentionally broken (manual content). The
 * element and all of its geometry/style are kept; only `sourceRef.unlinked` is
 * set. The target element must already carry a `sourceRef`.
 */
export interface UnlinkElementSourceCommand {
  type: "UNLINK_ELEMENT_SOURCE";
  slideId: string;
  elementId: string;
  commandId?: string;
}

/**
 * Repoints an element's source link at a different document block. The caller
 * supplies the new active `sourceRef`; the element keeps its geometry/style and
 * (for visuals) its current `visualId`. The target element must already carry a
 * `sourceRef`.
 */
export interface RelinkElementSourceCommand {
  type: "RELINK_ELEMENT_SOURCE";
  slideId: string;
  elementId: string;
  /** New active source ref pointing at the relink target block. */
  sourceRef: SourceRef;
  commandId?: string;
}

/**
 * Removes an orphaned source-linked element from a slide. Only ever invoked
 * explicitly by the user for elements whose source block is missing; stale
 * links are never auto-removed.
 */
export interface RemoveSourceElementCommand {
  type: "REMOVE_SOURCE_ELEMENT";
  slideId: string;
  elementId: string;
  commandId?: string;
}

/** Discriminated union of all supported slide commands. */
export type SlideCommand =
  // Original commands
  | AddSlideCommand
  | RemoveSlideCommand
  | DuplicateSlideCommand
  | ReorderSlideCommand
  | UpdateSlideCommand
  | AddElementCommand
  | UpdateElementCommand
  | RemoveElementCommand
  // #398 — remaining slide operations
  | MoveSlideCommand
  | InsertTemplateSlideCommand
  | UpdateSlideTitleCommand
  | UpdateSlideBodyCommand
  | UpdateSlideNotesCommand
  | UpdateSlideLayoutHintCommand
  | ApplySlideLayoutCommand
  | ResetSlideLayoutCommand
  // #399 — multi-element, group, align/arrange
  | RemoveElementsCommand
  | DuplicateElementCommand
  | DuplicateElementsCommand
  | NudgeElementsCommand
  | GroupElementsCommand
  | UngroupElementsCommand
  | AlignElementsCommand
  | DistributeElementsCommand
  | MatchSizeElementsCommand
  | ArrangeElementsCommand
  | BringElementToFrontCommand
  | SendElementToBackCommand
  | SetElementBoxesCommand
  | SetElementPatchesCommand
  | SetElementHiddenCommand
  | SetElementLockedCommand
  | MoveElementZOrderCommand
  | RenameElementCommand
  | ReorderElementCommand
  // #400 — style, theme, layout, asset
  | SetDeckThemeCommand
  | UpdateDeckTemplateCommand
  | SetDeckFormatCommand
  | SetSlideBackgroundCommand
  | SetSlideBackgroundGradientCommand
  | SetSlideBackgroundImageCommand
  | SetSlideBackgroundAssetCommand
  | SetSlideAccentCommand
  // #494 — source-ref deck commands
  | RefreshElementFromSourceCommand
  | UnlinkElementSourceCommand
  | RelinkElementSourceCommand
  | RemoveSourceElementCommand;

// ---------------------------------------------------------------------------
// Issue #401 — Domain patch representation
// ---------------------------------------------------------------------------

/**
 * Operation type carried by a {@link DeckPatch}. Each value maps 1-to-1 to a
 * command (or a logical sub-operation within a compound command). The string
 * values are intentionally stable — they will be stored in the persistence
 * layer and validated server-side.
 */
export type PatchOp =
  // Slide lifecycle
  | "slide.add"
  | "slide.remove"
  | "slide.duplicate"
  | "slide.reorder"
  | "slide.move"
  | "slide.insert_template"
  | "slide.update"
  | "slide.update_title"
  | "slide.update_body"
  | "slide.update_notes"
  | "slide.update_layout_hint"
  | "slide.apply_layout"
  | "slide.reset_layout"
  | "slide.materialize"
  | "slide.set_background"
  | "slide.set_background_gradient"
  | "slide.set_background_image"
  | "slide.set_background_asset"
  | "slide.set_accent"
  // Element lifecycle
  | "element.add"
  | "element.update"
  | "element.remove"
  | "element.remove_multi"
  | "element.duplicate"
  | "element.duplicate_multi"
  | "element.nudge"
  | "element.group"
  | "element.ungroup"
  | "element.align"
  | "element.distribute"
  | "element.match_size"
  | "element.arrange"
  | "element.bring_to_front"
  | "element.send_to_back"
  | "element.set_boxes"
  | "element.set_patches"
  | "element.set_hidden"
  | "element.set_locked"
  | "element.move_zorder"
  | "element.rename"
  | "element.reorder"
  // Deck-level
  | "deck.set_theme"
  | "deck.update_template"
  | "deck.set_format";

/**
 * A serialisable domain patch emitted by {@link executeCommand}.
 *
 * Design constraints (issue #401):
 * - Stable and schema-versioned so server-side validators can reject stale payloads.
 * - Intentionally minimal: only the fields needed by the persistence epic (#376).
 * - JSON-safe: no functions, no `undefined` values in the payload maps.
 *
 * Consumers that need the full before/after state should use the `deck` reference
 * on `CommandResult` together with the input deck.
 */
export interface DeckPatch {
  /**
   * Deck schema version at the time the patch was created. Mirrors
   * {@link CURRENT_DECK_SCHEMA_VERSION} so the persistence layer can reject
   * patches created against an older schema.
   */
  schemaVersion: number;
  /** The logical operation this patch represents. */
  op: PatchOp;
  /** Stable slide ids touched by this patch. */
  slideIds: string[];
  /** Stable element ids touched by this patch (empty for slide/deck-level ops). */
  elementIds: string[];
  /**
   * Deck-level field changes. Present only on `deck.*` ops.
   * Only JSON-serialisable fields are included.
   */
  deckFields?: {
    theme?: DeckTheme;
    slideFormat?: SlideFormat;
    customTokenSet?: DeckThemeTokenSet;
    /** Signals a reset of the global template back to the built-in theme (#612). */
    resetTemplate?: boolean;
  };
  /**
   * Per-slide scalar-field changes keyed by slide id.
   * Only scalar fields that the command explicitly changed are included;
   * structural fields like `elements[]` are tracked via `elementIds` instead.
   */
  slideFields?: Record<
    string,
    Partial<
      Pick<
        Slide,
        | "title"
        | "bullets"
        | "notes"
        | "layout"
        | "background"
        | "backgroundGradient"
        | "backgroundImage"
        | "backgroundAssetId"
        | "accent"
      >
    >
  >;
  /**
   * Per-element patches keyed by element id. Present on element-mutation ops.
   * Only the fields that were changed are included (same shape as `ElementPatch`).
   */
  elementFields?: Record<string, ElementPatch>;
  /**
   * Ids that were **added** by this operation (new slides or elements created
   * by add/duplicate commands). The persistence layer uses these to upsert rows.
   */
  addedIds?: string[];
  /**
   * Ids that were **removed** by this operation (slides or elements deleted).
   * The persistence layer uses these to hard- or soft-delete rows.
   */
  removedIds?: string[];
}

// ---------------------------------------------------------------------------
// CommandResult
// ---------------------------------------------------------------------------

/** Result produced by {@link executeCommand}. */
export interface CommandResult {
  /** `true` when the command succeeded and the deck was (possibly) changed. */
  ok: boolean;
  /**
   * The deck after executing the command. When `ok` is `false` this is the
   * **same reference** as the input — the input is never mutated.
   */
  deck: Deck;
  /** Stable slide ids that were added, changed, or removed by the command. */
  affectedSlideIds: string[];
  /** Element ids that were added, changed, or removed by the command. */
  affectedElementIds: string[];
  /**
   * Coalesce key carried from the command's own `coalesceKey` field. Present
   * only on commands that declare a coalesceKey and where that field is set.
   * Upstream undo/redo history can use this to group results into one step.
   */
  historyKey?: string;
  /** Human-readable validation or execution error, set when `ok` is `false`. */
  error?: string;
  /**
   * Serialisable domain patches emitted by this command (issue #401).
   * Empty on failure (`ok: false`). Each successful mutation produces exactly
   * one patch that the persistence/collaboration layer can consume.
   */
  patches: DeckPatch[];
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

export function executeCommand(deck: Deck, cmd: SlideCommand): CommandResult {
  switch (cmd.type) {
    case "ADD_SLIDE":
    case "REMOVE_SLIDE":
    case "DUPLICATE_SLIDE":
    case "REORDER_SLIDE":
    case "UPDATE_SLIDE":
    case "MOVE_SLIDE":
    case "INSERT_TEMPLATE_SLIDE":
    case "UPDATE_SLIDE_TITLE":
    case "UPDATE_SLIDE_BODY":
    case "UPDATE_SLIDE_NOTES":
      return executeSlideFamilyCommand(deck, cmd);
    case "UPDATE_SLIDE_LAYOUT_HINT":
    case "APPLY_SLIDE_LAYOUT":
    case "RESET_SLIDE_LAYOUT":
      return executeLayoutFamilyCommand(deck, cmd);
    case "ADD_ELEMENT":
    case "UPDATE_ELEMENT":
    case "REMOVE_ELEMENT":
    case "REMOVE_ELEMENTS":
    case "DUPLICATE_ELEMENT":
    case "DUPLICATE_ELEMENTS":
    case "NUDGE_ELEMENTS":
    case "GROUP_ELEMENTS":
    case "UNGROUP_ELEMENTS":
    case "ALIGN_ELEMENTS":
    case "DISTRIBUTE_ELEMENTS":
    case "MATCH_SIZE_ELEMENTS":
    case "ARRANGE_ELEMENTS":
    case "BRING_ELEMENT_TO_FRONT":
    case "SEND_ELEMENT_TO_BACK":
    case "SET_ELEMENT_BOXES":
    case "SET_ELEMENT_PATCHES":
    case "SET_ELEMENT_HIDDEN":
    case "SET_ELEMENT_LOCKED":
    case "MOVE_ELEMENT_ZORDER":
    case "RENAME_ELEMENT":
    case "REORDER_ELEMENT":
      return executeElementFamilyCommand(deck, cmd);
    case "SET_DECK_THEME":
    case "UPDATE_DECK_TEMPLATE":
    case "SET_DECK_FORMAT":
      return executeDeckThemeFamilyCommand(deck, cmd);
    case "SET_SLIDE_BACKGROUND":
    case "SET_SLIDE_BACKGROUND_GRADIENT":
    case "SET_SLIDE_BACKGROUND_IMAGE":
    case "SET_SLIDE_BACKGROUND_ASSET":
    case "SET_SLIDE_ACCENT":
      return executeBackgroundFamilyCommand(deck, cmd);
    case "REFRESH_ELEMENT_FROM_SOURCE":
    case "UNLINK_ELEMENT_SOURCE":
    case "RELINK_ELEMENT_SOURCE":
    case "REMOVE_SOURCE_ELEMENT":
      return executeSourceRefFamilyCommand(deck, cmd);
  }
}

// ---------------------------------------------------------------------------
// Coalescing
// ---------------------------------------------------------------------------

/**
 * Collapses adjacent commands in `history` that share the same `coalesceKey`
 * and target (slide + optional element) into a single merged command.
 *
 * Rules:
 * - Only `UPDATE_SLIDE` and `UPDATE_ELEMENT` commands carry a `coalesceKey`.
 * - Two adjacent commands may coalesce when their `type`, `slideId`, element
 *   id (if applicable), and `coalesceKey` all match.
 * - When coalescing, the *later* patch is merged on top of the earlier one —
 *   last write wins per field.
 * - Commands without a `coalesceKey` are passed through unchanged.
 *
 * This is purely structural — it does not execute commands or touch a deck.
 * Upstream history can call this before committing a sequence to undo/redo.
 */
export function coalesceCommands(history: SlideCommand[]): SlideCommand[] {
  if (history.length === 0) return history;

  const result: SlideCommand[] = [history[0]!];
  for (let i = 1; i < history.length; i++) {
    const prev = result[result.length - 1]!;
    const curr = history[i]!;
    if (canCoalesce(prev, curr)) {
      result[result.length - 1] = mergeCommands(prev, curr);
    } else {
      result.push(curr);
    }
  }

  return result;
}

function canCoalesce(a: SlideCommand, b: SlideCommand): boolean {
  return canCoalesceSlideCommands(a, b);
}

function mergeCommands(a: SlideCommand, b: SlideCommand): SlideCommand {
  return mergeCoalescedSlideCommands(a, b);
}

// ---------------------------------------------------------------------------
// Issue #401 — applyPatch helper (round-trip support and server-side use)
// ---------------------------------------------------------------------------

/**
 * Re-applies a serialised {@link DeckPatch} to `deck`, producing the same
 * deck state as executing the original command did.
 *
 * This helper is intentionally conservative:
 * - Only `deck.*` and select `slide.*` patches are fully replayable from the
 *   patch payload alone (they carry the new field values in `deckFields` /
 *   `slideFields`).
 * - Element patches (`element.*`) carry only affected ids; to replay them the
 *   caller needs the full command, not just the patch.  `applyPatch` returns
 *   `null` for ops it cannot reproduce from the patch payload alone.
 *
 * The return value is `null` when the patch cannot be applied (unsupported op,
 * missing payload, or slide not found). Callers should fall back to the full
 * command executor in that case.
 */
export function applyPatch(deck: Deck, patch: DeckPatch): Deck | null {
  switch (patch.op) {
    case "deck.set_theme": {
      const theme = patch.deckFields?.theme;
      if (!theme) return null;
      return setDeckTheme(deck, theme);
    }
    case "deck.update_template": {
      if (patch.deckFields?.resetTemplate) {
        return resetDeckTemplate(deck);
      }
      const customTokenSet = patch.deckFields?.customTokenSet;
      if (!customTokenSet) return null;
      return { ...deck, customTokenSet };
    }
    case "deck.set_format": {
      const slideFormat = patch.deckFields?.slideFormat;
      if (!slideFormat) return null;
      return setDeckSlideFormat(deck, slideFormat);
    }
    case "slide.update_title":
    case "slide.update_body":
    case "slide.update_notes":
    case "slide.update_layout_hint":
    case "slide.set_background":
    case "slide.set_background_gradient":
    case "slide.set_background_image":
    case "slide.set_background_asset":
    case "slide.set_accent":
    case "slide.update": {
      if (!patch.slideFields) return null;
      let next = deck;
      for (const [slideId, fields] of Object.entries(patch.slideFields)) {
        const index = next.slides.findIndex((s) => s.id === slideId);
        if (index === -1) return null;
        next = updateSlide(next, index, fields);
      }
      return next;
    }
    case "element.update":
    case "element.set_patches": {
      if (!patch.elementFields || patch.slideIds.length === 0) return null;
      const slideId = patch.slideIds[0]!;
      const index = deck.slides.findIndex((s) => s.id === slideId);
      if (index === -1) return null;
      return setElementPatches(deck, index, patch.elementFields);
    }
    default:
      // For add/remove/reorder/duplicate/group/arrange ops the patch does not
      // carry enough payload to reproduce the result; return null to signal
      // "use the full command executor instead".
      return null;
  }
}

// ---------------------------------------------------------------------------
// Issue #402 — Command history adapter (single shared commit path)
// ---------------------------------------------------------------------------

/**
 * Options passed to the upstream `onDeckChange` (history `commit`) function.
 * Mirrors the second argument of `useDeckHistory`'s `commit` helper.
 */
export interface CommitOptions {
  /**
   * When set, adjacent commits sharing this key are collapsed into one
   * undo/redo step (gesture coalescing for drag, resize, text edits, nudge).
   */
  coalesceKey?: string;
}

/**
 * The return value of {@link commitCommand}: the command result plus the
 * extracted commit options ready to pass to `onDeckChange` / `commit`.
 */
export interface CommitCommandResult {
  /**
   * The raw `CommandResult` from `executeCommand`. Inspect `result.ok` before
   * passing `result.deck` to the history commit function.
   */
  result: CommandResult;
  /**
   * Commit options extracted from the `CommandResult` for the upstream
   * `onDeckChange` call. Pass these as the second argument to `onDeckChange` /
   * `commit` for consistent gesture coalescing across all command paths.
   */
  commitOptions: CommitOptions | undefined;
  /**
   * All slide ids affected by this command. Convenience accessor over
   * `result.affectedSlideIds` for autosave staging.
   */
  affectedSlideIds: string[];
  /**
   * All element ids affected by this command. Convenience accessor over
   * `result.affectedElementIds` for autosave staging.
   */
  affectedElementIds: string[];
  /**
   * Serialisable patches emitted by the command, forwarded from
   * `result.patches`. The persistence epic (#376) can consume these directly.
   */
  patches: DeckPatch[];
}

/**
 * The single shared commit path for all command-based editor handlers
 * (issue #402).
 *
 * Wraps {@link executeCommand} and extracts the commit options (coalesce key,
 * affected ids, patches) into a structured {@link CommitCommandResult} so
 * every UI handler can follow the same pattern:
 *
 * ```ts
 * const { result, commitOptions } = commitCommand(deck, cmd);
 * if (result.ok) onDeckChange(result.deck, commitOptions);
 * ```
 *
 * This function:
 *  - Routes the coalesce key from the `CommandResult` historyKey to the
 *    `commitOptions.coalesceKey` so undo/redo coalescing stays consistent.
 *  - Exposes `affectedSlideIds` and `affectedElementIds` as top-level fields
 *    so autosave staging can consume them without digging into `result`.
 *  - Forwards `patches` from the command result so the persistence layer can
 *    eventually consume granular patch payloads without re-auditing every
 *    UI handler.
 *
 * Analytics/audit hooks should subscribe to `commitOptions` and `patches`
 * in one place rather than instrumenting individual UI controls.
 */
export function commitCommand(
  deck: Deck,
  cmd: SlideCommand,
): CommitCommandResult {
  const result = executeCommand(deck, cmd);
  const commitOptions: CommitOptions | undefined =
    result.historyKey !== undefined
      ? { coalesceKey: result.historyKey }
      : undefined;
  return {
    result,
    commitOptions,
    affectedSlideIds: result.affectedSlideIds,
    affectedElementIds: result.affectedElementIds,
    patches: result.patches,
  };
}
