import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildDeckV7,
  buildSlideV7,
  buildTextContent,
  buildTextNode,
} from "@/test/builders/deck-v7";
import type { SourceBlockIndex } from "./block-index";
import type { DeckV7, SlideChildNode } from "./schema";
import {
  classifyDeckSourceLinks,
  dismissNodeSourceIssue,
  refreshAllSafeSourceLinks,
  refreshNodeSource,
  relinkNodeSource,
  sourceLinkDiagnostics,
  sourceReviewItems,
  unlinkNodeSource,
} from "./source-links";

const NOW = "2026-06-30T10:00:00.000Z";

function sourceNode(
  id: string,
  source: NonNullable<SlideChildNode["source"]>,
  text = id,
): SlideChildNode {
  return buildTextNode({
    id,
    name: id,
    content: buildTextContent([text]),
    source,
  });
}

function index(): SourceBlockIndex {
  return {
    documentId: "doc-1",
    blocks: [
      {
        documentId: "doc-1",
        id: "block-fresh",
        kind: "text",
        hash: "hash-fresh",
        displayLabel: "Fresh block",
        refresh: { kind: "text", text: "Fresh block" },
      },
      {
        documentId: "doc-1",
        id: "block-stale",
        kind: "text",
        hash: "hash-new",
        displayLabel: "Updated block",
        refresh: {
          kind: "text",
          text: "Updated block",
          runs: [{ text: "Updated block", bold: true }],
        },
      },
      {
        documentId: "doc-1",
        id: "block-table",
        kind: "table",
        hash: "hash-table",
        displayLabel: "Table block",
        refresh: {
          kind: "table",
          columns: [{ id: "c1", label: "Metric" }],
          rows: [{ id: "r1", cells: [{ text: "ARR" }] }],
          caption: "Metrics",
        },
      },
    ],
  };
}

function deckWithSources(): DeckV7 {
  return buildDeckV7([
    buildSlideV7(
      "content",
      [
        sourceNode("fresh-node", {
          documentId: "doc-1",
          blockId: "block-fresh",
          blockKind: "text",
          contentHash: "hash-fresh",
        }),
        sourceNode("stale-node", {
          documentId: "doc-1",
          blockId: "block-stale",
          blockKind: "text",
          contentHash: "hash-old",
        }),
        sourceNode("orphan-node", {
          documentId: "doc-1",
          blockId: "missing-block",
          blockKind: "text",
          contentHash: "hash-missing",
        }),
        sourceNode("remote-node", {
          documentId: "doc-2",
          blockId: "block-stale",
          blockKind: "text",
          contentHash: "hash-old",
        }),
        sourceNode("unlinked-node", {
          documentId: "doc-1",
          blockId: "block-stale",
          blockKind: "text",
          contentHash: "hash-old",
          unlinked: true,
        }),
      ],
      { id: "slide-1", name: "Overview" },
    ),
  ]);
}

describe("v7 source link classification", () => {
  test("classifies fresh, stale, orphan, unknown, and unlinked states", () => {
    const classifications = classifyDeckSourceLinks(deckWithSources(), index());

    assert.deepEqual(
      classifications.map((item) => [item.nodeId, item.state]),
      [
        ["fresh-node", "fresh"],
        ["stale-node", "stale"],
        ["orphan-node", "orphan"],
        ["remote-node", "unknown"],
        ["unlinked-node", "unlinked"],
      ],
    );
    assert.match(
      classifications.find((item) => item.nodeId === "remote-node")?.reason ??
        "",
      /different document/,
    );
  });

  test("emits source diagnostics only for non-fresh links", () => {
    const diagnostics = sourceLinkDiagnostics(
      classifyDeckSourceLinks(deckWithSources(), index()),
    );

    assert.deepEqual(
      diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.nodeId]),
      [
        ["stale-source", "stale-node"],
        ["orphaned-source", "orphan-node"],
        ["source-refresh-failed", "remote-node"],
      ],
    );
    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.nodeId === "fresh-node"),
      false,
    );
  });

  test("groups deck review rows by slide identity and source state", () => {
    const items = sourceReviewItems(
      deckWithSources(),
      classifyDeckSourceLinks(deckWithSources(), index()),
    );

    assert.equal(items.length, 3);
    assert.deepEqual(
      items.map((item) => [item.slideLabel, item.nodeId, item.state]),
      [
        ["Overview", "stale-node", "stale"],
        ["Overview", "orphan-node", "orphan"],
        ["Overview", "remote-node", "unknown"],
      ],
    );
  });
});

describe("v7 source link commands", () => {
  test("refreshes a stale selected node from the matching block", () => {
    const result = refreshNodeSource(
      deckWithSources(),
      "slide-1",
      "stale-node",
      index(),
      NOW,
    );

    assert.equal(result.status, "refreshed");
    if (result.status !== "refreshed") return;
    const node = result.deck.slides[0].children.find(
      (candidate) => candidate.id === "stale-node",
    );
    assert.equal(node?.type, "text");
    if (node?.type === "text") {
      assert.equal(node.content.paragraphs[0].text, "Updated block");
      assert.equal(node.content.paragraphs[0].runs?.[0].bold, true);
      assert.equal(node.source?.contentHash, "hash-new");
      assert.equal(node.source?.refresh?.state, "fresh");
    }
  });

  test("marks a node unlinked without deleting content", () => {
    const updated = unlinkNodeSource(
      deckWithSources(),
      "slide-1",
      "stale-node",
      NOW,
    );
    const node = updated.slides[0].children.find(
      (candidate) => candidate.id === "stale-node",
    );

    assert.equal(node?.source?.unlinked, true);
    assert.equal(node?.source?.refresh?.state, "unlinked");
    assert.equal(
      node?.type === "text" ? node.content.paragraphs[0].text : "",
      "stale-node",
    );
  });

  test("relinks only to an explicit reviewed block", () => {
    const target = index().blocks[0];
    const result = relinkNodeSource(
      deckWithSources(),
      "slide-1",
      "orphan-node",
      target,
      NOW,
    );

    assert.equal(result.status, "refreshed");
    if (result.status !== "refreshed") return;
    const node = result.deck.slides[0].children.find(
      (candidate) => candidate.id === "orphan-node",
    );
    assert.equal(node?.source?.blockId, "block-fresh");
    assert.equal(node?.source?.contentHash, "hash-fresh");
  });

  test("refresh all updates safe stale links and skips risky items", () => {
    const result = refreshAllSafeSourceLinks(deckWithSources(), index(), NOW);

    assert.deepEqual(
      result.refreshed.map((item) => item.nodeId),
      ["stale-node"],
    );
    assert.deepEqual(
      result.skipped.map(({ item }) => item.nodeId),
      ["orphan-node", "remote-node"],
    );
    const refreshed = result.deck.slides[0].children.find(
      (candidate) => candidate.id === "stale-node",
    );
    assert.equal(refreshed?.source?.refresh?.state, "fresh");
  });

  test("safe refresh skips incompatible source payloads without marking them fresh", () => {
    const deck = buildDeckV7([
      buildSlideV7("content", [
        sourceNode("text-linked-to-table", {
          documentId: "doc-1",
          blockId: "block-table",
          blockKind: "table",
          contentHash: "old-table-hash",
        }),
      ]),
    ]);

    const result = refreshNodeSource(
      deck,
      deck.slides[0].id,
      "text-linked-to-table",
      index(),
      NOW,
    );

    assert.equal(result.status, "skipped");
    const node = result.deck.slides[0].children[0];
    assert.equal(node.source?.contentHash, "old-table-hash");
    assert.equal(node.source?.refresh?.state, "unknown");
  });

  test("safe refresh all skips ambiguous matching blocks with a visible reason", () => {
    const ambiguousIndex: SourceBlockIndex = {
      documentId: "doc-1",
      blocks: [
        ...index().blocks,
        {
          documentId: "doc-1",
          id: "block-stale",
          kind: "text",
          hash: "hash-other",
          displayLabel: "Duplicate block",
          refresh: { kind: "text", text: "Duplicate block" },
        },
      ],
    };

    const result = refreshAllSafeSourceLinks(
      deckWithSources(),
      ambiguousIndex,
      NOW,
    );

    assert.deepEqual(
      result.refreshed.map((item) => item.nodeId),
      [],
    );
    assert.ok(
      result.skipped.some(
        ({ item, reason }) =>
          item.nodeId === "stale-node" && /Multiple source blocks/.test(reason),
      ),
    );
    const stale = result.deck.slides[0].children.find(
      (candidate) => candidate.id === "stale-node",
    );
    assert.equal(stale?.source?.contentHash, "hash-old");
  });

  test("dismisses one source review item without changing content", () => {
    const dismissed = dismissNodeSourceIssue(
      deckWithSources(),
      "slide-1",
      "stale-node",
      index(),
      NOW,
    );
    const classifications = classifyDeckSourceLinks(dismissed, index());
    const stale = classifications.find((item) => item.nodeId === "stale-node");

    assert.equal(stale?.dismissed, true);
    assert.deepEqual(
      sourceReviewItems(dismissed, classifications).map((item) => item.nodeId),
      ["orphan-node", "remote-node"],
    );
    assert.equal(
      sourceLinkDiagnostics(classifications).some(
        (diagnostic) => diagnostic.nodeId === "stale-node",
      ),
      false,
    );
    const node = dismissed.slides[0].children.find(
      (candidate) => candidate.id === "stale-node",
    );
    assert.equal(
      node?.type === "text" ? node.content.paragraphs[0].text : "",
      "stale-node",
    );
    const bulk = refreshAllSafeSourceLinks(dismissed, index(), NOW);
    assert.deepEqual(
      bulk.refreshed.map((item) => item.nodeId),
      [],
    );
  });

  test("requires an explicit reviewed document change for cross-document relink", () => {
    const target = index().blocks[0];
    const rejected = relinkNodeSource(
      deckWithSources(),
      "slide-1",
      "remote-node",
      target,
      NOW,
    );
    assert.equal(rejected.status, "skipped");
    assert.match(
      rejected.status === "skipped" ? rejected.reason : "",
      /Cross-document relink/,
    );

    const accepted = relinkNodeSource(
      deckWithSources(),
      "slide-1",
      "remote-node",
      target,
      NOW,
      { allowDocumentChange: true },
    );

    assert.equal(accepted.status, "refreshed");
    if (accepted.status !== "refreshed") return;
    const node = accepted.deck.slides[0].children.find(
      (candidate) => candidate.id === "remote-node",
    );
    assert.equal(node?.source?.documentId, "doc-1");
    assert.equal(node?.source?.blockId, "block-fresh");
  });
});
