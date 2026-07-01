/**
 * Editor command tests.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  insertSlide,
  insertTemplateSlide,
  insertBlankSlide,
  duplicateSlide,
  splitNodeToSlide,
  deleteSlide,
  moveSlide,
  updateSlideControls,
  updateSlideAttributes,
  updateSlideLocalStyle,
  resetSlideLocalStyle,
  updateSlideSourceMetadata,
  restoreThemeDecoration,
  setThemePackage,
  insertNode,
  pasteNodes,
  updateNodeLayout,
  updateNodeRotation,
  updateNodeSourceMetadata,
  moveNodesBy,
  deleteNodes,
  duplicateNodes,
  updateLocalStyle,
  resetLocalStyleOverride,
  reorderZIndex,
  groupNodes,
  ungroupNodes,
  updateAssetMetadata,
  applyTemplate,
  updateNodeContent,
  resetImageCrop,
  detachDecoration,
} from "@/lib/presentation-vnext/editor-commands";
import { resetIdCounter } from "@/lib/presentation-vnext/template-compiler";
import { createDefaultTemplateRegistry } from "@/lib/presentation-vnext/theme-packages";
import {
  buildDeckV7,
  buildCoverSlide,
  buildContentSlide,
  buildImageAsset,
  buildTextNode,
  resetBuilderCounter,
} from "@/test/builders/deck-v7";
import type { AiSlideSpec } from "@/lib/presentation-vnext/ai-plan-schema";
import type { SlideChildNode } from "@/lib/presentation-vnext/schema";

function makeTestDeck() {
  resetBuilderCounter();
  return buildDeckV7([buildCoverSlide(), buildContentSlide()]);
}

function findNode(
  nodes: readonly SlideChildNode[],
  id: string,
): SlideChildNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.type === "group") {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

function assertNoV6ElementsField(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertNoV6ElementsField);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  assert.equal(
    Object.prototype.hasOwnProperty.call(value, "elements"),
    false,
    "v7 command output must not write legacy Slide.elements fields",
  );
  for (const child of Object.values(value)) {
    assertNoV6ElementsField(child);
  }
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

  describe("collaboration safety", () => {
    test("command outputs never write v6 Slide.elements fields", () => {
      const deck = makeTestDeck();
      const slide = deck.slides[0];
      const nodeId = slide.children[0].id;
      const inserted = insertBlankSlide(deck).deck;
      const withNode = insertNode(inserted, slide.id, {
        id: "safety-node",
        type: "text",
        role: "body",
        layout: { frame: { x: 12, y: 12, w: 30, h: 12 }, zIndex: 50 },
        style: { ref: "text.body" },
        content: { paragraphs: [{ id: "safety-node-p1", text: "Safe" }] },
      }).deck;
      const moved = updateNodeLayout(withNode, slide.id, nodeId, {
        frame: { x: 20, y: 20, w: 40, h: 12 },
      });
      const deleted = deleteNodes(moved, slide.id, [nodeId]);

      assertNoV6ElementsField(deleted);
    });
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

  test("insertTemplateSlide returns the inserted semantic slide id and index", () => {
    resetIdCounter();
    const deck = makeTestDeck();
    const registry = createDefaultTemplateRegistry();
    const template = registry.get("content")!;
    const spec: AiSlideSpec = {
      kind: "content",
      density: "dense",
      emphasis: "data",
      slots: { title: { type: "shortText", text: "Inserted content" } },
    };

    const result = insertTemplateSlide(deck, spec, template, 1);

    assert.equal(result.index, 1);
    assert.equal(result.deck.slides[1].id, result.slideId);
    assert.equal(result.deck.slides[1].template.kind, "content");
    assert.equal(result.deck.slides[1].template.layoutId, "content-dense");
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

describe("slide management", () => {
  test("insertBlankSlide inserts an empty content slide", () => {
    const deck = makeTestDeck();
    const result = insertBlankSlide(deck, 1);

    assert.equal(result.deck.slides.length, deck.slides.length + 1);
    assert.equal(result.deck.slides[1].id, result.slideId);
    assert.equal(result.deck.slides[1].template.kind, "content");
  });

  test("duplicateSlide clones a slide and its children with new ids", () => {
    const deck = makeTestDeck();
    const result = duplicateSlide(deck, deck.slides[0].id);

    assert.equal(result.deck.slides.length, deck.slides.length + 1);
    assert.notEqual(result.slideId, deck.slides[0].id);
    assert.equal(
      result.deck.slides[1].children.length,
      deck.slides[0].children.length,
    );
    assert.notEqual(
      result.deck.slides[1].children[0].id,
      deck.slides[0].children[0].id,
    );
  });

  test("splitNodeToSlide moves a node to a new adjacent slide", () => {
    const deck = makeTestDeck();
    const sourceSlide = deck.slides[0];
    const nodeId = sourceSlide.children[0].id;
    const result = splitNodeToSlide(deck, sourceSlide.id, nodeId);

    assert.equal(result.deck.slides.length, deck.slides.length + 1);
    assert.equal(result.index, 1);
    assert.equal(result.nodeId, nodeId);
    assert.ok(
      !result.deck.slides[0].children.some((node) => node.id === nodeId),
    );
    assert.equal(result.deck.slides[1].children[0].id, nodeId);
    assert.equal(deck.slides[0].children[0].id, nodeId);
  });

  test("splitNodeToSlide returns no-op result for missing slide or node targets", () => {
    const deck = makeTestDeck();
    const missingSlide = splitNodeToSlide(deck, "missing-slide", "node-1");
    const missingNode = splitNodeToSlide(
      deck,
      deck.slides[0].id,
      "missing-node",
    );

    assert.deepEqual(missingSlide, {
      deck,
      slideId: "",
      nodeId: "node-1",
      index: -1,
    });
    assert.deepEqual(missingNode, {
      deck,
      slideId: "",
      nodeId: "missing-node",
      index: -1,
    });
  });

  test("deleteSlide keeps at least one slide", () => {
    const deck = makeTestDeck();
    const oneSlide = deleteSlide(deck, deck.slides[0].id).deck;
    const stillOneSlide = deleteSlide(oneSlide, oneSlide.slides[0].id).deck;

    assert.equal(stillOneSlide.slides.length, 1);
  });

  test("moveSlide reorders slides", () => {
    const deck = makeTestDeck();
    const secondId = deck.slides[1].id;
    const result = moveSlide(deck, secondId, 0);

    assert.equal(result.deck.slides[0].id, secondId);
    assert.equal(result.index, 0);
  });

  test("deleteSlide returns the first index when the slide is missing", () => {
    const deck = makeTestDeck();
    const result = deleteSlide(deck, "missing-slide");

    assert.strictEqual(result.deck, deck);
    assert.equal(result.index, 0);
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

  test("ignores controls for unknown slides", () => {
    const deck = makeTestDeck();
    const updated = updateSlideControls(deck, "missing-slide", {
      density: "dense",
    });

    assert.strictEqual(updated.slides[0], deck.slides[0]);
    assert.strictEqual(updated.slides[1], deck.slides[1]);
  });
});

describe("slide metadata and local style", () => {
  test("updates slide name and notes", () => {
    const deck = makeTestDeck();
    const slideId = deck.slides[0].id;
    const updated = updateSlideAttributes(deck, slideId, {
      name: "Updated slide",
      notes: "Speaker notes",
    });

    assert.equal(updated.slides[0].name, "Updated slide");
    assert.equal(updated.slides[0].notes, "Speaker notes");
  });

  test("updates and resets slide local style", () => {
    const deck = makeTestDeck();
    const slideId = deck.slides[0].id;
    const withStyle = updateSlideLocalStyle(deck, slideId, {
      slide: { background: { type: "solid", color: "#ffeeaa" } },
    });
    assert.equal(
      withStyle.slides[0].localStyle?.slide?.background?.type,
      "solid",
    );

    const reset = resetSlideLocalStyle(withStyle, slideId);
    assert.equal(reset.slides[0].localStyle, undefined);
  });

  test("sets and clears slide source metadata", () => {
    const deck = makeTestDeck();
    const slideId = deck.slides[0].id;
    const withSource = updateSlideSourceMetadata(deck, slideId, {
      documentId: "doc-1",
      blockId: "section-1",
      blockKind: "text",
    });
    assert.equal(withSource.slides[0].source?.blockId, "section-1");

    const cleared = updateSlideSourceMetadata(withSource, slideId, undefined);
    assert.equal(cleared.slides[0].source, undefined);
  });

  test("ignores slide metadata updates for unknown slides", () => {
    const deck = makeTestDeck();
    const attributes = updateSlideAttributes(deck, "missing-slide", {
      name: "Ignored",
    });
    const localStyle = updateSlideLocalStyle(deck, "missing-slide", {
      fill: { type: "solid", color: "#fff" },
    });
    const source = updateSlideSourceMetadata(deck, "missing-slide", {
      documentId: "doc-1",
      blockId: "block-1",
      blockKind: "text",
    });

    assert.strictEqual(attributes.slides[0], deck.slides[0]);
    assert.strictEqual(localStyle.slides[0], deck.slides[0]);
    assert.strictEqual(source.slides[0], deck.slides[0]);
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

  test("preserves local overrides until an explicit reset after theme switch", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const nodeId = slide.children[0].id;
    const withOverride = updateLocalStyle(deck, slide.id, nodeId, {
      text: { color: "#111827" },
      fill: { type: "solid", color: "#fde68a" },
    });

    const switched = setThemePackage(withOverride, "aurora");
    const reset = resetLocalStyleOverride(switched, slide.id, nodeId, ["fill"]);
    const resetNode = reset.slides[0].children.find(
      (node) => node.id === nodeId,
    );

    assert.equal(switched.theme.packageId, "aurora");
    assert.equal(
      switched.slides[0].children[0].localStyle?.fill?.type,
      "solid",
    );
    assert.equal(resetNode?.localStyle?.fill, undefined);
    assert.equal(resetNode?.localStyle?.text?.color, "#111827");
    assert.equal(reset.theme.packageId, "aurora");
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

  test("normalizes command-backed rotation updates", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const nodeId = slide.children[0].id;
    const updated = updateNodeRotation(deck, slide.id, nodeId, -45.04);
    const node = findNode(updated.slides[0].children, nodeId);

    assert.equal(node?.layout?.rotation, 315);
  });
});

describe("insertNode and pasteNodes", () => {
  test("insertNode appends a v7 node to the target slide", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const result = insertNode(deck, slide.id, {
      id: "inserted-text",
      type: "text",
      role: "body",
      layout: { frame: { x: 12, y: 12, w: 30, h: 12 }, zIndex: 50 },
      style: { ref: "text.body" },
      content: { paragraphs: [{ id: "p1", text: "Inserted" }] },
    });

    assert.equal(result.nodeId, "inserted-text");
    assert.equal(result.deck.slides[0].children.at(-1)?.id, "inserted-text");
  });

  test("insertNode re-identifies colliding nodes and ignores missing slides", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const source = slide.children[0];
    const inserted = insertNode(deck, slide.id, source);
    const missingSlide = insertNode(deck, "missing-slide", {
      id: "orphan-node",
      type: "text",
      role: "body",
      layout: { frame: { x: 0, y: 0, w: 10, h: 10 }, zIndex: 1 },
      style: { ref: "text.body" },
      content: { paragraphs: [{ id: "p1", text: "Orphan" }] },
    });

    assert.equal(inserted.nodeId, `${source.id}-copy`);
    assert.equal(
      inserted.deck.slides[0].children.at(-1)?.id,
      `${source.id}-copy`,
    );
    assert.equal(missingSlide.nodeId, "orphan-node");
    assert.strictEqual(missingSlide.deck.slides[0], deck.slides[0]);
  });

  test("pasteNodes re-identifies pasted nodes and offsets their frames", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const source = slide.children[0];
    const result = pasteNodes(deck, slide.id, [source]);
    const pasted = result.deck.slides[0].children.find(
      (node) => node.id === result.nodeIds[0],
    );

    assert.ok(pasted);
    assert.notEqual(pasted.id, source.id);
    assert.equal(pasted.layout?.frame.x, source.layout!.frame.x + 2);
  });

  test("pasteNodes returns empty no-op result for empty input or missing slides", () => {
    const deck = makeTestDeck();
    const empty = pasteNodes(deck, deck.slides[0].id, []);
    const missingSlide = pasteNodes(deck, "missing-slide", [
      deck.slides[0].children[0],
    ]);

    assert.deepEqual(empty, { deck, nodeIds: [] });
    assert.deepEqual(missingSlide.nodeIds, [
      `${deck.slides[0].children[0].id}-copy`,
    ]);
    assert.strictEqual(missingSlide.deck.slides[0], deck.slides[0]);
  });
});

describe("updateNodeSourceMetadata", () => {
  test("sets and clears source metadata on a node", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const nodeId = slide.children[0].id;
    const withSource = updateNodeSourceMetadata(deck, slide.id, nodeId, {
      documentId: "doc-1",
      blockId: "block-1",
      blockKind: "text",
    });
    const sourcedNode = withSource.slides[0].children.find(
      (node) => node.id === nodeId,
    );
    assert.equal(sourcedNode?.source?.blockId, "block-1");

    const cleared = updateNodeSourceMetadata(
      withSource,
      slide.id,
      nodeId,
      undefined,
    );
    const clearedNode = cleared.slides[0].children.find(
      (node) => node.id === nodeId,
    );
    assert.equal(clearedNode?.source, undefined);
  });
});

describe("moveNodesBy", () => {
  test("nudges selected nodes in percent space", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const nodeId = slide.children[0].id;
    const original = slide.children[0].layout!.frame;
    const updated = moveNodesBy(deck, slide.id, [nodeId], { x: 1, y: -1 });
    const node = updated.slides[0].children.find((n) => n.id === nodeId);

    assert.equal(node?.layout?.frame.x, original.x + 1);
    assert.equal(node?.layout?.frame.y, original.y - 1);
  });
});

describe("deleteNodes", () => {
  test("removes selected nodes from a slide", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const nodeId = slide.children[0].id;
    const updated = deleteNodes(deck, slide.id, [nodeId]);

    assert.equal(
      updated.slides[0].children.some((node) => node.id === nodeId),
      false,
    );
  });

  test("deleteNodes no-ops for empty selection and expands group deletion", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const group = groupNodes(
      deck,
      slide.id,
      slide.children.map((node) => node.id),
      "delete-group",
      { ref: "surface.card" },
    );
    const empty = deleteNodes(deck, slide.id, []);
    const deletedGroup = deleteNodes(group, slide.id, ["delete-group"]);

    assert.strictEqual(empty, deck);
    assert.equal(deletedGroup.slides[0].children.length, 0);
  });

  test("repairs connector node bindings before deleting target nodes", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const target = slide.children[0];
    const connector: SlideChildNode = {
      id: "connector-bound",
      type: "connector",
      role: "connector",
      layout: { frame: { x: 0, y: 0, w: 100, h: 100 }, zIndex: 99 },
      style: { ref: "connector.primary" },
      content: {
        from: { kind: "node", nodeId: target.id, anchor: "right" },
        to: { kind: "point", point: { x: 100, y: 50 } },
      },
    };
    const withConnector = {
      ...deck,
      slides: deck.slides.map((candidate) =>
        candidate.id === slide.id
          ? { ...candidate, children: [...candidate.children, connector] }
          : candidate,
      ),
    };

    const updated = deleteNodes(withConnector, slide.id, [target.id]);
    const repaired = findNode(updated.slides[0].children, "connector-bound");

    assert.equal(repaired?.type, "connector");
    if (repaired?.type === "connector") {
      assert.deepEqual(repaired.content.from, {
        kind: "point",
        point: {
          x: target.layout!.frame.x + target.layout!.frame.w,
          y: target.layout!.frame.y + target.layout!.frame.h / 2,
        },
      });
    }
  });

  test("clamps repaired connector endpoints into point percent bounds", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const target: SlideChildNode = {
      id: "far-target",
      type: "text",
      role: "body",
      layout: { frame: { x: 80, y: 80, w: 10, h: 10 }, zIndex: 2 },
      style: { ref: "text.body" },
      content: { paragraphs: [{ id: "far-target-p1", text: "Far" }] },
    };
    const connector: SlideChildNode = {
      id: "small-connector",
      type: "connector",
      role: "connector",
      layout: { frame: { x: 0, y: 0, w: 20, h: 20 }, zIndex: 99 },
      style: { ref: "connector.primary" },
      content: {
        from: { kind: "node", nodeId: target.id, anchor: "right" },
        to: { kind: "point", point: { x: 100, y: 50 } },
      },
    };
    const withConnector = {
      ...deck,
      slides: deck.slides.map((candidate) =>
        candidate.id === slide.id
          ? {
              ...candidate,
              children: [...candidate.children, target, connector],
            }
          : candidate,
      ),
    };

    const updated = deleteNodes(withConnector, slide.id, [target.id]);
    const repaired = findNode(updated.slides[0].children, "small-connector");

    assert.equal(repaired?.type, "connector");
    if (repaired?.type === "connector") {
      assert.deepEqual(repaired.content.from, {
        kind: "point",
        point: { x: 100, y: 100 },
      });
    }
  });
});

describe("duplicateNodes", () => {
  test("duplicates selected top-level nodes with new ids and offset frames", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const node = slide.children[0];
    const result = duplicateNodes(deck, slide.id, [node.id]);

    assert.equal(
      result.deck.slides[0].children.length,
      slide.children.length + 1,
    );
    assert.equal(result.duplicatedIds.length, 1);
    const duplicated = result.deck.slides[0].children.find(
      (candidate) => candidate.id === result.duplicatedIds[0],
    );
    assert.ok(duplicated);
    assert.equal(duplicated.layout?.frame.x, node.layout!.frame.x + 2);
  });

  test("duplicates selected group children inside their group scope", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const child: SlideChildNode = {
      id: "group-child",
      type: "text",
      role: "body",
      layout: { frame: { x: 10, y: 10, w: 20, h: 8 }, zIndex: 1 },
      style: { ref: "text.body" },
      content: { paragraphs: [{ id: "group-child-p1", text: "Inside" }] },
    };
    const group: SlideChildNode = {
      id: "group-node",
      type: "group",
      component: "custom",
      layout: { frame: { x: 8, y: 8, w: 30, h: 20 }, zIndex: 10 },
      style: { ref: "surface.card" },
      children: [child],
    };
    const withGroup = {
      ...deck,
      slides: deck.slides.map((candidate) =>
        candidate.id === slide.id
          ? { ...candidate, children: [...candidate.children, group] }
          : candidate,
      ),
    };

    const result = duplicateNodes(withGroup, slide.id, [child.id]);
    const updatedGroup = findNode(result.deck.slides[0].children, group.id);

    assert.equal(result.duplicatedIds.length, 1);
    assert.equal(updatedGroup?.type, "group");
    if (updatedGroup?.type === "group") {
      assert.deepEqual(
        updatedGroup.children.map((node) => node.id),
        [child.id, result.duplicatedIds[0]],
      );
    }
  });

  test("duplicateNodes no-ops for empty, missing slide, and missing node selections", () => {
    const deck = makeTestDeck();

    assert.deepEqual(duplicateNodes(deck, deck.slides[0].id, []), {
      deck,
      duplicatedIds: [],
    });
    assert.deepEqual(duplicateNodes(deck, "missing-slide", ["text-1"]), {
      deck,
      duplicatedIds: [],
    });
    assert.deepEqual(
      duplicateNodes(deck, deck.slides[0].id, ["missing-node"]),
      {
        deck,
        duplicatedIds: [],
      },
    );
  });
});

describe("resetImageCrop", () => {
  test("removes crop metadata from image content", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const image: SlideChildNode = {
      id: "crop-image",
      type: "image",
      role: "image",
      layout: { frame: { x: 10, y: 10, w: 30, h: 20 }, zIndex: 5 },
      style: { ref: "media.inline" },
      content: {
        assetId: "placeholder",
        crop: { top: 10, right: 5, bottom: 0, left: 2 },
      },
    };
    const withImage = {
      ...deck,
      slides: deck.slides.map((candidate) =>
        candidate.id === slide.id
          ? { ...candidate, children: [...candidate.children, image] }
          : candidate,
      ),
    };

    const updated = resetImageCrop(withImage, slide.id, image.id);
    const updatedImage = findNode(updated.slides[0].children, image.id);

    assert.equal(updatedImage?.type, "image");
    if (updatedImage?.type === "image") {
      assert.equal(updatedImage.content.crop, undefined);
      assert.equal("crop" in updatedImage.content, false);
    }
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

  test("creates group bounds and z-index from selected children", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const children: SlideChildNode[] = [
      {
        id: "group-bound-a",
        type: "text",
        role: "body",
        layout: { frame: { x: 12, y: 18, w: 20, h: 10 }, zIndex: 3 },
        style: { ref: "text.body" },
        content: { paragraphs: [{ id: "group-bound-a-p1", text: "A" }] },
      },
      {
        id: "group-bound-b",
        type: "text",
        role: "body",
        layout: { frame: { x: 40, y: 10, w: 25, h: 30 }, zIndex: 7 },
        style: { ref: "text.body" },
        content: { paragraphs: [{ id: "group-bound-b-p1", text: "B" }] },
      },
    ];
    const withChildren = {
      ...deck,
      slides: deck.slides.map((candidate) =>
        candidate.id === slide.id
          ? { ...candidate, children: [...candidate.children, ...children] }
          : candidate,
      ),
    };

    const updated = groupNodes(
      withChildren,
      slide.id,
      children.map((node) => node.id),
      "group-bounds",
      { ref: "surface.card" },
    );
    const grouped = findNode(updated.slides[0].children, "group-bounds");

    assert.equal(grouped?.type, "group");
    if (grouped?.type === "group") {
      assert.deepEqual(grouped.layout?.frame, { x: 12, y: 10, w: 53, h: 30 });
      assert.equal(grouped.layout?.zIndex, 7);
      assert.deepEqual(
        grouped.children.map((node) => node.id),
        ["group-bound-a", "group-bound-b"],
      );
    }
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

describe("ungroupNodes", () => {
  test("replaces a group node with its children", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const nodeIds = slide.children.map((node) => node.id);
    const grouped = groupNodes(deck, slide.id, nodeIds, "group-ungroup", {
      ref: "surface.card",
    });
    const result = ungroupNodes(grouped, slide.id, "group-ungroup");

    assert.deepEqual(new Set(result.nodeIds), new Set(nodeIds));
    assert.equal(
      result.deck.slides[0].children.some(
        (node) => node.id === "group-ungroup",
      ),
      false,
    );
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

  test("preserves compatible slot content, source, and local overrides", () => {
    resetIdCounter();
    const registry = createDefaultTemplateRegistry();
    const template = registry.get("content")!;
    const titleNode = buildTextNode({
      id: "title-source",
      role: "title",
      slot: "title",
      content: {
        paragraphs: [{ id: "title-source-p1", text: "Preserve me" }],
      },
      source: {
        documentId: "doc-1",
        blockId: "heading-1",
        blockKind: "text",
      },
      localStyle: { text: { color: "#ff0000" } },
    });
    const bodyNode = buildTextNode({
      id: "body-source",
      role: "body",
      slot: "bullets",
      content: {
        paragraphs: [
          { id: "body-source-p1", text: "First", list: { kind: "bullet" } },
          { id: "body-source-p2", text: "Second", list: { kind: "bullet" } },
        ],
      },
      source: {
        documentId: "doc-1",
        blockId: "body-1",
        blockKind: "text",
      },
    });
    const slide = {
      ...buildContentSlide("Old"),
      id: "slide-source",
      source: {
        documentId: "doc-1",
        blockId: "slide-1",
        blockKind: "text" as const,
      },
      localStyle: {
        slide: { background: { type: "solid" as const, color: "#fff7ed" } },
      },
      props: { decoration: "expressive" as const, chrome: "minimal" as const },
      notes: "Keep these notes",
      children: [titleNode, bodyNode],
    };
    const deck = buildDeckV7([slide]);
    const spec: AiSlideSpec = {
      kind: "content",
      density: "dense",
      emphasis: "data",
      slots: {
        title: { type: "shortText", text: "Generated title" },
        bullets: { type: "bullets", items: [{ text: "Generated" }] },
      },
    };

    const updated = applyTemplate(deck, slide.id, spec, template);
    const nextSlide = updated.slides[0];
    const nextTitle = nextSlide.children.find((node) => node.slot === "title");
    const nextBullets = nextSlide.children.find(
      (node) => node.slot === "bullets",
    );

    assert.equal(nextSlide.id, "slide-source");
    assert.equal(nextSlide.source?.blockId, "slide-1");
    assert.equal(nextSlide.localStyle?.slide?.background?.type, "solid");
    assert.deepEqual(nextSlide.props, slide.props);
    assert.equal(nextSlide.notes, "Keep these notes");
    assert.equal(nextTitle?.id, "title-source");
    assert.equal(nextTitle?.source?.blockId, "heading-1");
    assert.equal(nextTitle?.localStyle?.text?.color, "#ff0000");
    assert.equal(nextTitle?.type, "text");
    if (nextTitle?.type === "text") {
      assert.equal(nextTitle.content.paragraphs[0].text, "Preserve me");
    }
    assert.equal(nextBullets?.id, "body-source");
    assert.equal(nextBullets?.source?.blockId, "body-1");
    assert.equal(nextBullets?.type, "text");
    if (nextBullets?.type === "text") {
      assert.equal(nextBullets.content.paragraphs.length, 2);
    }
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
    assert.deepEqual(updated.theme.overrides?.disabledDecorations, [
      "deco-bg-01",
    ]);
  });

  test("normalizes resolved decoration ids before disabling theme recipes", () => {
    const deck = makeTestDeck();
    const updated = detachDecoration(
      deck,
      deck.slides[0].id,
      "decoration-corner",
      { frame: { x: 0, y: 0, w: 10, h: 10 }, zIndex: 0 },
      {},
    );

    assert.deepEqual(updated.theme.overrides?.disabledDecorations, ["corner"]);
  });
});

describe("decoration commands", () => {
  test("disables the source decoration recipe when detaching a resolved decoration", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const updated = detachDecoration(
      deck,
      slide.id,
      "decoration-bg-corner",
      { frame: { x: 10, y: 10, w: 20, h: 10 }, zIndex: 99 },
      { fill: { type: "solid", color: "#aabbcc" } },
    );

    assert.deepEqual(updated.theme.overrides?.disabledDecorations, [
      "bg-corner",
    ]);
  });

  test("restoreThemeDecoration removes stale disabled decoration overrides", () => {
    const deck = buildDeckV7([buildCoverSlide()], {
      theme: {
        packageId: "test-package",
        overrides: { disabledDecorations: ["bg-corner"] },
      },
    });

    const updated = restoreThemeDecoration(deck, "bg-corner");

    assert.equal(updated.theme.overrides?.disabledDecorations, undefined);
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

  test("preserves existing nested connector stroke fields across toolbar patches", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const nodeId = slide.children[0].id;
    const step1 = updateLocalStyle(deck, slide.id, nodeId, {
      connector: {
        stroke: { color: "#334155", widthPt: 1.5, dash: "dotted" },
      },
    });
    const step2 = updateLocalStyle(step1, slide.id, nodeId, {
      connector: { stroke: { color: "#ef4444", widthPt: 2 } },
    });
    const node = step2.slides[0].children.find((n) => n.id === nodeId);

    assert.equal(node?.localStyle?.connector?.stroke?.color, "#ef4444");
    assert.equal(node?.localStyle?.connector?.stroke?.widthPt, 2);
    assert.equal(node?.localStyle?.connector?.stroke?.dash, "dotted");
  });

  test("preserves sibling visual channel colors across sequential patches", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const nodeId = slide.children[0].id;
    const step1 = updateLocalStyle(deck, slide.id, nodeId, {
      visual: {
        channelColors: {
          primary: "#2563eb",
          secondary: "#f59e0b",
          tertiary: "#10b981",
        },
      },
    });
    const step2 = updateLocalStyle(step1, slide.id, nodeId, {
      visual: { channelColors: { primary: "#7c3aed" } },
    });
    const node = step2.slides[0].children.find((n) => n.id === nodeId);

    assert.deepEqual(node?.localStyle?.visual?.channelColors, {
      primary: "#7c3aed",
      secondary: "#f59e0b",
      tertiary: "#10b981",
    });
  });
});

// ---------------------------------------------------------------------------
// UI-flow: slide reordering (filmstrip drag, nav buttons)
// ---------------------------------------------------------------------------

describe("moveSlide — UI navigation flows", () => {
  test("moves first slide to last position (drag to end)", () => {
    const deck = makeTestDeck();
    const firstId = deck.slides[0].id;
    const result = moveSlide(deck, firstId, deck.slides.length);
    assert.equal(result.deck.slides[result.deck.slides.length - 1].id, firstId);
    assert.equal(result.index, deck.slides.length - 1);
  });

  test("moves last slide to first position (drag to start)", () => {
    const deck = makeTestDeck();
    const lastId = deck.slides[deck.slides.length - 1].id;
    const result = moveSlide(deck, lastId, 0);
    assert.equal(result.deck.slides[0].id, lastId);
    assert.equal(result.index, 0);
  });

  test("clamps target index to valid range (toIndex > slides.length)", () => {
    const deck = makeTestDeck();
    const firstId = deck.slides[0].id;
    const result = moveSlide(deck, firstId, 9999);
    assert.equal(result.deck.slides[result.deck.slides.length - 1].id, firstId);
  });

  test("clamps target index to 0 when toIndex < 0", () => {
    const deck = makeTestDeck();
    const lastId = deck.slides[deck.slides.length - 1].id;
    const result = moveSlide(deck, lastId, -5);
    assert.equal(result.deck.slides[0].id, lastId);
    assert.equal(result.index, 0);
  });

  test("no-op move (same index) keeps slides unchanged", () => {
    const deck = makeTestDeck();
    const firstId = deck.slides[0].id;
    const result = moveSlide(deck, firstId, 0);
    assert.equal(result.deck.slides[0].id, firstId);
    assert.equal(result.deck.slides.length, deck.slides.length);
  });

  test("returns index -1 for unknown slideId", () => {
    const deck = makeTestDeck();
    const result = moveSlide(deck, "nonexistent", 0);
    assert.equal(result.index, -1);
    assert.strictEqual(result.deck, deck);
  });
});

// ---------------------------------------------------------------------------
// UI-flow: insertBlankSlide index clamping
// ---------------------------------------------------------------------------

describe("insertBlankSlide — boundary index handling", () => {
  test("clamps negative atIndex to 0", () => {
    const deck = makeTestDeck();
    const result = insertBlankSlide(deck, -1);
    assert.equal(result.deck.slides[0].id, result.slideId);
  });

  test("clamps atIndex > slides.length to slides.length (appends)", () => {
    const deck = makeTestDeck();
    const result = insertBlankSlide(deck, 9999);
    assert.equal(
      result.deck.slides[result.deck.slides.length - 1].id,
      result.slideId,
    );
  });

  test("returns a unique slideId each call", () => {
    const deck = makeTestDeck();
    const r1 = insertBlankSlide(deck);
    const r2 = insertBlankSlide(r1.deck);
    assert.notEqual(r1.slideId, r2.slideId);
  });
});

// ---------------------------------------------------------------------------
// UI-flow: duplicateSlide name suffix
// ---------------------------------------------------------------------------

describe("duplicateSlide — name handling", () => {
  test("appends ' Copy' to named slide", () => {
    const deck = makeTestDeck();
    const slideId = deck.slides[0].id;
    const named = updateSlideAttributes(deck, slideId, { name: "Intro" });
    const result = duplicateSlide(named, slideId);
    assert.equal(result.deck.slides[result.index].name, "Intro Copy");
  });

  test("duplicate of unnamed slide has no name", () => {
    const deck = makeTestDeck();
    const slideId = deck.slides[0].id;
    const result = duplicateSlide(deck, slideId);
    assert.equal(result.deck.slides[result.index].name, undefined);
  });

  test("duplicate is inserted immediately after the source slide", () => {
    const deck = makeTestDeck();
    const slideId = deck.slides[0].id;
    const result = duplicateSlide(deck, slideId);
    assert.equal(result.index, 1);
    assert.equal(result.deck.slides[0].id, slideId);
    assert.equal(result.deck.slides[1].id, result.slideId);
  });
});

// ---------------------------------------------------------------------------
// UI-flow: updateNodeContent for inline text editor commit
// ---------------------------------------------------------------------------

describe("updateNodeContent — inline text editor commit", () => {
  test("commits multi-paragraph content from inline editor", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const textNodeId = slide.children.find((n) => n.type === "text")!.id;
    const paragraphs = [
      { id: "p1", text: "Updated first paragraph" },
      { id: "p2", text: "Updated second paragraph" },
    ];
    const updated = updateNodeContent(deck, slide.id, textNodeId, {
      paragraphs,
    });
    const node = updated.slides[0].children.find(
      (n) => n.id === textNodeId,
    ) as any;
    assert.deepEqual(node.content.paragraphs, paragraphs);
  });

  test("commits shape inline text (content.text)", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const nodeId = slide.children[0].id;
    const updated = updateNodeContent(deck, slide.id, nodeId, {
      text: { paragraphs: [{ id: "p1", text: "Shape label" }] },
    });
    const node = updated.slides[0].children.find((n) => n.id === nodeId) as any;
    assert.equal(node.content.text?.paragraphs[0].text, "Shape label");
  });

  test("preserves other content fields when patching paragraphs", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const textNodeId = slide.children.find((n) => n.type === "text")!.id;
    // First, add a fit field
    const withFit = updateNodeContent(deck, slide.id, textNodeId, {
      fit: "shrink-to-fit",
    });
    // Now commit paragraph content
    const committed = updateNodeContent(withFit, slide.id, textNodeId, {
      paragraphs: [{ id: "p1", text: "New text" }],
    });
    const node = committed.slides[0].children.find(
      (n) => n.id === textNodeId,
    ) as any;
    assert.equal(node.content.fit, "shrink-to-fit");
    assert.equal(node.content.paragraphs[0].text, "New text");
  });

  test("does not mutate original deck on commit", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const nodeId = slide.children[0].id;
    const originalContent = (slide.children[0] as any).content;
    updateNodeContent(deck, slide.id, nodeId, {
      paragraphs: [{ id: "p-new", text: "mutate check" }],
    });
    // Original content must be unchanged
    assert.deepEqual(
      (deck.slides[0].children[0] as any).content,
      originalContent,
    );
  });
});

// ---------------------------------------------------------------------------
// UI-flow: updateLocalStyle for context toolbar / inspector style commands
// ---------------------------------------------------------------------------

describe("updateLocalStyle — toolbar-driven style patches", () => {
  test("applies color from text color picker", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const nodeId = slide.children[0].id;
    const updated = updateLocalStyle(deck, slide.id, nodeId, {
      text: { color: "#cc3344" },
    });
    const node = updated.slides[0].children.find((n) => n.id === nodeId);
    assert.equal(node?.localStyle?.text?.color, "#cc3344");
  });

  test("applies font size from font size picker", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const nodeId = slide.children[0].id;
    const updated = updateLocalStyle(deck, slide.id, nodeId, {
      text: { fontSizePt: 28 },
    });
    const node = updated.slides[0].children.find((n) => n.id === nodeId);
    assert.equal(node?.localStyle?.text?.fontSizePt, 28);
  });

  test("applies fill color from shape fill picker", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const nodeId = slide.children[0].id;
    const updated = updateLocalStyle(deck, slide.id, nodeId, {
      fill: { type: "solid", color: "#abcdef" },
    });
    const node = updated.slides[0].children.find((n) => n.id === nodeId);
    assert.equal((node?.localStyle?.fill as any)?.color, "#abcdef");
  });

  test("replaces local style keys when patch value is primitive or undefined", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const nodeId = slide.children[0].id;
    const withLocal = updateLocalStyle(deck, slide.id, nodeId, {
      opacity: 0.5,
      shadow: { xPt: 0, yPt: 1, blurPt: 8, color: "#000000" },
    });
    const updated = updateLocalStyle(withLocal, slide.id, nodeId, {
      opacity: undefined,
      shadow: undefined,
    });
    const node = updated.slides[0].children.find((n) => n.id === nodeId);

    assert.equal(node?.localStyle?.opacity, undefined);
    assert.equal(node?.localStyle?.shadow, undefined);
    assert.ok("opacity" in (node?.localStyle ?? {}));
  });

  test("sequential toolbar commands accumulate style overrides", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const nodeId = slide.children[0].id;
    const step1 = updateLocalStyle(deck, slide.id, nodeId, {
      text: { fontSizePt: 24 },
    });
    const step2 = updateLocalStyle(step1, slide.id, nodeId, {
      text: { color: "#ff0000" },
    });
    const node = step2.slides[0].children.find((n) => n.id === nodeId);
    assert.equal(node?.localStyle?.text?.fontSizePt, 24);
    assert.equal(node?.localStyle?.text?.color, "#ff0000");
  });
});
