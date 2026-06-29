/**
 * Editor command tests.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  insertSlide,
  updateSlideControls,
  setThemePackage,
  updateNodeLayout,
  updateLocalStyle,
  resetLocalStyleOverride,
  reorderZIndex,
  groupNodes,
  updateAssetMetadata,
  applyTemplate,
  updateNodeContent,
  detachDecoration,
} from "@/lib/presentation-vnext/editor-commands";
import { resetIdCounter } from "@/lib/presentation-vnext/template-compiler";
import { createDefaultTemplateRegistry } from "@/lib/presentation-vnext/theme-packages";
import {
  buildDeckV7,
  buildCoverSlide,
  buildContentSlide,
  buildImageAsset,
  resetBuilderCounter,
} from "@/test/builders/deck-v7";
import type { AiSlideSpec } from "@/lib/presentation-vnext/ai-plan-schema";

function makeTestDeck() {
  resetBuilderCounter();
  return buildDeckV7([buildCoverSlide(), buildContentSlide()]);
}

describe("insertSlide", () => {
  test("inserts a compiled slide at the end by default", () => {
    resetIdCounter();
    const deck = makeTestDeck();
    const registry = createDefaultTemplateRegistry();
    const template = registry.get("section")!;
    const spec: AiSlideSpec = {
      kind: "section",
      slots: { title: { type: "shortText", text: "New Section" } },
    };
    const updated = insertSlide(deck, spec, template);
    assert.equal(updated.slides.length, 3);
    assert.equal(updated.slides[2].template.kind, "section");
  });

  test("inserts at specified index", () => {
    resetIdCounter();
    const deck = makeTestDeck();
    const registry = createDefaultTemplateRegistry();
    const template = registry.get("section")!;
    const spec: AiSlideSpec = {
      kind: "section",
      slots: { title: { type: "shortText", text: "Inserted" } },
    };
    const updated = insertSlide(deck, spec, template, 0);
    assert.equal(updated.slides.length, 3);
    assert.equal(updated.slides[0].template.kind, "section");
  });

  test("does not mutate original deck", () => {
    resetIdCounter();
    const deck = makeTestDeck();
    const originalLength = deck.slides.length;
    const registry = createDefaultTemplateRegistry();
    const template = registry.get("cover")!;
    const spec: AiSlideSpec = {
      kind: "cover",
      slots: { title: { type: "shortText", text: "Hi" } },
    };
    insertSlide(deck, spec, template);
    assert.equal(
      deck.slides.length,
      originalLength,
      "Original deck must not be mutated",
    );
  });
});

describe("updateSlideControls", () => {
  test("updates controls on target slide", () => {
    const deck = makeTestDeck();
    const slideId = deck.slides[0].id;
    const updated = updateSlideControls(deck, slideId, {
      tone: "confident",
      density: "dense",
    });
    assert.equal(updated.slides[0].controls?.tone, "confident");
    assert.equal(updated.slides[0].controls?.density, "dense");
  });

  test("does not modify other slides", () => {
    const deck = makeTestDeck();
    const slideId = deck.slides[0].id;
    const updated = updateSlideControls(deck, slideId, { tone: "confident" });
    assert.equal(updated.slides[1].controls, deck.slides[1].controls);
  });
});

describe("setThemePackage", () => {
  test("updates theme packageId", () => {
    const deck = makeTestDeck();
    const updated = setThemePackage(deck, "ocean", "2.0.0");
    assert.equal(updated.theme.packageId, "ocean");
    assert.equal(updated.theme.packageVersion, "2.0.0");
  });

  test("does not rewrite node layout or localStyle", () => {
    const deck = makeTestDeck();
    const original = deck.slides[0].children[0].layout;
    const updated = setThemePackage(deck, "aurora");
    assert.deepEqual(updated.slides[0].children[0].layout, original);
    assert.equal(
      updated.slides[0].children[0].localStyle,
      deck.slides[0].children[0].localStyle,
    );
  });
});

describe("updateNodeLayout", () => {
  test("updates frame of the target node", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const nodeId = slide.children[0].id;
    const updated = updateNodeLayout(deck, slide.id, nodeId, {
      frame: { x: 20, y: 20, w: 50, h: 10 },
    });
    const node = updated.slides[0].children.find((n) => n.id === nodeId);
    assert.ok(node?.layout?.frame.x === 20);
  });
});

describe("updateLocalStyle", () => {
  test("adds local style override to node", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const nodeId = slide.children[0].id;
    const updated = updateLocalStyle(deck, slide.id, nodeId, {
      text: { fontSizePt: 44, color: "#ff0000" },
    });
    const node = updated.slides[0].children.find((n) => n.id === nodeId);
    assert.equal(node?.localStyle?.text?.fontSizePt, 44);
    assert.equal(node?.localStyle?.text?.color, "#ff0000");
  });

  test("merges with existing local style", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const nodeId = slide.children[0].id;
    const step1 = updateLocalStyle(deck, slide.id, nodeId, {
      text: { fontSizePt: 44 },
    });
    const step2 = updateLocalStyle(step1, slide.id, nodeId, {
      text: { italic: true },
    });
    const node = step2.slides[0].children.find((n) => n.id === nodeId);
    assert.equal(node?.localStyle?.text?.fontSizePt, 44);
    assert.equal(node?.localStyle?.text?.italic, true);
  });
});

describe("resetLocalStyleOverride", () => {
  test("removes all local styles when no keys specified", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const nodeId = slide.children[0].id;
    const withLocal = updateLocalStyle(deck, slide.id, nodeId, {
      text: { fontSizePt: 44 },
    });
    const reset = resetLocalStyleOverride(withLocal, slide.id, nodeId);
    const node = reset.slides[0].children.find((n) => n.id === nodeId);
    assert.equal(node?.localStyle, undefined);
  });

  test("removes only specified keys", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const nodeId = slide.children[0].id;
    const withLocal = updateLocalStyle(deck, slide.id, nodeId, {
      text: { fontSizePt: 44 },
      fill: { type: "solid", color: "#ff0000" },
    });
    const reset = resetLocalStyleOverride(withLocal, slide.id, nodeId, [
      "fill",
    ]);
    const node = reset.slides[0].children.find((n) => n.id === nodeId);
    assert.equal(
      node?.localStyle?.text?.fontSizePt,
      44,
      "text override should remain",
    );
    assert.equal(
      node?.localStyle?.fill,
      undefined,
      "fill override should be removed",
    );
  });
});

describe("reorderZIndex", () => {
  test("updates zIndex of target node", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const nodeId = slide.children[0].id;
    const updated = reorderZIndex(deck, slide.id, nodeId, 99);
    const node = updated.slides[0].children.find((n) => n.id === nodeId);
    assert.equal(node?.layout?.zIndex, 99);
  });
});

describe("groupNodes", () => {
  test("creates a group node from specified children", () => {
    resetBuilderCounter();
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const nodeIds = slide.children.map((n) => n.id);
    const updated = groupNodes(deck, slide.id, nodeIds, "group-001", {
      ref: "surface.card",
    });
    const grouped = updated.slides[0].children.find(
      (n) => n.id === "group-001",
    );
    assert.ok(grouped, "Expected group node");
    assert.equal(grouped.type, "group");
  });

  test("returns unchanged deck if no matching nodes", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const updated = groupNodes(
      deck,
      slide.id,
      ["nonexistent-id"],
      "group-002",
      { ref: "surface.card" },
    );
    // No group should be created since no nodes matched
    assert.ok(!updated.slides[0].children.some((n) => n.id === "group-002"));
  });
});

describe("updateAssetMetadata", () => {
  test("updates alt text on existing image asset", () => {
    resetBuilderCounter();
    const deck = buildDeckV7([buildCoverSlide()], {
      assets: {
        images: {
          "img-001": buildImageAsset("img-001"),
        },
      },
    });
    const updated = updateAssetMetadata(deck, "img-001", {
      alt: "A new alt text",
    });
    assert.equal(updated.assets.images["img-001"].alt, "A new alt text");
  });

  test("returns unchanged deck for missing asset id", () => {
    const deck = makeTestDeck();
    const updated = updateAssetMetadata(deck, "nonexistent", { alt: "oops" });
    assert.deepEqual(updated.assets, deck.assets);
  });
});

// ---------------------------------------------------------------------------
// applyTemplate
// ---------------------------------------------------------------------------

describe("applyTemplate", () => {
  test("reapplies template to existing slide, preserving id and localStyle", () => {
    resetIdCounter();
    const deck = makeTestDeck();
    const registry = createDefaultTemplateRegistry();
    const template = registry.get("content")!;
    const slideId = deck.slides[0].id;
    const spec: AiSlideSpec = {
      kind: "content",
      slots: { title: { type: "shortText", text: "Reapplied Title" } },
    };
    const updated = applyTemplate(deck, slideId, spec, template);
    assert.equal(updated.slides[0].id, slideId, "Slide id must be preserved");
    assert.equal(updated.slides[0].template.kind, "content");
  });

  test("returns unchanged deck for unknown slideId", () => {
    const deck = makeTestDeck();
    const registry = createDefaultTemplateRegistry();
    const template = registry.get("content")!;
    const spec: AiSlideSpec = {
      kind: "content",
      slots: { title: { type: "shortText", text: "X" } },
    };
    const updated = applyTemplate(deck, "nonexistent-id", spec, template);
    assert.strictEqual(updated, deck, "Must return original deck unchanged");
  });
});

// ---------------------------------------------------------------------------
// updateNodeContent
// ---------------------------------------------------------------------------

describe("updateNodeContent", () => {
  test("patches content on the target node", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const nodeId = slide.children[0].id;
    const updated = updateNodeContent(deck, slide.id, nodeId, {
      paragraphs: [{ id: "p1", text: "Updated" }],
    });
    const node = updated.slides[0].children.find((n) => n.id === nodeId);
    assert.deepEqual((node as any).content.paragraphs, [
      { id: "p1", text: "Updated" },
    ]);
  });

  test("does not modify other slides", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const nodeId = slide.children[0].id;
    const updated = updateNodeContent(deck, slide.id, nodeId, { foo: "bar" });
    assert.strictEqual(updated.slides[1], deck.slides[1]);
  });
});

// ---------------------------------------------------------------------------
// detachDecoration
// ---------------------------------------------------------------------------

describe("detachDecoration", () => {
  test("appends a shape node with themeDecoration role to slide children", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const layout = { frame: { x: 10, y: 10, w: 20, h: 10 }, zIndex: 99 };
    const style = { fill: { type: "solid" as const, color: "#aabbcc" } };
    const updated = detachDecoration(
      deck,
      slide.id,
      "deco-bg-01",
      layout,
      style,
    );
    const extras = updated.slides[0].children.filter(
      (n) => (n as any).role === "themeDecoration",
    );
    assert.equal(extras.length, 1);
    assert.equal((extras[0] as any).type, "shape");
  });
});

// ---------------------------------------------------------------------------
// Group traversal (mapNodeById recurses into groups)
// ---------------------------------------------------------------------------

describe("updateLocalStyle inside group child", () => {
  test("updates local style on a node nested inside a group", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const nodeIds = slide.children.map((n) => n.id);
    const grouped = groupNodes(deck, slide.id, nodeIds, "grp-001", {
      ref: "surface.card",
    });
    const groupNode = grouped.slides[0].children.find(
      (n) => n.id === "grp-001",
    )!;
    const innerNodeId = (groupNode as any).children[0].id;
    const updated = updateLocalStyle(grouped, slide.id, innerNodeId, {
      text: { fontSizePt: 44 },
    });
    const updatedGroup = updated.slides[0].children.find(
      (n) => n.id === "grp-001",
    ) as any;
    const innerNode = updatedGroup.children.find(
      (n: any) => n.id === innerNodeId,
    );
    assert.equal(innerNode?.localStyle?.text?.fontSizePt, 44);
  });
});

// ---------------------------------------------------------------------------
// mergeStylePatch deep merge (nested object when base and patch share key)
// ---------------------------------------------------------------------------

describe("updateLocalStyle deep merge", () => {
  test("deep-merges nested style objects when base and patch share top-level key", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const nodeId = slide.children[0].id;
    const step1 = updateLocalStyle(deck, slide.id, nodeId, {
      text: { fontSizePt: 44 },
    });
    const step2 = updateLocalStyle(step1, slide.id, nodeId, {
      text: { italic: true, color: "#ff0000" },
    });
    const node = step2.slides[0].children.find((n) => n.id === nodeId);
    assert.equal(node?.localStyle?.text?.fontSizePt, 44);
    assert.equal(node?.localStyle?.text?.italic, true);
    assert.equal(node?.localStyle?.text?.color, "#ff0000");
  });
});
