import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { InspectorShell } from "./inspector-shell";
import type { PresentationDiagnostic } from "@/lib/presentation-vnext/diagnostics";
import type {
  SlideChildNode,
  SlideNode,
} from "@/lib/presentation-vnext/schema";

const textNode: SlideChildNode = {
  id: "text-1",
  type: "text",
  role: "body",
  layout: { frame: { x: 10, y: 10, w: 30, h: 12 }, zIndex: 1 },
  content: { paragraphs: [{ id: "p1", text: "Body" }] },
};

const slide: SlideNode = {
  id: "slide-1",
  type: "slide",
  name: "Slide 1",
  template: { kind: "cover", layoutId: "default" },
  controls: {},
  props: {},
  children: [],
  notes: "Speaker note text",
};

function renderInspector({
  initialPanel,
  diagnostics = [],
  selectedNode,
}: {
  initialPanel?: Parameters<typeof InspectorShell>[0]["initialPanel"];
  diagnostics?: PresentationDiagnostic[];
  selectedNode?: SlideChildNode;
} = {}) {
  const noop = () => undefined;
  return renderToStaticMarkup(
    createElement(InspectorShell, {
      activeSlide: slide,
      selectedNode,
      selectedIds: selectedNode ? [selectedNode.id] : [],
      isDecorationSelected: false,
      diagnostics,
      onUpdateControls: noop,
      onUpdateProps: noop,
      onUpdateSlideAttributes: noop,
      onUpdateSlideLocalStyle: noop,
      onResetSlideLocalStyle: noop,
      onUpdateSlideSource: noop,
      onUpdateSelectedLayout: noop,
      onUpdateSelectedAttributes: noop,
      onUpdateSelectedContent: noop,
      onUpdateSelectedLocalStyle: noop,
      onResetToTheme: noop,
      onUpdateSelectedSource: noop,
      onChangeStyleBinding: noop,
      onAlignSelection: noop,
      onDistributeSelection: noop,
      onMatchSize: noop,
      onGroupSelection: noop,
      onUngroupSelection: noop,
      onReorderSelection: noop,
      onSelectLayer: noop,
      onUpdateLayer: noop,
      onReorderLayer: noop,
      onDetachDecoration: noop,
      onDiagnosticAction: noop,
      TEMPLATE_OPTIONS: [{ kind: "cover", label: "Cover" }],
      activeTemplate: undefined,
      activeLayoutId: "default",
      onReapplyTemplate: noop,
      selectionMode: "normal",
      onToggleSelectionMode: noop,
      initialPanel,
    }),
  );
}

describe("InspectorShell render affordances", () => {
  test("initialPanel can open the notes panel", () => {
    const html = renderInspector({ initialPanel: "notes" });

    assert.match(html, /Speaker Notes/);
    assert.match(html, /Speaker note text/);
    assert.match(html, /aria-selected="true"/);
  });

  test("diagnostics tab displays a count badge", () => {
    const html = renderInspector({
      diagnostics: [
        {
          code: "missing-asset",
          severity: "error",
          message: "Missing asset",
        },
        {
          code: "unsupported-export-feature",
          severity: "warning",
          message: "Unsupported export feature",
        },
      ],
    });

    assert.match(html, /Diagnostics/);
    assert.match(html, /aria-label="2 diagnostics"/);
  });

  test("single selection arrange panel exposes align and z-order controls", () => {
    const html = renderInspector({
      initialPanel: "arrange",
      selectedNode: textNode,
    });

    assert.match(html, />Arrange</);
    assert.match(html, />Center</);
    assert.match(html, />Bring front</);
    assert.match(html, />Backward</);
  });
});
