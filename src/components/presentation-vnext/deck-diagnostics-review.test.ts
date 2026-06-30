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
