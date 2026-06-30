import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  deleteNodes,
  insertTemplateSlide,
  moveNodesBy,
  restoreThemeDecoration,
} from "@/lib/presentation-vnext/editor-commands";
import { resetIdCounter } from "@/lib/presentation-vnext/template-compiler";
import { createDefaultTemplateRegistry } from "@/lib/presentation-vnext/theme-packages";
import {
  buildContentSlide,
  buildCoverSlide,
  buildDeckV7,
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

describe("editor command edge cases", () => {
  test("insertTemplateSlide clamps position and re-identifies colliding template ids", () => {
    resetIdCounter();
    const registry = createDefaultTemplateRegistry();
    const template = registry.get("content")!;
    const deck = buildDeckV7([
      {
        ...buildContentSlide("Existing content"),
        id: "slide-0007",
        children: [
          buildTextNode({
            id: "title-0003",
            slot: "title",
            content: { paragraphs: [{ id: "p1", text: "Existing" }] },
          }),
        ],
      },
    ]);
    const spec: AiSlideSpec = {
      kind: "content",
      slots: { title: { type: "shortText", text: "Inserted content" } },
    };

    const result = insertTemplateSlide(deck, spec, template, -10);

    assert.equal(result.index, 0);
    assert.equal(result.slideId, "slide-0007-copy");
    assert.equal(result.deck.slides[0].id, "slide-0007-copy");
    assert.equal(result.deck.slides[0].children[1].id, "title-0003-copy");
  });

  test("moveNodesBy clamps movement and ignores locked or missing targets", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const free = slide.children[0];
    const locked: SlideChildNode = {
      ...buildTextNode({
        id: "locked-node",
        layout: { frame: { x: 10, y: 10, w: 20, h: 10 }, zIndex: 3 },
      }),
      locked: true,
    };
    const withLocked = {
      ...deck,
      slides: deck.slides.map((candidate) =>
        candidate.id === slide.id
          ? { ...candidate, children: [...candidate.children, locked] }
          : candidate,
      ),
    };
    const updated = moveNodesBy(withLocked, slide.id, [free.id, locked.id], {
      x: 200,
      y: 200,
    });
    const moved = findNode(updated.slides[0].children, free.id);
    const stillLocked = findNode(updated.slides[0].children, locked.id);
    const missingSlide = moveNodesBy(deck, "missing-slide", [free.id], {
      x: 1,
      y: 1,
    });

    assert.equal(moved?.layout?.frame.x, 100 - free.layout!.frame.w);
    assert.equal(moved?.layout?.frame.y, 100 - free.layout!.frame.h);
    assert.deepEqual(stillLocked?.layout?.frame, locked.layout?.frame);
    assert.strictEqual(missingSlide, deck);
  });

  test("keeps connector endpoint bindings when target layout is unavailable", () => {
    const deck = makeTestDeck();
    const slide = deck.slides[0];
    const noLayoutTarget: SlideChildNode = {
      id: "no-layout-target",
      type: "text",
      role: "body",
      style: { ref: "text.body" },
      content: { paragraphs: [{ id: "no-layout-p1", text: "No layout" }] },
    };
    const connector: SlideChildNode = {
      id: "no-layout-connector",
      type: "connector",
      role: "connector",
      style: { ref: "connector.primary" },
      content: {
        from: { kind: "node", nodeId: noLayoutTarget.id, anchor: "left" },
        to: { kind: "node", nodeId: noLayoutTarget.id, anchor: "right" },
      },
    };
    const withConnector = {
      ...deck,
      slides: deck.slides.map((candidate) =>
        candidate.id === slide.id
          ? {
              ...candidate,
              children: [...candidate.children, noLayoutTarget, connector],
            }
          : candidate,
      ),
    };

    const updated = deleteNodes(withConnector, slide.id, [noLayoutTarget.id]);
    const repaired = findNode(updated.slides[0].children, connector.id);

    assert.equal(repaired?.type, "connector");
    if (repaired?.type === "connector") {
      assert.deepEqual(repaired.content.from, connector.content.from);
      assert.deepEqual(repaired.content.to, connector.content.to);
    }
  });

  test("restoreThemeDecoration preserves remaining disabled decorations", () => {
    const deck = buildDeckV7([buildCoverSlide()], {
      theme: {
        packageId: "test-package",
        overrides: {
          disabledDecorations: ["bg-corner", "grid"],
          tokens: { colors: { accent: { fill: "#f97316" } } },
        },
      },
    });

    const updated = restoreThemeDecoration(deck, "bg-corner");

    assert.deepEqual(updated.theme.overrides?.disabledDecorations, ["grid"]);
    assert.deepEqual(updated.theme.overrides?.tokens, {
      colors: { accent: { fill: "#f97316" } },
    });
  });
});
