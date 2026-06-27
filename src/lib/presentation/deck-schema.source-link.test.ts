import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isSourceLinked,
  isSourceStale,
  relinkSource,
  unlinkSource,
  type SourceRef,
  type TextElement,
} from "./deck";
import { safeParseDeck, validateSourceRef } from "./deck-schema";
import { buildSourceRef } from "@/test/builders/deck";
import { elementDeck } from "./deck-schema.test-helpers";

function makeSourceRef(overrides: Partial<SourceRef> = {}): SourceRef {
  return buildSourceRef({
    documentId: "doc-1",
    blockId: "block-1",
    contentHash: "hash-1",
    ...overrides,
  });
}

function sourceLinkedTextElement(
  source: SourceRef = makeSourceRef(),
): TextElement {
  return {
    id: "linked-text",
    kind: "text",
    role: "body",
    zIndex: 0,
    box: { x: 1, y: 2, w: 30, h: 12 },
    content: { kind: "text", text: "Linked content" },
    designOverrides: {
      textStyle: { fontSize: 4, bold: false, italic: false, align: "left" },
    },
    source,
  } as unknown as TextElement;
}

test("validateSourceRef accepts source link metadata", () => {
  const ref = makeSourceRef({ unlinked: true });
  assert.deepEqual(validateSourceRef(ref, "sourceRef"), ref);
});

test("safeParseDeck round-trips an element sourceRef", () => {
  const result = safeParseDeck(elementDeck([sourceLinkedTextElement()]));
  assert.equal(result.success, true);
  if (result.success) {
    const el = result.data.slides[0].elements?.[0];
    assert.equal(el?.kind, "text");
    assert.deepEqual((el as any)?.source, makeSourceRef());
  }
});

test("validateSourceRef rejects invalid source link metadata", () => {
  assert.throws(
    () =>
      validateSourceRef(
        {
          documentId: "doc-1",
          blockId: "",
          linkedAt: "not-a-timestamp",
        },
        "sourceRef",
      ),
    /sourceRef\.blockId must be a non-empty string/,
  );
  assert.throws(
    () =>
      validateSourceRef(
        {
          documentId: "doc-1",
          blockId: "block-1",
          linkedAt: "not-a-timestamp",
        },
        "sourceRef",
      ),
    /sourceRef\.linkedAt must be a valid ISO timestamp/,
  );
});

test("validateSourceRef rejects empty documentId", () => {
  assert.throws(
    () =>
      validateSourceRef(
        {
          documentId: "",
          blockId: "block-1",
          linkedAt: "2026-06-22T17:49:04.676Z",
        },
        "sourceRef",
      ),
    /sourceRef\.documentId must be a non-empty string/,
  );
});

test("safeParseDeck rejects an element with an invalid sourceRef", () => {
  const result = safeParseDeck(
    elementDeck([
      {
        ...sourceLinkedTextElement(),
        source: {
          documentId: "doc-1",
          blockId: "block-1",
          linkedAt: "yesterday",
        },
      },
    ]),
  );
  assert.equal(result.success, false);
});

test("isSourceLinked and isSourceStale reflect source link state", () => {
  const linked = sourceLinkedTextElement(
    makeSourceRef({ contentHash: "hash-a" }),
  );
  assert.equal(isSourceLinked(linked), true);
  assert.equal(isSourceStale(linked, "hash-a"), false);
  assert.equal(isSourceStale(linked, "hash-b"), true);

  const withoutHash = sourceLinkedTextElement(
    makeSourceRef({ contentHash: undefined }),
  );
  assert.equal(isSourceStale(withoutHash, "hash-b"), false);
  assert.equal(
    isSourceLinked(sourceLinkedTextElement(makeSourceRef({ unlinked: true }))),
    false,
  );
});

test("unlinkSource marks an element as intentionally unlinked", () => {
  const element = sourceLinkedTextElement();
  const unlinked = unlinkSource(element);
  assert.notEqual(unlinked, element);
  assert.deepEqual(unlinked.source, {
    ...makeSourceRef(),
    unlinked: true,
  });
  assert.equal(isSourceLinked(unlinked), false);
});

test("unlinkSource returns same object identity when element has no sourceRef", () => {
  const element: TextElement = {
    id: "no-source",
    kind: "text",
    content: {
      kind: "text",
      text: "No source",
      paragraphs: [{ text: "No source" }],
    },
    zIndex: 0,
    box: { x: 0, y: 0, w: 10, h: 5 },
    designOverrides: {
      textStyle: { fontSize: 4, bold: false, italic: false, align: "left" },
    },
  };
  assert.strictEqual(unlinkSource(element), element);
});

test("unlinkSource returns same object identity when sourceRef.unlinked is already true", () => {
  const element = sourceLinkedTextElement(makeSourceRef({ unlinked: true }));
  assert.strictEqual(unlinkSource(element), element);
});

test("relinkSource restores an active source link", () => {
  const element = unlinkSource(sourceLinkedTextElement());
  const relinked = relinkSource(
    element,
    makeSourceRef({
      blockId: "block-2",
      contentHash: "hash-2",
      linkedAt: "2026-06-23T00:00:00.000Z",
      unlinked: true,
    }),
  );
  assert.equal(isSourceLinked(relinked), true);
  assert.deepEqual(relinked.source, {
    documentId: "doc-1",
    blockId: "block-2",
    contentHash: "hash-2",
    linkedAt: "2026-06-23T00:00:00.000Z",
    blockKind: "text",
  });
});
