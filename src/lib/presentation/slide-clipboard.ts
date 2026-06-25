import { addElement } from "@/lib/presentation/deck-mutations";
import {
  makeElementId,
  type Deck,
  type SlideElement,
} from "@/lib/presentation/deck";

export const PASTE_OFFSET_PCT = 3;
export const PASTE_OFFSET_WRAP_STEPS = 8;

export function cloneElementsForClipboard(
  slideElements: readonly SlideElement[],
  ids: readonly string[],
): SlideElement[] {
  if (ids.length === 0) return [];
  const copied = slideElements.filter((el) => ids.includes(el.id));
  if (copied.length === 0) return [];

  const selectedIdSet = new Set(ids);
  const partialGroups = new Set<string>();
  for (const el of slideElements) {
    const groupId = (el as { groupId?: string }).groupId;
    if (groupId && !selectedIdSet.has(el.id)) partialGroups.add(groupId);
  }

  return copied.map((el) => {
    const clone = structuredClone(el);
    const groupId = (clone as { groupId?: string }).groupId;
    if (groupId && partialGroups.has(groupId)) {
      delete (clone as { groupId?: string }).groupId;
    }
    return clone;
  });
}

export function pasteClipboardElementsIntoDeck(
  sourceDeck: Deck,
  slideIndex: number,
  clipboard: readonly SlideElement[] | null,
  pasteCount: number,
  idFactory: () => string = makeElementId,
): { deck: Deck; newIds: string[]; nextPasteCount: number } | null {
  if (!clipboard || clipboard.length === 0) return null;

  const groupRemap = new Map<string, string>();
  for (const el of clipboard) {
    const groupId = (el as { groupId?: string }).groupId;
    if (groupId && !groupRemap.has(groupId)) {
      groupRemap.set(groupId, idFactory());
    }
  }

  let nextDeck = sourceDeck;
  const newIds: string[] = [];
  const pasteStep = (pasteCount % PASTE_OFFSET_WRAP_STEPS) + 1;
  const offset = pasteStep * PASTE_OFFSET_PCT;
  for (const el of clipboard) {
    const id = idFactory();
    newIds.push(id);
    const x = Math.max(0, Math.min(100 - el.box.w, el.box.x + offset));
    const y = Math.max(0, Math.min(100 - el.box.h, el.box.y + offset));
    const clone = structuredClone(el);
    clone.id = id;
    clone.box = { ...clone.box, x, y };
    delete (clone as { zIndex?: number }).zIndex;
    const groupId = (clone as { groupId?: string }).groupId;
    if (groupId) {
      (clone as { groupId?: string }).groupId = groupRemap.get(groupId);
    }
    nextDeck = addElement(nextDeck, slideIndex, clone);
  }

  return { deck: nextDeck, newIds, nextPasteCount: pasteCount + 1 };
}
