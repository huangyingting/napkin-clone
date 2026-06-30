/**
 * Unit tests for slide comment anchor semantics (`slide-comment-anchors.ts`).
 * DOM-free, runnable under `node --test`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  DeckV7,
  SlideChildNode,
  SlideNode,
} from "@/lib/presentation-vnext/schema";
import {
  floatAnchorToDeck,
  floatAnchorToSlide,
  remapSlideCommentAnchorForMigration,
  resolveAnchorState,
  retargetAnchorSlide,
  retargetAnchorToSlideOnly,
  type SlideCommentAnchor,
} from "./slide-comment-anchors";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function textNode(id: string): SlideChildNode {
  return {
    id,
    type: "text",
    role: "body",
    layout: { frame: { x: 0, y: 0, w: 100, h: 10 }, zIndex: 0 },
    style: { ref: "text.body" },
    content: { paragraphs: [{ id: `${id}-p1`, text: "" }] },
  };
}

function slide(id: string, elementIds: string[] = []): SlideNode {
  return {
    id,
    type: "slide",
    template: { kind: "content" },
    style: { ref: "slide.content" },
    notes: "",
    children: elementIds.map(textNode),
  };
}

function deck(slides: SlideNode[]): DeckV7 {
  return {
    schemaVersion: 7,
    canvas: { format: "16:9", width: 100, height: 56.25, unit: "percent" },
    theme: { packageId: "neutral" },
    assets: { images: {} },
    slides,
  };
}

function anchor(partial: Partial<SlideCommentAnchor> = {}): SlideCommentAnchor {
  return partial;
}

// ---------------------------------------------------------------------------
// resolveAnchorState — deck-level
// ---------------------------------------------------------------------------

test("resolveAnchorState: no slideId → deck", () => {
  assert.equal(resolveAnchorState(anchor(), deck([])), "deck");
});

test("resolveAnchorState: explicit null slideId → deck", () => {
  assert.equal(resolveAnchorState(anchor({ slideId: null }), deck([])), "deck");
});

test("resolveAnchorState: no slideId, null deck → deck (no deck needed)", () => {
  assert.equal(resolveAnchorState(anchor(), null), "deck");
});

// ---------------------------------------------------------------------------
// resolveAnchorState — unknown
// ---------------------------------------------------------------------------

test("resolveAnchorState: slideId set, null deck → unknown", () => {
  assert.equal(
    resolveAnchorState(anchor({ slideId: "sl-1" }), null),
    "unknown",
  );
});

test("resolveAnchorState: slideId set, undefined deck → unknown", () => {
  assert.equal(
    resolveAnchorState(anchor({ slideId: "sl-1" }), undefined),
    "unknown",
  );
});

// ---------------------------------------------------------------------------
// resolveAnchorState — attached
// ---------------------------------------------------------------------------

test("resolveAnchorState: slideId exists in deck, no elementId → attached", () => {
  const d = deck([slide("sl-1")]);
  assert.equal(resolveAnchorState(anchor({ slideId: "sl-1" }), d), "attached");
});

test("resolveAnchorState: slideId and elementId both exist → attached", () => {
  const d = deck([slide("sl-1", ["el-a", "el-b"])]);
  assert.equal(
    resolveAnchorState(anchor({ slideId: "sl-1", elementId: "el-a" }), d),
    "attached",
  );
});

// ---------------------------------------------------------------------------
// resolveAnchorState — orphaned
// ---------------------------------------------------------------------------

test("resolveAnchorState: slideId not in deck → orphaned", () => {
  const d = deck([slide("sl-1")]);
  assert.equal(
    resolveAnchorState(anchor({ slideId: "sl-gone" }), d),
    "orphaned",
  );
});

test("resolveAnchorState: slideId exists but elementId not found → orphaned", () => {
  const d = deck([slide("sl-1", ["el-a"])]);
  assert.equal(
    resolveAnchorState(anchor({ slideId: "sl-1", elementId: "el-gone" }), d),
    "orphaned",
  );
});

test("resolveAnchorState: missing v7 node id → orphaned", () => {
  const s = slide("sl-1");
  const d = deck([s]);
  assert.equal(
    resolveAnchorState(anchor({ slideId: "sl-1", elementId: "el-x" }), d),
    "orphaned",
  );
});

test("resolveAnchorState: empty deck → orphaned for any slideId", () => {
  assert.equal(
    resolveAnchorState(anchor({ slideId: "sl-1" }), deck([])),
    "orphaned",
  );
});

// ---------------------------------------------------------------------------
// resolveAnchorState — geometry is ignored in resolution
// ---------------------------------------------------------------------------

test("resolveAnchorState: geometry does not affect attached result", () => {
  const d = deck([slide("sl-1", ["el-a"])]);
  assert.equal(
    resolveAnchorState(
      anchor({
        slideId: "sl-1",
        elementId: "el-a",
        geometry: { x: 50, y: 50 },
      }),
      d,
    ),
    "attached",
  );
});

// ---------------------------------------------------------------------------
// floatAnchorToDeck
// ---------------------------------------------------------------------------

test("floatAnchorToDeck: clears slideId, elementId, and geometry", () => {
  const a = anchor({
    slideId: "sl-1",
    elementId: "el-a",
    geometry: { x: 10, y: 20 },
  });
  const result = floatAnchorToDeck(a);
  assert.equal(result.slideId, null);
  assert.equal(result.elementId, null);
  assert.equal(result.geometry, null);
});

test("floatAnchorToDeck: does not mutate original", () => {
  const a = anchor({ slideId: "sl-1", elementId: "el-a" });
  floatAnchorToDeck(a);
  assert.equal(a.slideId, "sl-1");
});

test("floatAnchorToDeck: result resolves to deck", () => {
  const a = anchor({ slideId: "sl-1" });
  const floated = floatAnchorToDeck(a);
  assert.equal(resolveAnchorState(floated, deck([slide("sl-1")])), "deck");
});

// ---------------------------------------------------------------------------
// floatAnchorToSlide
// ---------------------------------------------------------------------------

test("floatAnchorToSlide: clears elementId, keeps slideId", () => {
  const a = anchor({
    slideId: "sl-1",
    elementId: "el-a",
    geometry: { x: 5, y: 5 },
  });
  const result = floatAnchorToSlide(a);
  assert.equal(result.slideId, "sl-1");
  assert.equal(result.elementId, null);
  assert.deepEqual(result.geometry, { x: 5, y: 5 });
});

test("floatAnchorToSlide: does not mutate original", () => {
  const a = anchor({ slideId: "sl-1", elementId: "el-a" });
  floatAnchorToSlide(a);
  assert.equal(a.elementId, "el-a");
});

test("floatAnchorToSlide: result resolves to attached when slide exists", () => {
  const d = deck([slide("sl-1", ["el-a"])]);
  const a = anchor({ slideId: "sl-1", elementId: "el-gone" });
  const floated = floatAnchorToSlide(a);
  assert.equal(resolveAnchorState(floated, d), "attached");
});

// ---------------------------------------------------------------------------
// retargetAnchorSlide
// ---------------------------------------------------------------------------

test("retargetAnchorSlide: updates slideId to new target", () => {
  const a = anchor({
    slideId: "sl-1",
    elementId: "el-a",
    geometry: { x: 10, y: 10 },
  });
  const result = retargetAnchorSlide(a, "sl-2");
  assert.equal(result.slideId, "sl-2");
  assert.equal(result.elementId, "el-a");
  assert.deepEqual(result.geometry, { x: 10, y: 10 });
});

test("retargetAnchorSlide: does not mutate original", () => {
  const a = anchor({ slideId: "sl-1" });
  retargetAnchorSlide(a, "sl-2");
  assert.equal(a.slideId, "sl-1");
});

test("retargetAnchorSlide: result resolves to attached on new slide", () => {
  const d = deck([slide("sl-1"), slide("sl-2", ["el-a"])]);
  const a = anchor({ slideId: "sl-1", elementId: "el-a" });
  const retargeted = retargetAnchorSlide(a, "sl-2");
  assert.equal(resolveAnchorState(retargeted, d), "attached");
});

// ---------------------------------------------------------------------------
// retargetAnchorToSlideOnly
// ---------------------------------------------------------------------------

test("retargetAnchorToSlideOnly: updates slideId and clears elementId", () => {
  const a = anchor({
    slideId: "sl-1",
    elementId: "el-a",
    geometry: { x: 10, y: 10 },
  });
  const result = retargetAnchorToSlideOnly(a, "sl-2");
  assert.equal(result.slideId, "sl-2");
  assert.equal(result.elementId, null);
  assert.deepEqual(result.geometry, { x: 10, y: 10 });
});

test("retargetAnchorToSlideOnly: does not mutate original", () => {
  const a = anchor({ slideId: "sl-1", elementId: "el-a" });
  retargetAnchorToSlideOnly(a, "sl-2");
  assert.equal(a.slideId, "sl-1");
  assert.equal(a.elementId, "el-a");
});

test("retargetAnchorToSlideOnly: result resolves to attached even when elementId would be orphaned", () => {
  const d = deck([slide("sl-1", ["el-a"]), slide("sl-2")]);
  const a = anchor({ slideId: "sl-1", elementId: "el-a" });
  const retargeted = retargetAnchorToSlideOnly(a, "sl-2");
  assert.equal(resolveAnchorState(retargeted, d), "attached");
});

test("remapSlideCommentAnchorForMigration maps legacy slide and element ids to v7 ids", () => {
  const result = remapSlideCommentAnchorForMigration(
    {
      slideId: "legacy slide",
      elementId: "legacy node",
      geometry: { x: 1, y: 2 },
    },
    {
      slides: { "legacy slide": "legacy-slide" },
      nodes: { "legacy node": "legacy-node" },
    },
  );

  assert.deepEqual(result.anchor, {
    slideId: "legacy-slide",
    elementId: "legacy-node",
    geometry: { x: 1, y: 2 },
  });
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => diagnostic.code),
    ["slide-anchor-remapped", "node-anchor-remapped"],
  );
});

test("remapSlideCommentAnchorForMigration floats dropped element anchors to the slide", () => {
  const result = remapSlideCommentAnchorForMigration(
    { slideId: "slide-1", elementId: "video-1", geometry: { x: 5, y: 6 } },
    {
      slides: { "slide-1": "slide-1" },
      nodes: {},
      dropped: [
        {
          kind: "node",
          from: "video-1",
          reason: 'Unsupported element kind "video".',
        },
      ],
    },
  );

  assert.deepEqual(result.anchor, {
    slideId: "slide-1",
    elementId: null,
    geometry: { x: 5, y: 6 },
  });
  assert.equal(result.diagnostics[0]?.code, "node-anchor-dropped");
});
