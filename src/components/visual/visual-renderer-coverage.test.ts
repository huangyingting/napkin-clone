import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { VisualRenderer } from "./visual-renderer";
import {
  DEFAULT_STYLE,
  type Visual,
  type VisualKind,
} from "@/lib/visual/schema";

const VISUAL_KINDS: VisualKind[] = [
  "flowchart",
  "mindmap",
  "list",
  "chart",
  "concept",
  "timeline",
  "cycle",
  "comparison",
  "funnel",
  "venn",
  "pyramid",
  "matrix",
  "orgchart",
];

function visualFixture(type: VisualKind): Visual {
  return {
    version: 1,
    type,
    title: `${type} coverage visual`,
    width: 760,
    height: 480,
    canvasStyle: type === "timeline" ? "ruled" : "dot-grid",
    effects: [{ kind: "shadow" }, { kind: "sketch" }],
    style: DEFAULT_STYLE,
    nodes: [
      {
        id: "n1",
        label: "Discovery and planning",
        x: 160,
        y: 120,
        width: 170,
        height: 70,
        value: 0,
        icon: "Activity",
        fillStyle: "gradient",
        borderStyle: "dashed",
        textAlign: "left",
      },
      {
        id: "n2",
        label: "Execution",
        x: 380,
        y: 240,
        width: 170,
        height: 70,
        value: 1,
        color: "#0ea5e9",
        stroke: "#0369a1",
        textColor: "#082f49",
        shape: "diamond",
        textAlign: "center",
      },
      {
        id: "n3",
        label: "Review and launch",
        x: 600,
        y: 340,
        width: 170,
        height: 70,
        value: 2,
        color: "#10b981",
        shape: "hexagon",
        textAlign: "right",
      },
      {
        id: "n4",
        label: "Sustain",
        x: 560,
        y: 120,
        width: 150,
        height: 60,
        value: 3,
      },
    ],
    edges: [
      {
        id: "e1",
        from: "n1",
        to: "n2",
        label: "handoff",
        style: "curved",
        arrowStyle: "open",
        lineStyle: "dashed",
      },
      {
        id: "e2",
        from: "n2",
        to: "n3",
        label: "ship",
        arrowStyle: "diamond",
        lineStyle: "dotted",
      },
      {
        id: "e3",
        from: "n3",
        to: "n4",
        directed: false,
        arrowStyle: "circle",
      },
    ],
  };
}

test("VisualRenderer renders every visual family with authored decorations", () => {
  for (const kind of VISUAL_KINDS) {
    const html = renderToStaticMarkup(
      createElement(VisualRenderer, {
        visual: visualFixture(kind),
        title: `Rendered ${kind}`,
      }),
    );

    assert.match(html, new RegExp(`Rendered ${kind}`));
    assert.match(html, /Discovery and planning|Execution|Review and launch/);
  }
});
