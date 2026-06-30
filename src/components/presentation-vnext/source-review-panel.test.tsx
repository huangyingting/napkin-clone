import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { SourceBlockIndexEntry } from "@/lib/presentation-vnext/block-index";
import type { SourceReviewItem } from "@/lib/presentation-vnext/source-links";
import { SourceReviewPanel } from "./source-review-panel";

const block: SourceBlockIndexEntry = {
  documentId: "doc-1",
  id: "block-1",
  kind: "text",
  hash: "hash-1",
  displayLabel: "Executive summary",
  refresh: { kind: "text", text: "Executive summary" },
};

const items: SourceReviewItem[] = [
  {
    slideId: "slide-1",
    slideIndex: 0,
    slideLabel: "Slide 1",
    nodeId: "node-stale",
    nodeType: "text",
    nodeName: "Narrative",
    source: {
      documentId: "doc-1",
      blockId: "block-1",
      blockKind: "text",
      contentHash: "old-hash",
    },
    state: "stale",
    reason: "Source block content changed.",
    sourceLabel: "Executive summary",
    block,
  },
  {
    slideId: "slide-2",
    slideIndex: 1,
    slideLabel: "Slide 2",
    nodeId: "node-orphan",
    nodeType: "text",
    source: {
      documentId: "doc-1",
      blockId: "missing-block",
      blockKind: "text",
      contentHash: "missing-hash",
    },
    state: "orphan",
    reason: "Source block is missing from the current document.",
    sourceLabel: "missing-block",
  },
];

describe("SourceReviewPanel", () => {
  test("renders deck-level source issues with safe actions", () => {
    const html = renderToStaticMarkup(
      React.createElement(SourceReviewPanel, {
        items,
        sourceBlocks: [block],
        onSelect: () => undefined,
        onRefresh: () => undefined,
        onUnlink: () => undefined,
        onRelink: () => undefined,
        onRefreshAll: () => undefined,
      }),
    );

    assert.match(html, /Source Review/);
    assert.match(html, /Slide 1/);
    assert.match(html, /Narrative/);
    assert.match(html, /Stale/);
    assert.match(html, /Orphaned/);
    assert.match(html, /Refresh all safe stale \(1\)/);
    assert.match(html, /Mark unlinked/);
  });
});
