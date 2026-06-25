import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck, SlideElement } from "./deck";
import {
  cloneElementsForClipboard,
  pasteClipboardElementsIntoDeck,
} from "./slide-clipboard";

function textElement(
  id: string,
  groupId?: string,
  box = { x: 0, y: 0, w: 20, h: 10 },
): SlideElement {
  return {
    id,
    kind: "text",
    text: id,
    role: "body",
    box,
    zIndex: 0,
    style: { fontSize: 4, bold: false, italic: false, align: "left" },
    ...(groupId ? { groupId } : {}),
  };
}

function deckWith(elements: SlideElement[]): Deck {
  return {
    theme: "default",
    slides: [
      {
        id: "s1",
        index: 0,
        title: "",
        bullets: [],
        visualIds: [],
        layout: "blank",
        notes: "",
        theme: "default",
        elements,
      },
    ],
  };
}

test("cloneElementsForClipboard clears group ids for partial groups", () => {
  const copied = cloneElementsForClipboard(
    [textElement("a", "g1"), textElement("b", "g1")],
    ["a"],
  );
  assert.equal((copied[0] as { groupId?: string }).groupId, undefined);
});

test("cloneElementsForClipboard preserves group ids when the whole group is copied", () => {
  const copied = cloneElementsForClipboard(
    [textElement("a", "g1"), textElement("b", "g1")],
    ["a", "b"],
  );
  assert.deepEqual(
    copied.map((el) => (el as { groupId?: string }).groupId),
    ["g1", "g1"],
  );
});

test("pasteClipboardElementsIntoDeck offsets pasted elements and remaps groups", () => {
  const ids = ["group-new", "a-new", "b-new"];
  const pasted = pasteClipboardElementsIntoDeck(
    deckWith([]),
    0,
    [
      textElement("a", "g1"),
      textElement("b", "g1", { x: 90, y: 95, w: 20, h: 10 }),
    ],
    0,
    () => ids.shift() ?? "fallback",
  );
  assert.ok(pasted);
  assert.deepEqual(pasted.newIds, ["a-new", "b-new"]);
  const elements = pasted.deck.slides[0].elements ?? [];
  assert.equal((elements[0] as { groupId?: string }).groupId, "group-new");
  assert.equal((elements[1] as { groupId?: string }).groupId, "group-new");
  assert.deepEqual(elements[0].box, { x: 3, y: 3, w: 20, h: 10 });
  assert.deepEqual(elements[1].box, { x: 80, y: 90, w: 20, h: 10 });
  assert.equal(pasted.nextPasteCount, 1);
});
