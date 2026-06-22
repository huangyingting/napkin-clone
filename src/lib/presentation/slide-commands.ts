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
 *  - `CommandResult` exposes enough metadata (affected ids, historyKey) for
 *    upstream undo/redo, autosave, and analytics consumers.
 */

import type { Deck, Slide, SlideElement } from "./deck";
import type { DistributiveOmit, ElementPatch } from "./deck-mutations";
import {
  addElement,
  addSlide,
  duplicateSlide,
  removeElement,
  removeSlide,
  reorderSlides,
  updateElement,
  updateSlide,
} from "./deck-mutations";

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

/** Discriminated union of all supported slide commands. */
export type SlideCommand =
  | AddSlideCommand
  | RemoveSlideCommand
  | DuplicateSlideCommand
  | ReorderSlideCommand
  | UpdateSlideCommand
  | AddElementCommand
  | UpdateElementCommand
  | RemoveElementCommand;

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
  };
}

function success(
  deck: Deck,
  affectedSlideIds: string[],
  affectedElementIds: string[],
  historyKey?: string,
): CommandResult {
  return {
    ok: true,
    deck,
    affectedSlideIds,
    affectedElementIds,
    ...(historyKey !== undefined ? { historyKey } : {}),
  };
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

/**
 * Pure command executor: applies `cmd` to `deck` and returns a
 * {@link CommandResult}.
 *
 * - The input `deck` is **never mutated** (all mutation helpers are immutable).
 * - On a validation failure (`ok: false`) the returned `deck` is the same
 *   reference as the input — no partial mutation occurs.
 * - Deterministic: the same `deck` and `cmd` always produce the same output.
 */
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
      return success(next, newSlide ? [newSlide.id] : [], []);
    }

    case "REMOVE_SLIDE": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      if (deck.slides.length <= 1)
        return failure(deck, "Cannot remove the last slide");

      return success(removeSlide(deck, index), [cmd.slideId], []);
    }

    case "DUPLICATE_SLIDE": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);

      const next = duplicateSlide(deck, index);
      const originalIds = new Set(deck.slides.map((s) => s.id));
      const newSlide = next.slides.find((s) => !originalIds.has(s.id));
      return success(
        next,
        [cmd.slideId, ...(newSlide ? [newSlide.id] : [])],
        [],
      );
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
      return success(next, affectedSlideIds, []);
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
      );
    }

    case "ADD_ELEMENT": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);

      const next = addElement(deck, index, cmd.element);
      const nextSlide = next.slides[index];
      const elements = nextSlide?.elements;
      const newElement = elements?.[elements.length - 1];
      return success(next, [cmd.slideId], newElement ? [newElement.id] : []);
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

  return false;
}

function mergeCommands(a: SlideCommand, b: SlideCommand): SlideCommand {
  if (a.type === "UPDATE_SLIDE" && b.type === "UPDATE_SLIDE") {
    return { ...a, patch: { ...a.patch, ...b.patch } };
  }
  if (a.type === "UPDATE_ELEMENT" && b.type === "UPDATE_ELEMENT") {
    return { ...a, patch: { ...a.patch, ...b.patch } };
  }
  // Unreachable — canCoalesce guards this path.
  return b;
}
