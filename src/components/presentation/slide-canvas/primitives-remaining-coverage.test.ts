import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { TextElement, TextRun } from "@/lib/presentation/deck";

import {
  boxStyle,
  contrastTextColor,
  hexToRgba,
  renderRuns,
  shadowStyle,
} from "./primitives";

test("slide canvas primitives style shadows, text runs, contrast, and rgba fallbacks", () => {
  const baseElement: TextElement = {
    id: "text-1",
    kind: "text",
    box: { x: 10, y: 12, w: 30, h: 20 },
    zIndex: 7,
    opacity: 0.5,
    rotation: -12,
    shadow: {
      x: 1,
      y: 2,
      blur: 3,
      color: "#0f172a",
      opacity: 0.4,
    },
    content: { kind: "text", text: "Hello", runs: [{ text: "Hello" }] },
  };

  assert.deepEqual(boxStyle(baseElement), {
    position: "absolute",
    left: "10%",
    top: "12%",
    width: "30%",
    height: "20%",
    zIndex: 7,
    opacity: 0.5,
    transform: "rotate(-12deg)",
    filter: "drop-shadow(1cqmin 2cqmin 3cqmin rgba(15, 23, 42, 0.4))",
  });
  assert.deepEqual(shadowStyle(true), {
    filter: "drop-shadow(0 0.6cqmin 1.2cqmin rgba(0,0,0,0.28))",
  });
  assert.deepEqual(shadowStyle(undefined), {});

  const runs: TextRun[] = [
    { text: "Bold", bold: true, italic: true, underline: true },
    { text: "\n" },
    { text: "Code", code: true, fontSize: 4, color: "#334155" },
    { text: "Link", link: "https://example.test", color: "#2563eb" },
    { text: "Plain" },
  ];
  const html = renderToStaticMarkup(
    createElement(Fragment, null, ...renderRuns(runs)),
  );

  assert.match(html, /font-weight:700/);
  assert.match(html, /<br\/>/);
  assert.match(html, /ui-monospace/);
  assert.match(html, /href="https:\/\/example.test"/);
  assert.match(html, />Plain</);
  assert.equal(contrastTextColor("#fff"), "#18181b");
  assert.equal(contrastTextColor("#111111"), "#ffffff");
  assert.equal(contrastTextColor("no"), "#ffffff");
  assert.equal(hexToRgba("#abc", 0.25), "rgba(170, 187, 204, 0.25)");
  assert.equal(hexToRgba("no", 0.75), "rgba(113, 113, 122, 0.75)");
});
