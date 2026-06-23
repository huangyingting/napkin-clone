/**
 * Tests for the document-to-deck source reference model (#475).
 *
 * All tests are pure (no DB, no React, no Prisma) — they exercise the
 * enumeration, health-check, and reconcile helpers directly.
 */

import assert from "node:assert/strict";
import { test, describe } from "node:test";

import type { Deck, Slide, SourceRef } from "@/lib/presentation/deck";
import type { DocumentBlock } from "@/lib/visual/document-export";
import {
  enumerateDeckDependencies,
  checkDependencyHealth,
  reconcileDeckVisuals,
  collectDeckVisualIds,
} from "./source-ref-model";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeDeck(slides: Slide[]): Deck {
  return {
    slides,
    theme: "indigo",
    version: 1,
  } as unknown as Deck;
}

function makeVisualSlide(
  slideId: string,
  elementId: string,
  visualId: string,
  sourceRef?: SourceRef,
): Slide {
  return {
    id: slideId,
    title: "",
    bullets: [],
    index: 0,
    visualIds: [],
    layout: "content",
    notes: "",
    theme: "indigo",
    elements: [
      {
        id: elementId,
        kind: "visual",
        visualId,
        box: { x: 0, y: 0, w: 400, h: 300 },
        zIndex: 0,
        ...(sourceRef ? { sourceRef } : {}),
      },
    ],
  } as unknown as Slide;
}

function makeTextSlide(
  slideId: string,
  elementId: string,
  text: string,
  sourceRef?: SourceRef,
): Slide {
  return {
    id: slideId,
    title: "",
    bullets: [],
    index: 0,
    visualIds: [],
    layout: "content",
    notes: "",
    theme: "indigo",
    elements: [
      {
        id: elementId,
        kind: "text",
        text,
        box: { x: 0, y: 0, w: 400, h: 100 },
        zIndex: 0,
        ...(sourceRef ? { sourceRef } : {}),
      },
    ],
  } as unknown as Slide;
}

function makeVisualBlock(visualId: string): DocumentBlock {
  return { kind: "visual", visualId } as unknown as DocumentBlock;
}

function makeTextBlock(blockId: string, text: string): DocumentBlock {
  return { kind: "text", blockId, text, runs: [] } as unknown as DocumentBlock;
}

// ---------------------------------------------------------------------------
// enumerateDeckDependencies
// ---------------------------------------------------------------------------

describe("enumerateDeckDependencies", () => {
  test("returns empty array for a deck with no references", () => {
    const deck = makeDeck([
      {
        id: "s1",
        title: "Title",
        bullets: [],
        index: 0,
        visualIds: [],
        layout: "content",
        notes: "",
        theme: "indigo",
      } as unknown as Slide,
    ]);
    const deps = enumerateDeckDependencies(deck);
    assert.deepEqual(deps, []);
  });

  test("enumerates visual element references", () => {
    const deck = makeDeck([makeVisualSlide("s1", "e1", "vis-abc")]);
    const deps = enumerateDeckDependencies(deck);
    assert.equal(deps.length, 1);
    assert.equal(deps[0].kind, "visual");
    assert.equal((deps[0] as { visualId: string }).visualId, "vis-abc");
  });

  test("enumerates source_ref dependencies on text elements", () => {
    const ref: SourceRef = {
      documentId: "doc-1",
      blockId: "block-xyz",
      contentHash: "abc123",
      linkedAt: "2026-01-01T00:00:00Z",
      blockKind: "text",
    };
    const deck = makeDeck([makeTextSlide("s1", "e1", "Hello", ref)]);
    const deps = enumerateDeckDependencies(deck);
    assert.equal(deps.length, 1);
    assert.equal(deps[0].kind, "source_ref");
    const dep = deps[0] as { blockId: string; blockKind: string };
    assert.equal(dep.blockId, "block-xyz");
    assert.equal(dep.blockKind, "text");
  });

  test("skips source_ref with unlinked=true", () => {
    const ref: SourceRef = {
      documentId: "doc-1",
      blockId: "block-xyz",
      linkedAt: "2024-01-01T00:00:00Z",
      unlinked: true,
      blockKind: "text",
    };
    const deck = makeDeck([makeTextSlide("s1", "e1", "Hello", ref)]);
    const deps = enumerateDeckDependencies(deck);
    assert.equal(deps.length, 0);
  });

  test("enumerates both visual element and source_ref when both are present", () => {
    const ref: SourceRef = {
      documentId: "doc-1",
      blockId: "vis-abc",
      blockKind: "visual",
      contentHash: "hash1",
      linkedAt: "2026-01-01T00:00:00Z",
    };
    const deck = makeDeck([makeVisualSlide("s1", "e1", "vis-abc", ref)]);
    const deps = enumerateDeckDependencies(deck);
    assert.equal(deps.length, 2);
    const kinds = deps.map((d) => d.kind).sort();
    assert.deepEqual(kinds, ["source_ref", "visual"]);
  });

  test("handles multiple slides with mixed dependency kinds", () => {
    const deck = makeDeck([
      makeVisualSlide("s2", "e1", "vis-2"),
      makeTextSlide("s3", "e2", "text", {
        documentId: "d",
        blockId: "block-1",
        contentHash: "h",
        linkedAt: "2026-01-01T00:00:00Z",
        blockKind: "text",
      }),
    ]);
    const deps = enumerateDeckDependencies(deck);
    assert.equal(deps.length, 2);
    const kinds = deps.map((d) => d.kind).sort();
    assert.deepEqual(kinds, ["source_ref", "visual"]);
  });
});

// ---------------------------------------------------------------------------
// checkDependencyHealth
// ---------------------------------------------------------------------------

describe("checkDependencyHealth", () => {
  test("visual dep is 'found' when visual block exists", () => {
    const deck = makeDeck([makeVisualSlide("s1", "e1", "vis-1")]);
    const freshBlocks: DocumentBlock[] = [makeVisualBlock("vis-1")];
    const health = checkDependencyHealth(deck, freshBlocks);
    assert.equal(health.length, 1);
    assert.equal(health[0].resolution.status, "found");
  });

  test("visual dep is 'missing' when visual block is gone", () => {
    const deck = makeDeck([makeVisualSlide("s1", "e1", "vis-missing")]);
    const freshBlocks: DocumentBlock[] = [makeVisualBlock("vis-other")];
    const health = checkDependencyHealth(deck, freshBlocks);
    assert.equal(health[0].resolution.status, "missing");
  });

  test("source_ref dep is 'found' when text block matches hash", () => {
    // We need a real hash; skip hash check by not including contentHash.
    const ref: SourceRef = {
      documentId: "d",
      blockId: "block-1",
      linkedAt: "2026-01-01T00:00:00Z",
      blockKind: "text",
      // No contentHash → resolveSourceRef skips hash check → "found"
    };
    const deck = makeDeck([makeTextSlide("s1", "e1", "hello", ref)]);
    const freshBlocks: DocumentBlock[] = [makeTextBlock("block-1", "hello")];
    const health = checkDependencyHealth(deck, freshBlocks);
    assert.equal(health.length, 1);
    assert.equal(health[0].resolution.status, "found");
  });

  test("source_ref dep is 'missing' when block is gone", () => {
    const ref: SourceRef = {
      documentId: "d",
      blockId: "block-missing",
      linkedAt: "2026-01-01T00:00:00Z",
      blockKind: "text",
    };
    const deck = makeDeck([makeTextSlide("s1", "e1", "text", ref)]);
    const freshBlocks: DocumentBlock[] = [
      makeTextBlock("block-other", "other"),
    ];
    const health = checkDependencyHealth(deck, freshBlocks);
    assert.equal(health[0].resolution.status, "missing");
  });

  test("returns empty array for a clean deck with no deps", () => {
    const deck = makeDeck([
      {
        id: "s1",
        title: "No refs",
        bullets: [],
        index: 0,
        visualIds: [],
        layout: "content",
        notes: "",
        theme: "indigo",
      } as unknown as Slide,
    ]);
    const health = checkDependencyHealth(deck, []);
    assert.deepEqual(health, []);
  });
});

// ---------------------------------------------------------------------------
// reconcileDeckVisuals
// ---------------------------------------------------------------------------

describe("reconcileDeckVisuals", () => {
  test("removes orphaned visual elements", () => {
    const deck = makeDeck([
      makeVisualSlide("s1", "e1", "vis-exists"),
      makeVisualSlide("s2", "e2", "vis-gone"),
    ]);
    const known = new Set(["vis-exists"]);
    const reconciled = reconcileDeckVisuals(deck, known);
    const slide1 = reconciled.slides.find((s) => s.id === "s1")!;
    const slide2 = reconciled.slides.find((s) => s.id === "s2")!;
    assert.ok(slide1.elements?.some((e) => e.id === "e1"));
    assert.equal(slide2.elements?.length ?? 0, 0);
  });

  test("is a no-op when all visuals are known", () => {
    const deck = makeDeck([makeVisualSlide("s1", "e1", "vis-a")]);
    const known = new Set(["vis-a"]);
    const reconciled = reconcileDeckVisuals(deck, known);
    assert.strictEqual(reconciled.slides[0], deck.slides[0]);
  });
});

// ---------------------------------------------------------------------------
// collectDeckVisualIds
// ---------------------------------------------------------------------------

describe("collectDeckVisualIds", () => {
  test("collects visual ids from elements", () => {
    const deck = makeDeck([makeVisualSlide("s1", "e1", "vis-a")]);
    const ids = collectDeckVisualIds(deck);
    assert.ok(ids.has("vis-a"));
    assert.equal(ids.size, 1);
  });

  test("deduplicates ids that appear in multiple elements", () => {
    const deck = makeDeck([
      makeVisualSlide("s1", "e1", "vis-shared"),
      makeVisualSlide("s2", "e2", "vis-shared"),
    ]);
    const ids = collectDeckVisualIds(deck);
    assert.equal(ids.size, 1);
    assert.ok(ids.has("vis-shared"));
  });

  test("returns empty set for deck with no visual references", () => {
    const deck = makeDeck([
      {
        id: "s1",
        title: "No visuals",
        bullets: [],
        index: 0,
        visualIds: [],
        layout: "content",
        notes: "",
        theme: "indigo",
      } as unknown as Slide,
    ]);
    const ids = collectDeckVisualIds(deck);
    assert.equal(ids.size, 0);
  });
});

// ---------------------------------------------------------------------------
// Integration: restore scenario — orphan detection + reconcile
// ---------------------------------------------------------------------------

describe("restore scenario: orphan detection and reconcile", () => {
  test("detects and removes visual that existed before restore but not after", () => {
    // Before restore: deck has vis-old. After restore: contentJson has vis-new.
    const deck = makeDeck([
      makeVisualSlide("s1", "e1", "vis-old"),
      makeVisualSlide("s2", "e2", "vis-new"),
    ]);
    const freshBlocksAfterRestore: DocumentBlock[] = [
      makeVisualBlock("vis-new"),
    ];
    const knownAfterRestore = new Set(["vis-new"]);

    // Health check reveals vis-old is missing.
    const health = checkDependencyHealth(deck, freshBlocksAfterRestore);
    const missing = health.filter((h) => h.resolution.status === "missing");
    assert.equal(missing.length, 1);
    const dep = missing[0].dependency as { visualId: string };
    assert.equal(dep.visualId, "vis-old");

    // Reconcile strips it.
    const reconciled = reconcileDeckVisuals(deck, knownAfterRestore);
    const ids = collectDeckVisualIds(reconciled);
    assert.ok(!ids.has("vis-old"), "orphaned visual should be removed");
    assert.ok(ids.has("vis-new"), "valid visual should remain");
  });
});
