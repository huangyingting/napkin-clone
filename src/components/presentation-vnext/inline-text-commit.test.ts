import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { ShapeNode, TextNode } from "@/lib/presentation-vnext/schema";
import {
  buildDeckV7,
  buildShapeNode,
  buildSlideV7,
  buildTextNode,
  resetBuilderCounter,
} from "@/test/builders/deck-v7";

import { applyInlineTextCommit } from "./inline-text-commit";

describe("applyInlineTextCommit", () => {
  test("persists align + frame updates for text nodes", () => {
    resetBuilderCounter();
    const textNode = buildTextNode();
    const slide = buildSlideV7("content", [textNode]);
    const deck = buildDeckV7([slide]);

    const updated = applyInlineTextCommit({
      deck,
      slideId: slide.id,
      node: textNode,
      paragraphs: [{ id: "p-1", text: "Aligned text" }],
      nextFrame: { x: 20, y: 22, w: 44, h: 12 },
      textAlign: "center",
    });

    const committed = updated.slides[0].children[0] as TextNode;
    assert.equal(committed.content.paragraphs[0]?.text, "Aligned text");
    assert.ok(committed.layout);
    assert.deepEqual(committed.layout.frame, { x: 20, y: 22, w: 44, h: 12 });
    assert.equal(committed.localStyle?.text?.align, "center");
  });

  test("persists align when committing shape inline text", () => {
    resetBuilderCounter();
    const shapeNode = buildShapeNode({
      content: {
        shape: "rect",
        text: { paragraphs: [{ id: "shape-p-1", text: "Before" }] },
      },
    });
    const slide = buildSlideV7("content", [shapeNode]);
    const deck = buildDeckV7([slide]);

    const updated = applyInlineTextCommit({
      deck,
      slideId: slide.id,
      node: shapeNode,
      paragraphs: [{ id: "shape-p-1", text: "After" }],
      textAlign: "right",
    });

    const committed = updated.slides[0].children[0] as ShapeNode;
    assert.equal(committed.content.text?.paragraphs[0]?.text, "After");
    assert.equal(committed.localStyle?.text?.align, "right");
  });

  test("does not touch text align when no align command was committed", () => {
    resetBuilderCounter();
    const textNode = buildTextNode({
      localStyle: { text: { align: "left" } },
    });
    const slide = buildSlideV7("content", [textNode]);
    const deck = buildDeckV7([slide]);

    const updated = applyInlineTextCommit({
      deck,
      slideId: slide.id,
      node: textNode,
      paragraphs: [{ id: "p-1", text: "No align change" }],
    });

    const committed = updated.slides[0].children[0] as TextNode;
    assert.equal(committed.content.paragraphs[0]?.text, "No align change");
    assert.equal(committed.localStyle?.text?.align, "left");
  });
});
