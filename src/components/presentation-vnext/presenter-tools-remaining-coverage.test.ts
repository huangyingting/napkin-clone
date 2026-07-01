import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { SlideChildNode } from "@/lib/presentation-vnext/schema";
import { resolveDeckRenderTree } from "@/lib/presentation-vnext/render-resolver";
import {
  buildDeckV7,
  buildMinimalThemePackage,
  buildShapeNode,
  buildSlideV7,
  buildTextContent,
  buildTextNode,
  resetBuilderCounter,
} from "@/test/builders/deck-v7";

import {
  PresenterPanelVNext,
  SlideOverviewPanelVNext,
} from "./present-mode/presenter-tools-vnext";

type ElementLike = ReactElement<Record<string, unknown>>;

function collect(node: ReactNode, result: ElementLike[] = []): ElementLike[] {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, result);
    return result;
  }
  if (!isValidElement(node)) return result;
  const element = node as ElementLike;
  result.push(element);
  collect(element.props.children as ReactNode, result);
  return result;
}

function textNode(text: string, role: SlideChildNode["role"] = "body") {
  return buildTextNode({ role, content: buildTextContent([text]) });
}

function shapeWithText(text: string) {
  return buildShapeNode({
    content: { shape: "rect", text: buildTextContent([text]) },
  });
}

test("presenter tools vNext labels fall back through shape, group, notes, and untitled slide paths", () => {
  resetBuilderCounter();
  const shapeSlide = buildSlideV7("content", [shapeWithText(" Shape label ")], {
    name: " \n ",
    notes: "",
  });
  const groupNode: Extract<SlideChildNode, { type: "group" }> = {
    ...buildShapeNode({ id: "group-shell" }),
    type: "group",
    component: "metricCard",
    children: [textNode("Nested group label")],
  };
  const groupSlide = buildSlideV7("content", [groupNode], {
    notes: "Group notes fallback",
  });
  const notesSlide = buildSlideV7("content", [], {
    name: undefined,
    notes: "\n Speaker-note label\nMore notes",
  });
  const untitledSlide = buildSlideV7("content", [], {
    name: undefined,
    notes: undefined,
  });
  const deck = buildDeckV7(
    [shapeSlide, groupSlide, notesSlide, untitledSlide],
    {
      theme: { packageId: "presenter-remaining-package" },
    },
  );
  const renderTree = resolveDeckRenderTree(
    deck,
    buildMinimalThemePackage("presenter-remaining-package"),
  );

  const panelWithoutNext = renderToStaticMarkup(
    createElement(PresenterPanelVNext, {
      currentSlide: shapeSlide,
      currentIndex: 0,
      total: deck.slides.length,
      canvas: { ...renderTree.canvas, width: 0, height: 0 },
    }),
  );
  assert.match(panelWithoutNext, /Shape label/);
  assert.match(panelWithoutNext, /No speaker notes for this slide/);
  assert.doesNotMatch(panelWithoutNext, /Up next/);

  const panelWithNext = renderToStaticMarkup(
    createElement(PresenterPanelVNext, {
      currentSlide: notesSlide,
      currentIndex: 2,
      total: deck.slides.length,
      nextSlide: untitledSlide,
      nextSlideTree: renderTree.slides[3],
      canvas: { ...renderTree.canvas, width: 0, height: 0 },
    }),
  );
  assert.match(panelWithNext, /Speaker-note label/);
  assert.match(panelWithNext, /Slide 4/);

  const jumped: number[] = [];
  const closed: string[] = [];
  const overview = SlideOverviewPanelVNext({
    slides: [shapeSlide, groupSlide, notesSlide],
    renderTree,
    currentIndex: 1,
    onJump: (index) => jumped.push(index),
    onClose: () => closed.push("close"),
  });
  const html = renderToStaticMarkup(overview);
  assert.match(html, /Jump to slide 1, Shape label/);
  assert.match(html, /Jump to slide 2, Nested group label/);
  assert.match(html, /Jump to slide 3, Speaker-note label/);
  assert.match(html, /Jump to slide 4, Untitled slide 4/);

  const elements = collect(overview);
  const backdrop = elements.find(
    (element) =>
      element.type === "div" && typeof element.props.onClick === "function",
  );
  assert.ok(backdrop);
  (backdrop.props.onClick as () => void)();
  const dialog = elements.find((element) => element.props.role === "dialog");
  assert.ok(dialog);
  (dialog.props.onClick as (event: { stopPropagation: () => void }) => void)({
    stopPropagation: () => closed.push("stop"),
  });
  const buttons = elements.filter((element) => element.type === "button");
  const closeButton = buttons.find(
    (button) => button.props["aria-label"] === "Close slide overview",
  );
  assert.ok(closeButton);
  (closeButton.props.onClick as () => void)();
  for (const button of buttons.filter((entry) =>
    String(entry.props["aria-label"] ?? "").startsWith("Jump to slide"),
  )) {
    (button.props.onClick as () => void)();
  }

  assert.deepEqual(jumped, [0, 1, 2, 3]);
  assert.deepEqual(closed, ["close", "stop", "close"]);
});
