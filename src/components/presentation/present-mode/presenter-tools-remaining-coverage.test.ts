import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Deck, Slide } from "@/lib/presentation/deck";
import type { Visual } from "@/lib/visual/schema";

import {
  HudButton,
  KeyboardHelpOverlay,
  PresenterPanel,
  PresenterTimer,
  PresenterToolIcon,
  SlideOverviewPanel,
} from "./presenter-tools";

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

function slide(overrides: Record<string, unknown>): Slide {
  return {
    id: "slide",
    index: 0,
    title: "Overview title",
    bullets: [],
    notes: "Speaker notes",
    elements: [],
    ...overrides,
  } as unknown as Slide;
}

function deck(slides: Slide[]): Deck {
  return {
    id: "deck",
    title: "Deck",
    slides,
    theme: "default",
  } as unknown as Deck;
}

test("v6 presenter tools render overlay, panel, icons, timer, and overview interaction branches", () => {
  const slides = [
    slide({ id: "slide-1", index: 0, title: "First", notes: "Current notes" }),
    slide({ id: "slide-2", index: 1, title: "", notes: "" }),
  ];
  const testDeck = deck(slides);
  const visuals = new Map<string, Visual>();
  const closed: string[] = [];
  const jumps: number[] = [];
  const hudClicks: string[] = [];

  const help = KeyboardHelpOverlay({ onClose: () => closed.push("help") });
  const overview = SlideOverviewPanel({
    slides,
    deck: testDeck,
    visuals,
    slideFormat: "16:9",
    currentIndex: 1,
    onJump: (index) => jumps.push(index),
    onClose: () => closed.push("overview"),
  });
  const markup = renderToStaticMarkup(
    createElement(
      "div",
      null,
      help,
      overview,
      createElement(PresenterTimer, { elapsedSeconds: 3661 }),
      createElement(PresenterPanel, {
        currentSlide: slides[0],
        currentIndex: 0,
        total: slides.length,
        nextSlide: slides[1],
        deck: testDeck,
        visuals,
        slideFormat: "4:3",
      }),
      createElement(PresenterPanel, {
        currentSlide: slides[1],
        currentIndex: 1,
        total: slides.length,
        nextSlide: undefined,
        deck: testDeck,
        visuals,
        slideFormat: "16:9",
      }),
      HudButton({
        label: "Toggle notes",
        active: true,
        onClick: () => hudClicks.push("notes"),
        children: createElement(PresenterToolIcon, { kind: "notes" }),
      }),
      createElement(PresenterToolIcon, { kind: "overview" }),
      createElement(PresenterToolIcon, { kind: "timer" }),
      createElement(PresenterToolIcon, { kind: "laser", laserActive: true }),
      createElement(PresenterToolIcon, { kind: "laser", laserActive: false }),
      createElement(PresenterToolIcon, {
        kind: "fullscreen",
        isFullscreen: true,
      }),
      createElement(PresenterToolIcon, {
        kind: "fullscreen",
        isFullscreen: false,
      }),
      createElement(PresenterToolIcon, { kind: "exit" }),
    ),
  );

  assert.match(markup, /Keyboard shortcuts/);
  assert.match(markup, /Elapsed time 01:01:01/);
  assert.match(markup, /No speaker notes for this slide/);
  assert.match(markup, /Untitled slide 2/);
  assert.match(markup, /Current/);

  for (const tree of [help, overview]) {
    const elements = collect(tree);
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
  }

  const buttons = collect(overview).filter(
    (element) => element.type === "button",
  );
  for (const button of buttons.filter((entry) =>
    String(entry.props["aria-label"] ?? "").startsWith("Jump to slide"),
  )) {
    (button.props.onClick as () => void)();
  }
  const closeHelp = collect(help).find(
    (element) => element.props["aria-label"] === "Close keyboard shortcuts",
  );
  assert.ok(closeHelp);
  (closeHelp.props.onClick as () => void)();

  const hud = HudButton({
    label: "Laser",
    active: false,
    onClick: () => hudClicks.push("laser"),
    children: createElement(PresenterToolIcon, { kind: "laser" }),
  });
  (hud.props.onClick as () => void)();

  assert.deepEqual(jumps, [0, 1]);
  assert.ok(closed.includes("help"));
  assert.ok(closed.includes("overview"));
  assert.ok(hudClicks.includes("laser"));
});
