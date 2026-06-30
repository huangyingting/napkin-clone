import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DeckDiagnosticsReview } from "./deck-diagnostics-review";
import { makeDiagnostic } from "@/lib/presentation-vnext/diagnostics";
import type { PresentationDiagnostic } from "@/lib/presentation-vnext/diagnostics";

function collectClickHandlers(node: ReactNode): (() => void)[] {
  if (Array.isArray(node)) return node.flatMap(collectClickHandlers);
  if (!isValidElement(node)) return [];
  const props = node.props as { onClick?: () => void; children?: ReactNode };
  return [
    ...(typeof props.onClick === "function" ? [props.onClick] : []),
    ...collectClickHandlers(props.children),
  ];
}

describe("DeckDiagnosticsReview", () => {
  test("renders grouped deck diagnostics with navigation and actions", () => {
    const diagnostics: PresentationDiagnostic[] = [
      makeDiagnostic("missing-asset", "error", "Image asset missing", {
        slideId: "slide-1",
        nodeId: "image-1",
        details: { assetId: "hero" },
        action: { type: "open-asset-panel" },
      }),
      makeDiagnostic("migration-repair-applied", "info", "Migrated deck"),
    ];

    const html = renderToStaticMarkup(
      createElement(DeckDiagnosticsReview, {
        diagnostics,
        onClose: () => undefined,
        onNavigate: () => undefined,
        onAction: () => undefined,
      }),
    );

    assert.match(html, /Diagnostics review/);
    assert.match(html, /Asset hero/);
    assert.match(html, /Deck/);
    assert.match(html, /Go to target/);
    assert.match(html, /Open asset panel/);
  });

  test("renders migration, source, asset, theme, render, and export diagnostics in one surface", () => {
    const diagnostics: PresentationDiagnostic[] = [
      makeDiagnostic("migration-repair-applied", "info", "Migrated deck"),
      makeDiagnostic("stale-source", "warning", "Source is stale", {
        slideId: "slide-1",
        nodeId: "text-1",
        details: { documentId: "doc-1", blockId: "block-1" },
        action: { type: "refresh-source" },
      }),
      makeDiagnostic("missing-asset", "error", "Image asset missing", {
        slideId: "slide-1",
        nodeId: "image-1",
        details: { assetId: "hero" },
      }),
      makeDiagnostic("missing-token", "warning", "Theme token missing", {
        path: "tokens.color.accent",
      }),
      makeDiagnostic("missing-node-layout", "error", "Node has no layout", {
        slideId: "slide-2",
        nodeId: "shape-1",
      }),
      makeDiagnostic(
        "unsupported-export-feature",
        "warning",
        "Export fallback",
        {
          nodeId: "shape-2",
          action: { type: "replace-style-ref" },
        },
      ),
    ];

    const html = renderToStaticMarkup(
      createElement(DeckDiagnosticsReview, {
        diagnostics,
        onClose: () => undefined,
        onNavigate: () => undefined,
        onAction: () => undefined,
      }),
    );

    for (const category of [
      "migration",
      "source",
      "asset",
      "theme",
      "render",
      "export",
    ]) {
      assert.match(html, new RegExp(`· ${category} ·`));
    }
    assert.match(html, /Source block block-1/);
    assert.match(html, /Refresh source/);
  });

  test("routes close, navigation, and action handlers", () => {
    const diagnostics: PresentationDiagnostic[] = [
      makeDiagnostic("missing-asset", "error", "Image asset missing", {
        slideId: "slide-1",
        nodeId: "image-1",
        details: { assetId: "hero" },
        action: { type: "open-asset-panel" },
      }),
    ];
    const calls: string[] = [];
    const element = DeckDiagnosticsReview({
      diagnostics,
      onClose: () => calls.push("close"),
      onNavigate: () => calls.push("navigate"),
      onAction: () => calls.push("action"),
    });

    for (const handler of collectClickHandlers(element)) handler();

    assert.deepEqual(calls, ["close", "navigate", "action"]);
  });
});
