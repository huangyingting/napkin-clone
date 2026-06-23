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
} from "./deck";
import type { DistributiveOmit, ElementPatch } from "./deck-mutations";
import type { AlignMode, DistributeMode, MatchSizeMode } from "./element-align";
import type { ArrangeMode } from "./element-arrange";
import {
  addElement,
  addSlide,
  alignElements,
  arrangeSelectedElements,
  bringElementToFront,
  applySlideLayout,
  distributeElements,
  duplicateElement,
  duplicateElements,
  duplicateSlide,
  groupElements,
  insertSlide,
  matchSizeElements,
  moveElementZOrder,
  moveSlide,
  nudgeElements,
  removeElement,
  removeElements,
  removeSlide,
  renameElement,
  reorderSlides,
  resetSlideLayout,
  sendElementToBack,
  setDeckSlideFormat,
  setDeckTheme,
  setElementBoxes,
  setElementHidden,
  setElementLocked,
  setElementPatches,
  setSlideAccent,
  setSlideBackground,
  setSlideBackgroundAsset,
  setSlideBackgroundGradient,
  setSlideBackgroundImage,
  ungroupElements,
  updateElement,
  updateSlide,
} from "./deck-mutations";
import type { SlideFormat } from "./slide-format";
import { CURRENT_DECK_SCHEMA_VERSION } from "./deck-migration";

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

/** Updates the body bullets of a legacy-track slide. */
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

/** Applies a reusable placeholder layout to the selected slide. */
export interface ApplySlideLayoutCommand {
  type: "APPLY_SLIDE_LAYOUT";
  slideIndex: number;
  layout: ReusableSlideLayout;
  commandId?: string;
}

/** Resets the selected slide to a reusable placeholder layout. */
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

// ---------------------------------------------------------------------------
// Issue #400 — style, theme, layout, and asset commands
// ---------------------------------------------------------------------------

/** Changes the deck-level theme. */
export interface SetDeckThemeCommand {
  type: "SET_DECK_THEME";
  theme: DeckTheme;
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
  // #400 — style, theme, layout, asset
  | SetDeckThemeCommand
  | SetDeckFormatCommand
  | SetSlideBackgroundCommand
  | SetSlideBackgroundGradientCommand
  | SetSlideBackgroundImageCommand
  | SetSlideBackgroundAssetCommand
  | SetSlideAccentCommand;

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
  // Deck-level
  | "deck.set_theme"
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
// Internal helpers
// ---------------------------------------------------------------------------

function findSlideIndex(deck: Deck, slideId: string): number {
  return deck.slides.findIndex((s) => s.id === slideId);
}

function failure(deck: Deck, error: string): CommandResult {
  return {
    ok: false,
    deck,
    affectedSlideIds: [],
    affectedElementIds: [],
    error,
    patches: [],
  };
}

function makePatch(
  op: PatchOp,
  slideIds: string[],
  elementIds: string[],
  extra?: Partial<
    Pick<
      DeckPatch,
      "deckFields" | "slideFields" | "elementFields" | "addedIds" | "removedIds"
    >
  >,
): DeckPatch {
  return {
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    op,
    slideIds,
    elementIds,
    ...extra,
  };
}

function success(
  deck: Deck,
  affectedSlideIds: string[],
  affectedElementIds: string[],
  historyKey?: string,
  patches?: DeckPatch[],
): CommandResult {
  return {
    ok: true,
    deck,
    affectedSlideIds,
    affectedElementIds,
    ...(historyKey !== undefined ? { historyKey } : {}),
    patches: patches ?? [],
  };
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

export function executeCommand(deck: Deck, cmd: SlideCommand): CommandResult {
  switch (cmd.type) {
    case "ADD_SLIDE": {
      const afterIndex =
        cmd.afterSlideId == null
          ? deck.slides.length - 1
          : findSlideIndex(deck, cmd.afterSlideId);

      if (cmd.afterSlideId != null && afterIndex === -1) {
        return failure(deck, `Slide not found: ${cmd.afterSlideId}`);
      }

      const next = addSlide(deck, afterIndex);
      const originalIds = new Set(deck.slides.map((s) => s.id));
      const newSlide = next.slides.find((s) => !originalIds.has(s.id));
      const newId = newSlide?.id;
      return success(next, newId ? [newId] : [], [], undefined, [
        makePatch("slide.add", newId ? [newId] : [], [], {
          addedIds: newId ? [newId] : [],
        }),
      ]);
    }

    case "REMOVE_SLIDE": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      if (deck.slides.length <= 1)
        return failure(deck, "Cannot remove the last slide");

      return success(removeSlide(deck, index), [cmd.slideId], [], undefined, [
        makePatch("slide.remove", [cmd.slideId], [], {
          removedIds: [cmd.slideId],
        }),
      ]);
    }

    case "DUPLICATE_SLIDE": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);

      const next = duplicateSlide(deck, index);
      const originalIds = new Set(deck.slides.map((s) => s.id));
      const newSlide = next.slides.find((s) => !originalIds.has(s.id));
      const affected = [cmd.slideId, ...(newSlide ? [newSlide.id] : [])];
      return success(next, affected, [], undefined, [
        makePatch("slide.duplicate", affected, [], {
          addedIds: newSlide ? [newSlide.id] : [],
        }),
      ]);
    }

    case "REORDER_SLIDE": {
      const fromIndex = findSlideIndex(deck, cmd.slideId);
      if (fromIndex === -1)
        return failure(deck, `Slide not found: ${cmd.slideId}`);
      if (cmd.toIndex < 0 || cmd.toIndex >= deck.slides.length)
        return failure(deck, `Invalid target index: ${cmd.toIndex}`);

      const next = reorderSlides(deck, fromIndex, cmd.toIndex);
      const lo = Math.min(fromIndex, cmd.toIndex);
      const hi = Math.max(fromIndex, cmd.toIndex);
      const affectedSlideIds = deck.slides.slice(lo, hi + 1).map((s) => s.id);
      return success(next, affectedSlideIds, [], undefined, [
        makePatch("slide.reorder", affectedSlideIds, []),
      ]);
    }

    case "UPDATE_SLIDE": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);

      // Strip `id` defensively — the type excludes it, but callers may bypass
      // TypeScript with an unsafe cast. Slide identity must never change.
      const { id: _discardedId, ...safePatch } = cmd.patch as Partial<Slide>;

      return success(
        updateSlide(deck, index, safePatch),
        [cmd.slideId],
        [],
        cmd.coalesceKey,
        [
          makePatch("slide.update", [cmd.slideId], [], {
            slideFields: {
              [cmd.slideId]:
                safePatch as DeckPatch["slideFields"] extends Record<
                  string,
                  infer V
                >
                  ? V
                  : never,
            },
          }),
        ],
      );
    }

    case "ADD_ELEMENT": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);

      const next = addElement(deck, index, cmd.element);
      const nextSlide = next.slides[index];
      const elements = nextSlide?.elements;
      const newElement = elements?.[elements.length - 1];
      const newId = newElement?.id;
      return success(next, [cmd.slideId], newId ? [newId] : [], undefined, [
        makePatch("element.add", [cmd.slideId], newId ? [newId] : [], {
          addedIds: newId ? [newId] : [],
        }),
      ]);
    }

    case "UPDATE_ELEMENT": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);

      const slide = deck.slides[index]!;
      if (!slide.elements?.some((e) => e.id === cmd.elementId)) {
        return failure(deck, `Element not found: ${cmd.elementId}`);
      }

      return success(
        updateElement(deck, index, cmd.elementId, cmd.patch),
        [cmd.slideId],
        [cmd.elementId],
        cmd.coalesceKey,
        [
          makePatch("element.update", [cmd.slideId], [cmd.elementId], {
            elementFields: { [cmd.elementId]: cmd.patch },
          }),
        ],
      );
    }

    case "REMOVE_ELEMENT": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);

      const slide = deck.slides[index]!;
      if (!slide.elements?.some((e) => e.id === cmd.elementId)) {
        return failure(deck, `Element not found: ${cmd.elementId}`);
      }

      return success(
        removeElement(deck, index, cmd.elementId),
        [cmd.slideId],
        [cmd.elementId],
        undefined,
        [
          makePatch("element.remove", [cmd.slideId], [cmd.elementId], {
            removedIds: [cmd.elementId],
          }),
        ],
      );
    }

    // ── #398 — remaining slide operations ──────────────────────────────────

    case "MOVE_SLIDE": {
      if (
        cmd.slideIndex < 0 ||
        cmd.slideIndex >= deck.slides.length ||
        cmd.direction === 0
      ) {
        return failure(
          deck,
          `Invalid move: index ${cmd.slideIndex}, direction ${cmd.direction}`,
        );
      }
      const target = cmd.slideIndex + (cmd.direction > 0 ? 1 : -1);
      if (target < 0 || target >= deck.slides.length) {
        return failure(deck, `Move would exceed deck bounds`);
      }
      const next = moveSlide(deck, cmd.slideIndex, cmd.direction);
      if (next === deck) return failure(deck, "Move had no effect");
      const lo = Math.min(cmd.slideIndex, target);
      const hi = Math.max(cmd.slideIndex, target);
      const affectedSlideIds = deck.slides.slice(lo, hi + 1).map((s) => s.id);
      return success(next, affectedSlideIds, [], undefined, [
        makePatch("slide.move", affectedSlideIds, []),
      ]);
    }

    case "INSERT_TEMPLATE_SLIDE": {
      const afterIndex = cmd.afterIndex ?? deck.slides.length - 1;
      if (afterIndex < -1 || afterIndex >= deck.slides.length) {
        return failure(deck, `Invalid afterIndex: ${afterIndex}`);
      }
      const next = insertSlide(deck, afterIndex, cmd.slide);
      return success(next, [cmd.slide.id], [], undefined, [
        makePatch("slide.insert_template", [cmd.slide.id], [], {
          addedIds: [cmd.slide.id],
        }),
      ]);
    }

    case "UPDATE_SLIDE_TITLE": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      return success(
        updateSlide(deck, index, { title: cmd.title }),
        [cmd.slideId],
        [],
        cmd.coalesceKey,
        [
          makePatch("slide.update_title", [cmd.slideId], [], {
            slideFields: { [cmd.slideId]: { title: cmd.title } },
          }),
        ],
      );
    }

    case "UPDATE_SLIDE_BODY": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      return success(
        updateSlide(deck, index, { bullets: cmd.bullets }),
        [cmd.slideId],
        [],
        cmd.coalesceKey,
        [
          makePatch("slide.update_body", [cmd.slideId], [], {
            slideFields: { [cmd.slideId]: { bullets: cmd.bullets } },
          }),
        ],
      );
    }

    case "UPDATE_SLIDE_NOTES": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      return success(
        updateSlide(deck, index, { notes: cmd.notes }),
        [cmd.slideId],
        [],
        cmd.coalesceKey,
        [
          makePatch("slide.update_notes", [cmd.slideId], [], {
            slideFields: { [cmd.slideId]: { notes: cmd.notes } },
          }),
        ],
      );
    }

    case "UPDATE_SLIDE_LAYOUT_HINT": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      return success(
        updateSlide(deck, index, { layout: cmd.layout }),
        [cmd.slideId],
        [],
        undefined,
        [
          makePatch("slide.update_layout_hint", [cmd.slideId], [], {
            slideFields: { [cmd.slideId]: { layout: cmd.layout } },
          }),
        ],
      );
    }

    case "APPLY_SLIDE_LAYOUT": {
      if (cmd.slideIndex < 0 || cmd.slideIndex >= deck.slides.length) {
        return failure(deck, `Invalid slideIndex: ${cmd.slideIndex}`);
      }
      const slide = deck.slides[cmd.slideIndex]!;
      return success(
        applySlideLayout(deck, cmd.slideIndex, cmd.layout),
        [slide.id],
        [],
        undefined,
        [makePatch("slide.apply_layout", [slide.id], [])],
      );
    }

    case "RESET_SLIDE_LAYOUT": {
      if (cmd.slideIndex < 0 || cmd.slideIndex >= deck.slides.length) {
        return failure(deck, `Invalid slideIndex: ${cmd.slideIndex}`);
      }
      const slide = deck.slides[cmd.slideIndex]!;
      return success(
        resetSlideLayout(deck, cmd.slideIndex, cmd.layout),
        [slide.id],
        [],
        undefined,
        [makePatch("slide.reset_layout", [slide.id], [])],
      );
    }

    // ── #399 — multi-element, group, align/arrange ─────────────────────────

    case "REMOVE_ELEMENTS": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      if (cmd.elementIds.length === 0)
        return failure(deck, "elementIds must not be empty");
      const slide = deck.slides[index]!;
      const existingIds = new Set((slide.elements ?? []).map((e) => e.id));
      const validIds = cmd.elementIds.filter((id) => existingIds.has(id));
      if (validIds.length === 0)
        return failure(deck, "None of the element ids were found");
      return success(
        removeElements(deck, index, validIds),
        [cmd.slideId],
        validIds,
        undefined,
        [
          makePatch("element.remove_multi", [cmd.slideId], validIds, {
            removedIds: validIds,
          }),
        ],
      );
    }

    case "DUPLICATE_ELEMENT": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      const slide = deck.slides[index]!;
      if (!slide.elements?.some((e) => e.id === cmd.elementId)) {
        return failure(deck, `Element not found: ${cmd.elementId}`);
      }
      const { deck: next, newElementId } = duplicateElement(
        deck,
        index,
        cmd.elementId,
      );
      if (!newElementId) return failure(deck, "Duplicate element failed");
      return success(
        next,
        [cmd.slideId],
        [cmd.elementId, newElementId],
        undefined,
        [
          makePatch(
            "element.duplicate",
            [cmd.slideId],
            [cmd.elementId, newElementId],
            {
              addedIds: [newElementId],
            },
          ),
        ],
      );
    }

    case "DUPLICATE_ELEMENTS": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      if (cmd.elementIds.length === 0)
        return failure(deck, "elementIds must not be empty");
      const { deck: next, newElementIds } = duplicateElements(
        deck,
        index,
        cmd.elementIds,
      );
      if (newElementIds.length === 0)
        return failure(deck, "Duplicate elements failed");
      const affected = [...cmd.elementIds, ...newElementIds];
      return success(next, [cmd.slideId], affected, undefined, [
        makePatch("element.duplicate_multi", [cmd.slideId], affected, {
          addedIds: newElementIds,
        }),
      ]);
    }

    case "NUDGE_ELEMENTS": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      if (cmd.elementIds.length === 0)
        return failure(deck, "elementIds must not be empty");
      return success(
        nudgeElements(deck, index, cmd.elementIds, cmd.dx, cmd.dy),
        [cmd.slideId],
        cmd.elementIds,
        cmd.coalesceKey,
        [makePatch("element.nudge", [cmd.slideId], cmd.elementIds)],
      );
    }

    case "GROUP_ELEMENTS": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      if (cmd.elementIds.length < 2) {
        return failure(deck, "GROUP_ELEMENTS requires at least 2 element ids");
      }
      const { deck: next } = groupElements(deck, index, cmd.elementIds);
      return success(next, [cmd.slideId], cmd.elementIds, undefined, [
        makePatch("element.group", [cmd.slideId], cmd.elementIds),
      ]);
    }

    case "UNGROUP_ELEMENTS": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      const slide = deck.slides[index]!;
      const memberIds = (slide.elements ?? [])
        .filter((e) => (e as { groupId?: string }).groupId === cmd.groupId)
        .map((e) => e.id);
      if (memberIds.length === 0) {
        return failure(deck, `Group not found: ${cmd.groupId}`);
      }
      return success(
        ungroupElements(deck, index, cmd.groupId),
        [cmd.slideId],
        memberIds,
        undefined,
        [makePatch("element.ungroup", [cmd.slideId], memberIds)],
      );
    }

    case "ALIGN_ELEMENTS": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      if (cmd.elementIds.length < 2) {
        return failure(deck, "ALIGN_ELEMENTS requires at least 2 element ids");
      }
      return success(
        alignElements(deck, index, cmd.elementIds, cmd.mode),
        [cmd.slideId],
        cmd.elementIds,
        undefined,
        [makePatch("element.align", [cmd.slideId], cmd.elementIds)],
      );
    }

    case "DISTRIBUTE_ELEMENTS": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      if (cmd.elementIds.length < 3) {
        return failure(
          deck,
          "DISTRIBUTE_ELEMENTS requires at least 3 element ids",
        );
      }
      return success(
        distributeElements(deck, index, cmd.elementIds, cmd.mode),
        [cmd.slideId],
        cmd.elementIds,
        undefined,
        [makePatch("element.distribute", [cmd.slideId], cmd.elementIds)],
      );
    }

    case "MATCH_SIZE_ELEMENTS": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      if (cmd.elementIds.length < 2) {
        return failure(
          deck,
          "MATCH_SIZE_ELEMENTS requires at least 2 element ids",
        );
      }
      return success(
        matchSizeElements(deck, index, cmd.elementIds, cmd.mode),
        [cmd.slideId],
        cmd.elementIds,
        undefined,
        [makePatch("element.match_size", [cmd.slideId], cmd.elementIds)],
      );
    }

    case "ARRANGE_ELEMENTS": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      if (cmd.elementIds.length === 0)
        return failure(deck, "elementIds must not be empty");
      return success(
        arrangeSelectedElements(deck, index, cmd.elementIds, cmd.mode),
        [cmd.slideId],
        cmd.elementIds,
        undefined,
        [makePatch("element.arrange", [cmd.slideId], cmd.elementIds)],
      );
    }

    case "BRING_ELEMENT_TO_FRONT": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      const slide = deck.slides[index]!;
      if (!slide.elements?.some((e) => e.id === cmd.elementId)) {
        return failure(deck, `Element not found: ${cmd.elementId}`);
      }
      return success(
        bringElementToFront(deck, index, cmd.elementId),
        [cmd.slideId],
        [cmd.elementId],
        undefined,
        [makePatch("element.bring_to_front", [cmd.slideId], [cmd.elementId])],
      );
    }

    case "SEND_ELEMENT_TO_BACK": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      const slide = deck.slides[index]!;
      if (!slide.elements?.some((e) => e.id === cmd.elementId)) {
        return failure(deck, `Element not found: ${cmd.elementId}`);
      }
      return success(
        sendElementToBack(deck, index, cmd.elementId),
        [cmd.slideId],
        [cmd.elementId],
        undefined,
        [makePatch("element.send_to_back", [cmd.slideId], [cmd.elementId])],
      );
    }

    case "SET_ELEMENT_BOXES": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      const elementIds = Object.keys(cmd.boxesById);
      if (elementIds.length === 0)
        return failure(deck, "boxesById must not be empty");
      return success(
        setElementBoxes(deck, index, cmd.boxesById),
        [cmd.slideId],
        elementIds,
        cmd.coalesceKey,
        [makePatch("element.set_boxes", [cmd.slideId], elementIds)],
      );
    }

    case "SET_ELEMENT_PATCHES": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      const elementIds = Object.keys(cmd.patchesById);
      if (elementIds.length === 0)
        return failure(deck, "patchesById must not be empty");
      return success(
        setElementPatches(deck, index, cmd.patchesById),
        [cmd.slideId],
        elementIds,
        cmd.coalesceKey,
        [
          makePatch("element.set_patches", [cmd.slideId], elementIds, {
            elementFields: cmd.patchesById,
          }),
        ],
      );
    }

    case "SET_ELEMENT_HIDDEN": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      const slide = deck.slides[index]!;
      if (!slide.elements?.some((e) => e.id === cmd.elementId)) {
        return failure(deck, `Element not found: ${cmd.elementId}`);
      }
      return success(
        setElementHidden(deck, index, cmd.elementId, cmd.hidden),
        [cmd.slideId],
        [cmd.elementId],
        undefined,
        [makePatch("element.set_hidden", [cmd.slideId], [cmd.elementId])],
      );
    }

    case "SET_ELEMENT_LOCKED": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      const slide = deck.slides[index]!;
      if (!slide.elements?.some((e) => e.id === cmd.elementId)) {
        return failure(deck, `Element not found: ${cmd.elementId}`);
      }
      return success(
        setElementLocked(deck, index, cmd.elementId, cmd.locked),
        [cmd.slideId],
        [cmd.elementId],
        undefined,
        [makePatch("element.set_locked", [cmd.slideId], [cmd.elementId])],
      );
    }

    case "MOVE_ELEMENT_ZORDER": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      const slide = deck.slides[index]!;
      if (!slide.elements?.some((e) => e.id === cmd.elementId)) {
        return failure(deck, `Element not found: ${cmd.elementId}`);
      }
      return success(
        moveElementZOrder(deck, index, cmd.elementId, cmd.direction),
        [cmd.slideId],
        [cmd.elementId],
        undefined,
        [makePatch("element.move_zorder", [cmd.slideId], [cmd.elementId])],
      );
    }

    case "RENAME_ELEMENT": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      const slide = deck.slides[index]!;
      if (!slide.elements?.some((e) => e.id === cmd.elementId)) {
        return failure(deck, `Element not found: ${cmd.elementId}`);
      }
      return success(
        renameElement(deck, index, cmd.elementId, cmd.name),
        [cmd.slideId],
        [cmd.elementId],
        undefined,
        [makePatch("element.rename", [cmd.slideId], [cmd.elementId])],
      );
    }

    // ── #400 — style, theme, layout, asset commands ─────────────────────────

    case "SET_DECK_THEME": {
      return success(
        setDeckTheme(deck, cmd.theme),
        deck.slides.map((s) => s.id),
        [],
        undefined,
        [
          makePatch(
            "deck.set_theme",
            deck.slides.map((s) => s.id),
            [],
            {
              deckFields: { theme: cmd.theme },
            },
          ),
        ],
      );
    }

    case "SET_DECK_FORMAT": {
      return success(
        setDeckSlideFormat(deck, cmd.slideFormat),
        [],
        [],
        undefined,
        [
          makePatch("deck.set_format", [], [], {
            deckFields: { slideFormat: cmd.slideFormat },
          }),
        ],
      );
    }

    case "SET_SLIDE_BACKGROUND": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      const fields: DeckPatch["slideFields"] =
        cmd.background !== undefined
          ? { [cmd.slideId]: { background: cmd.background } }
          : { [cmd.slideId]: {} };
      return success(
        setSlideBackground(deck, index, cmd.background),
        [cmd.slideId],
        [],
        undefined,
        [
          makePatch("slide.set_background", [cmd.slideId], [], {
            slideFields: fields,
          }),
        ],
      );
    }

    case "SET_SLIDE_BACKGROUND_GRADIENT": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      const fields: DeckPatch["slideFields"] =
        cmd.gradient !== undefined
          ? { [cmd.slideId]: { backgroundGradient: cmd.gradient } }
          : { [cmd.slideId]: {} };
      return success(
        setSlideBackgroundGradient(deck, index, cmd.gradient),
        [cmd.slideId],
        [],
        undefined,
        [
          makePatch("slide.set_background_gradient", [cmd.slideId], [], {
            slideFields: fields,
          }),
        ],
      );
    }

    case "SET_SLIDE_BACKGROUND_IMAGE": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      const fields: DeckPatch["slideFields"] =
        cmd.image !== undefined
          ? { [cmd.slideId]: { backgroundImage: cmd.image } }
          : { [cmd.slideId]: {} };
      return success(
        setSlideBackgroundImage(deck, index, cmd.image),
        [cmd.slideId],
        [],
        undefined,
        [
          makePatch("slide.set_background_image", [cmd.slideId], [], {
            slideFields: fields,
          }),
        ],
      );
    }

    case "SET_SLIDE_BACKGROUND_ASSET": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      const fields: DeckPatch["slideFields"] = cmd.opts
        ? {
            [cmd.slideId]: {
              backgroundImage: cmd.opts.url,
              backgroundAssetId: cmd.opts.assetId,
            },
          }
        : { [cmd.slideId]: {} };
      return success(
        setSlideBackgroundAsset(deck, index, cmd.opts),
        [cmd.slideId],
        [],
        undefined,
        [
          makePatch("slide.set_background_asset", [cmd.slideId], [], {
            slideFields: fields,
          }),
        ],
      );
    }

    case "SET_SLIDE_ACCENT": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      const fields: DeckPatch["slideFields"] =
        cmd.accent !== undefined
          ? { [cmd.slideId]: { accent: cmd.accent } }
          : { [cmd.slideId]: {} };
      return success(
        setSlideAccent(deck, index, cmd.accent),
        [cmd.slideId],
        [],
        undefined,
        [
          makePatch("slide.set_accent", [cmd.slideId], [], {
            slideFields: fields,
          }),
        ],
      );
    }
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
  if (a.type !== b.type) return false;

  if (a.type === "UPDATE_SLIDE" && b.type === "UPDATE_SLIDE") {
    return (
      a.coalesceKey !== undefined &&
      a.coalesceKey === b.coalesceKey &&
      a.slideId === b.slideId
    );
  }

  if (a.type === "UPDATE_ELEMENT" && b.type === "UPDATE_ELEMENT") {
    return (
      a.coalesceKey !== undefined &&
      a.coalesceKey === b.coalesceKey &&
      a.slideId === b.slideId &&
      a.elementId === b.elementId
    );
  }

  if (a.type === "UPDATE_SLIDE_TITLE" && b.type === "UPDATE_SLIDE_TITLE") {
    return (
      a.coalesceKey !== undefined &&
      a.coalesceKey === b.coalesceKey &&
      a.slideId === b.slideId
    );
  }

  if (a.type === "UPDATE_SLIDE_BODY" && b.type === "UPDATE_SLIDE_BODY") {
    return (
      a.coalesceKey !== undefined &&
      a.coalesceKey === b.coalesceKey &&
      a.slideId === b.slideId
    );
  }

  if (a.type === "UPDATE_SLIDE_NOTES" && b.type === "UPDATE_SLIDE_NOTES") {
    return (
      a.coalesceKey !== undefined &&
      a.coalesceKey === b.coalesceKey &&
      a.slideId === b.slideId
    );
  }

  return false;
}

function mergeCommands(a: SlideCommand, b: SlideCommand): SlideCommand {
  if (a.type === "UPDATE_SLIDE" && b.type === "UPDATE_SLIDE") {
    return { ...a, patch: { ...a.patch, ...b.patch } };
  }
  if (a.type === "UPDATE_ELEMENT" && b.type === "UPDATE_ELEMENT") {
    return { ...a, patch: { ...a.patch, ...b.patch } };
  }
  if (a.type === "UPDATE_SLIDE_TITLE" && b.type === "UPDATE_SLIDE_TITLE") {
    // Last write wins: take the latest title.
    return { ...a, title: b.title };
  }
  if (a.type === "UPDATE_SLIDE_BODY" && b.type === "UPDATE_SLIDE_BODY") {
    return { ...a, bullets: b.bullets };
  }
  if (a.type === "UPDATE_SLIDE_NOTES" && b.type === "UPDATE_SLIDE_NOTES") {
    return { ...a, notes: b.notes };
  }
  // Unreachable — canCoalesce guards this path.
  return b;
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
