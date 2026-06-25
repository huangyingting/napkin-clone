"use client";

import { useCallback, useRef } from "react";

import { addElement } from "@/lib/presentation/deck-mutations";
import {
  makeElementId,
  type Deck,
  type ElementBox,
  type SlideElement,
} from "@/lib/presentation/deck";
import type { DeckPatch } from "@/lib/presentation/slide-commands";

import { clearPendingPatches } from "./use-slide-editor-commit";
import { slideSelectionIdList } from "@/lib/presentation/slide-selection";

const PASTE_OFFSET_PCT = 3;
const PASTE_OFFSET_WRAP_STEPS = 8;

type CommitAndChange = (
  deck: Deck,
  cmd: { type: "REMOVE_ELEMENTS"; slideId: string; elementIds: string[] },
) => void;

export function useSlideClipboard({
  deck,
  safeSelected,
  effectiveSelectedElementId,
  effectiveSelectedElementIds,
  pendingPatchesRef,
  onDeckChange,
  doCommitAndChange,
  setSelectedElementId,
  setSelectedElementIds,
}: {
  deck: Deck;
  safeSelected: number;
  effectiveSelectedElementId: string | null;
  effectiveSelectedElementIds: ReadonlySet<string>;
  pendingPatchesRef: { current: DeckPatch[] };
  onDeckChange: (deck: Deck) => void;
  doCommitAndChange: CommitAndChange;
  setSelectedElementId: (id: string | null) => void;
  setSelectedElementIds: (ids: Set<string>) => void;
}) {
  const clipboardRef = useRef<SlideElement[] | null>(null);
  const pasteCountRef = useRef(0);

  const selectedElementIdList = useCallback(
    () =>
      slideSelectionIdList(
        effectiveSelectedElementId,
        effectiveSelectedElementIds,
      ),
    [effectiveSelectedElementId, effectiveSelectedElementIds],
  );

  const copyElementsToClipboard = useCallback(
    (sourceDeck: Deck, slideIndex: number, ids: readonly string[]) => {
      if (ids.length === 0) return false;
      const slideEls = sourceDeck.slides[slideIndex]?.elements ?? [];
      const copied = slideEls.filter((el) => ids.includes(el.id));
      if (copied.length === 0) return false;
      const selectedIdSet = new Set(ids);
      const partialGroups = new Set<string>();
      for (const el of slideEls) {
        const groupId = (el as { groupId?: string }).groupId;
        if (groupId && !selectedIdSet.has(el.id)) partialGroups.add(groupId);
      }
      clipboardRef.current = copied.map((el) => {
        const clone = structuredClone(el);
        const groupId = (clone as { groupId?: string }).groupId;
        if (groupId && partialGroups.has(groupId)) {
          delete (clone as { groupId?: string }).groupId;
        }
        return clone;
      });
      pasteCountRef.current = 0;
      return true;
    },
    [],
  );

  const pasteClipboardElements = useCallback(
    (sourceDeck: Deck, slideIndex: number) => {
      const clip = clipboardRef.current;
      if (!clip || clip.length === 0) return null;
      const groupRemap = new Map<string, string>();
      for (const el of clip) {
        const groupId = (el as { groupId?: string }).groupId;
        if (groupId && !groupRemap.has(groupId)) {
          groupRemap.set(groupId, makeElementId());
        }
      }
      let nextDeck = sourceDeck;
      const newIds: string[] = [];
      const pasteStep = (pasteCountRef.current % PASTE_OFFSET_WRAP_STEPS) + 1;
      const offset = pasteStep * PASTE_OFFSET_PCT;
      for (const el of clip) {
        const id = makeElementId();
        newIds.push(id);
        const x = Math.max(0, Math.min(100 - el.box.w, el.box.x + offset));
        const y = Math.max(0, Math.min(100 - el.box.h, el.box.y + offset));
        const clone = structuredClone(el);
        clone.id = id;
        clone.box = { ...clone.box, x, y } satisfies ElementBox;
        delete (clone as { zIndex?: number }).zIndex;
        const groupId = (clone as { groupId?: string }).groupId;
        if (groupId) {
          (clone as { groupId?: string }).groupId = groupRemap.get(groupId);
        }
        nextDeck = addElement(nextDeck, slideIndex, clone);
      }
      pasteCountRef.current += 1;
      return { deck: nextDeck, newIds };
    },
    [],
  );

  const handleCopyElements = useCallback(() => {
    const ids = selectedElementIdList();
    copyElementsToClipboard(deck, safeSelected, ids);
  }, [copyElementsToClipboard, deck, safeSelected, selectedElementIdList]);

  const handleCutElements = useCallback(() => {
    const ids = selectedElementIdList();
    if (!copyElementsToClipboard(deck, safeSelected, ids)) return;
    const slideId = deck.slides[safeSelected]?.id;
    if (!slideId) return;
    doCommitAndChange(deck, {
      type: "REMOVE_ELEMENTS",
      slideId,
      elementIds: ids,
    });
    setSelectedElementId(null);
    setSelectedElementIds(new Set());
  }, [
    copyElementsToClipboard,
    deck,
    safeSelected,
    doCommitAndChange,
    selectedElementIdList,
    setSelectedElementId,
    setSelectedElementIds,
  ]);

  const handlePasteElements = useCallback(() => {
    const pasted = pasteClipboardElements(deck, safeSelected);
    if (!pasted) return;
    clearPendingPatches(pendingPatchesRef);
    onDeckChange(pasted.deck);
    setSelectedElementId(pasted.newIds[0] ?? null);
    setSelectedElementIds(new Set(pasted.newIds));
  }, [
    deck,
    safeSelected,
    onDeckChange,
    pasteClipboardElements,
    pendingPatchesRef,
    setSelectedElementId,
    setSelectedElementIds,
  ]);

  return {
    selectedElementIdList,
    copyElementsToClipboard,
    pasteClipboardElements,
    handleCopyElements,
    handleCutElements,
    handlePasteElements,
  };
}
