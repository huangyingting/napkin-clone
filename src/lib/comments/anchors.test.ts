import assert from "node:assert/strict";
import { test } from "node:test";

import {
  commentAnchorFromRecord,
  commentAnchorToRecord,
  sanitizeAnchorGeometry,
  slideAnchorFromRecord,
  slideAnchorToRecord,
  validateAnchorGeometry,
} from "./anchors";
import type { SlideCommentAnchor } from "@/lib/presentation/slide-comment-anchors";

test("slideAnchorFromRecord maps slide DB columns to slide anchors", () => {
  const result = slideAnchorFromRecord({
    slideId: "sl-1",
    elementId: "el-a",
    anchorGeometry: { x: 25, y: 75 },
  });
  assert.deepEqual(result, {
    slideId: "sl-1",
    elementId: "el-a",
    geometry: { x: 25, y: 75 },
  });
});

test("slideAnchorFromRecord silently drops malformed geometry", () => {
  const result = slideAnchorFromRecord({
    slideId: "sl-1",
    anchorGeometry: { label: "bad" },
  });
  assert.equal(result.slideId, "sl-1");
  assert.equal(result.geometry, null);
});

test("slideAnchorToRecord round-trips through slideAnchorFromRecord", () => {
  const original: SlideCommentAnchor = {
    slideId: "sl-1",
    elementId: "el-a",
    geometry: { x: 33, y: 66 },
  };
  assert.deepEqual(
    slideAnchorFromRecord(slideAnchorToRecord(original)),
    original,
  );
});

test("commentAnchorFromRecord maps deck, text, visual, slide, and element variants", () => {
  assert.deepEqual(commentAnchorFromRecord({}), { kind: "deck" });
  assert.deepEqual(
    commentAnchorFromRecord({ anchorType: "text", anchorText: "Paragraph" }),
    { kind: "text", text: "Paragraph", nodeId: null },
  );
  assert.deepEqual(
    commentAnchorFromRecord({
      anchorType: "visual",
      anchorText: "Chart",
      anchorNodeId: "visual-1",
    }),
    {
      kind: "document-block",
      blockKind: "visual",
      text: "Chart",
      nodeId: "visual-1",
    },
  );
  assert.deepEqual(
    commentAnchorFromRecord({
      slideId: "sl-1",
      anchorGeometry: { x: 10, y: 20 },
    }),
    { kind: "slide", slideId: "sl-1", geometry: { x: 10, y: 20 } },
  );
  assert.deepEqual(
    commentAnchorFromRecord({
      slideId: "sl-1",
      elementId: "el-1",
      anchorGeometry: { x: 10, y: 20 },
    }),
    {
      kind: "slide-element",
      slideId: "sl-1",
      elementId: "el-1",
      geometry: { x: 10, y: 20 },
    },
  );
});

test("commentAnchorToRecord maps canonical variants to DB columns", () => {
  assert.deepEqual(commentAnchorToRecord({ kind: "deck" }), {
    anchorType: null,
    anchorText: null,
    anchorNodeId: null,
    slideId: null,
    elementId: null,
    anchorGeometry: null,
  });
  assert.equal(
    commentAnchorToRecord({
      kind: "document-block",
      blockKind: "visual",
      text: "Chart",
      nodeId: "visual-1",
    }).anchorType,
    "visual",
  );
  assert.deepEqual(
    commentAnchorToRecord({
      kind: "slide-element",
      slideId: "sl-1",
      elementId: "el-1",
      geometry: { x: 5, y: 6 },
    }),
    {
      anchorType: null,
      anchorText: null,
      anchorNodeId: null,
      slideId: "sl-1",
      elementId: "el-1",
      anchorGeometry: { x: 5, y: 6 },
    },
  );
});

test("validateAnchorGeometry accepts bounds and rejects invalid values", () => {
  assert.deepEqual(validateAnchorGeometry({ x: 0, y: 100 }), { x: 0, y: 100 });
  assert.throws(() => validateAnchorGeometry({ x: -1, y: 50 }));
  assert.throws(() => validateAnchorGeometry({ x: "25", y: 50 }));
});

test("sanitizeAnchorGeometry drops non-objects and out-of-range values", () => {
  assert.equal(sanitizeAnchorGeometry("bad"), null);
  assert.equal(sanitizeAnchorGeometry({ x: 50, y: 101 }), null);
});
