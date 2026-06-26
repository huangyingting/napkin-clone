import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  Deck,
  Slide,
  SourceRef,
  TextElement,
  VisualElement,
} from "./deck";
import { CURRENT_DECK_SCHEMA_VERSION } from "./deck";
import {
  activeSourceRef,
  durableBlockIdFromSourceRef,
  sourceRefFromDurableBlockId,
} from "./deck-source-refs";
import {
  applyPatch,
  executeCommand,
  type SlideCommand,
} from "./slide-commands";

// ---------------------------------------------------------------------------
// Fixtures — source-ref deck commands (Epic #494)
// ---------------------------------------------------------------------------

const LINKED_REF: SourceRef = {
  documentId: "doc-1",
  blockId: "blk-1",
  contentHash: "hash-old",
  linkedAt: "2026-06-01T00:00:00.000Z",
  blockKind: "text",
};

function textElement(): TextElement {
  return {
    id: "el-text",
    kind: "text",
    text: "old text",
    runs: [{ text: "old text" }],
    style: { fontSize: 5, bold: true, italic: false, align: "left" },
    box: { x: 12, y: 34, w: 56, h: 7 },
    zIndex: 9,
    rotation: 15,
    opacity: 0.5,
    locked: false,
    name: "My Text",
    sourceRef: { ...LINKED_REF },
  };
}

function visualElement(): VisualElement {
  return {
    id: "el-visual",
    kind: "visual",
    visualId: "vis-old",
    box: { x: 5, y: 6, w: 40, h: 30 },
    zIndex: 3,
    rotation: 0,
    opacity: 1,
    sourceRef: { ...LINKED_REF, blockId: "vis-old", blockKind: "visual" },
  };
}

function slideWith(...elements: (TextElement | VisualElement)[]): Slide {
  return {
    id: "s1",
    index: 0,
    title: "",
    bullets: [],
    visualIds: [],
    layout: "blank",
    notes: "",
    elements,
    elementsDerived: false,
  };
}

function deckWith(...elements: (TextElement | VisualElement)[]): Deck {
  return { themeId: "default", slides: [slideWith(...elements)] };
}

function getElement(deck: Deck, id: string) {
  return deck.slides[0]!.elements!.find((e) => e.id === id);
}

const FRESH_REF: SourceRef = {
  documentId: "doc-1",
  blockId: "blk-1",
  contentHash: "hash-new",
  linkedAt: "2026-06-23T00:00:00.000Z",
  blockKind: "text",
};

// ---------------------------------------------------------------------------
// REFRESH_ELEMENT_FROM_SOURCE
// ---------------------------------------------------------------------------

test("REFRESH_ELEMENT_FROM_SOURCE updates text + sourceRef and preserves geometry/style/z-order", () => {
  const original = textElement();
  const deck = deckWith(original);
  const cmd: SlideCommand = {
    type: "REFRESH_ELEMENT_FROM_SOURCE",
    slideId: "s1",
    elementId: "el-text",
    sourceRef: FRESH_REF,
    text: "new text",
    runs: [{ text: "new text" }],
  };

  const result = executeCommand(deck, cmd);
  assert.equal(result.ok, true);

  const updated = getElement(result.deck, "el-text") as TextElement;
  assert.equal(updated.text, "new text");
  assert.deepEqual(updated.runs, [{ text: "new text" }]);
  assert.deepEqual(updated.sourceRef, FRESH_REF);
  // Geometry / style / z-order / other metadata preserved verbatim.
  assert.deepEqual(updated.box, original.box);
  assert.deepEqual(updated.style, original.style);
  assert.equal(updated.zIndex, original.zIndex);
  assert.equal(updated.rotation, original.rotation);
  assert.equal(updated.opacity, original.opacity);
  assert.equal(updated.name, original.name);
  // Input deck never mutated.
  assert.equal((getElement(deck, "el-text") as TextElement).text, "old text");

  // Patch is valid and re-appliable.
  assert.equal(result.patches.length, 1);
  const patch = result.patches[0]!;
  assert.equal(patch.op, "element.update");
  assert.equal(patch.schemaVersion, CURRENT_DECK_SCHEMA_VERSION);
  assert.deepEqual(patch.slideIds, ["s1"]);
  assert.deepEqual(patch.elementIds, ["el-text"]);
  const replayed = applyPatch(deck, patch);
  assert.ok(replayed);
  assert.equal(
    (getElement(replayed!, "el-text") as TextElement).text,
    "new text",
  );
});

test("REFRESH_ELEMENT_FROM_SOURCE re-activates an unlinked element", () => {
  const el = textElement();
  el.sourceRef = { ...LINKED_REF, unlinked: true };
  const deck = deckWith(el);
  const result = executeCommand(deck, {
    type: "REFRESH_ELEMENT_FROM_SOURCE",
    slideId: "s1",
    elementId: "el-text",
    sourceRef: FRESH_REF,
    text: "fresh",
  });
  assert.equal(result.ok, true);
  const updated = getElement(result.deck, "el-text") as TextElement;
  assert.equal(updated.sourceRef?.unlinked, undefined);
});

test("source-ref durable block id adapters preserve shape and strip unlinked", () => {
  const ref = sourceRefFromDurableBlockId({
    documentId: "doc-1",
    blockId: "blk-1",
    blockKind: "text",
    contentHash: "hash-new",
    linkedAt: "2026-06-23T00:00:00.000Z",
  });

  assert.deepEqual(ref, FRESH_REF);
  assert.equal(durableBlockIdFromSourceRef(ref), "blk-1");
  assert.deepEqual(activeSourceRef({ ...ref, unlinked: true }), ref);
});

test("REFRESH_ELEMENT_FROM_SOURCE on a visual only touches the sourceRef", () => {
  const original = visualElement();
  const deck = deckWith(original);
  const newRef: SourceRef = {
    documentId: "doc-1",
    blockId: "vis-old",
    contentHash: "vis-hash-new",
    linkedAt: "2026-06-23T00:00:00.000Z",
    blockKind: "visual",
  };
  const result = executeCommand(deck, {
    type: "REFRESH_ELEMENT_FROM_SOURCE",
    slideId: "s1",
    elementId: "el-visual",
    sourceRef: newRef,
  });
  assert.equal(result.ok, true);
  const updated = getElement(result.deck, "el-visual") as VisualElement;
  assert.equal(updated.visualId, original.visualId);
  assert.deepEqual(updated.sourceRef, newRef);
  assert.deepEqual(updated.box, original.box);
  assert.equal(updated.zIndex, original.zIndex);
});

test("REFRESH_ELEMENT_FROM_SOURCE fails when the element has no source link", () => {
  const el = textElement();
  delete (el as { sourceRef?: SourceRef }).sourceRef;
  const deck = deckWith(el);
  const result = executeCommand(deck, {
    type: "REFRESH_ELEMENT_FROM_SOURCE",
    slideId: "s1",
    elementId: "el-text",
    sourceRef: FRESH_REF,
    text: "x",
  });
  assert.equal(result.ok, false);
  assert.equal(result.deck, deck);
});

// ---------------------------------------------------------------------------
// UNLINK_ELEMENT_SOURCE
// ---------------------------------------------------------------------------

test("UNLINK_ELEMENT_SOURCE marks the link broken without auto-deleting", () => {
  const original = textElement();
  const deck = deckWith(original);
  const result = executeCommand(deck, {
    type: "UNLINK_ELEMENT_SOURCE",
    slideId: "s1",
    elementId: "el-text",
  });
  assert.equal(result.ok, true);
  const updated = getElement(result.deck, "el-text") as TextElement;
  assert.equal(updated.sourceRef?.unlinked, true);
  // Element still present and unchanged otherwise.
  assert.equal(updated.text, original.text);
  assert.deepEqual(updated.box, original.box);
  assert.equal(updated.zIndex, original.zIndex);
  // Other sourceRef fields preserved.
  assert.equal(updated.sourceRef?.blockId, "blk-1");
  assert.equal(updated.sourceRef?.contentHash, "hash-old");

  const patch = result.patches[0]!;
  assert.equal(patch.op, "element.update");
  assert.equal(patch.elementFields?.["el-text"]?.sourceRef?.unlinked, true);
});

test("UNLINK_ELEMENT_SOURCE fails when no source link is present", () => {
  const el = textElement();
  delete (el as { sourceRef?: SourceRef }).sourceRef;
  const deck = deckWith(el);
  const result = executeCommand(deck, {
    type: "UNLINK_ELEMENT_SOURCE",
    slideId: "s1",
    elementId: "el-text",
  });
  assert.equal(result.ok, false);
});

// ---------------------------------------------------------------------------
// RELINK_ELEMENT_SOURCE
// ---------------------------------------------------------------------------

test("RELINK_ELEMENT_SOURCE repoints the source link and preserves the element", () => {
  const original = textElement();
  const deck = deckWith(original);
  const newRef: SourceRef = {
    documentId: "doc-1",
    blockId: "blk-2",
    contentHash: "hash-2",
    linkedAt: "2026-06-23T00:00:00.000Z",
    blockKind: "text",
  };
  const result = executeCommand(deck, {
    type: "RELINK_ELEMENT_SOURCE",
    slideId: "s1",
    elementId: "el-text",
    sourceRef: newRef,
  });
  assert.equal(result.ok, true);
  const updated = getElement(result.deck, "el-text") as TextElement;
  assert.equal(updated.sourceRef?.blockId, "blk-2");
  assert.equal(updated.sourceRef?.unlinked, undefined);
  // Content + geometry untouched on relink.
  assert.equal(updated.text, original.text);
  assert.deepEqual(updated.box, original.box);
  assert.equal(updated.zIndex, original.zIndex);
});

// ---------------------------------------------------------------------------
// REMOVE_SOURCE_ELEMENT
// ---------------------------------------------------------------------------

test("REMOVE_SOURCE_ELEMENT removes only the targeted orphaned element", () => {
  const keep = visualElement();
  const orphan = textElement();
  const deck = deckWith(keep, orphan);
  const result = executeCommand(deck, {
    type: "REMOVE_SOURCE_ELEMENT",
    slideId: "s1",
    elementId: "el-text",
  });
  assert.equal(result.ok, true);
  assert.equal(getElement(result.deck, "el-text"), undefined);
  assert.ok(getElement(result.deck, "el-visual"));
  const patch = result.patches[0]!;
  assert.equal(patch.op, "element.remove");
  assert.deepEqual(patch.removedIds, ["el-text"]);
});

test("REMOVE_SOURCE_ELEMENT fails for a missing element", () => {
  const deck = deckWith(textElement());
  const result = executeCommand(deck, {
    type: "REMOVE_SOURCE_ELEMENT",
    slideId: "s1",
    elementId: "nope",
  });
  assert.equal(result.ok, false);
});
