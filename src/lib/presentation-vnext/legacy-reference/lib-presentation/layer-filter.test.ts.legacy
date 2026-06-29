/**
 * Unit tests for layer-filter.ts — richer layer-panel filtering (#652).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  filterLayers,
  parseLayerQuery,
  type FilterableLayer,
} from "./layer-filter";

interface L extends FilterableLayer {
  id: string;
  name: string;
}

const els: L[] = [
  { id: "t1", name: "Title", kind: "text" },
  { id: "b1", name: "Bullets", kind: "text", locked: true },
  { id: "i1", name: "Hero image", kind: "image", hidden: true },
  { id: "v1", name: "Chart", kind: "visual", source: { documentId: "d" } },
  { id: "s1", name: "Box", kind: "shape", groupId: "g1" },
];

const nameOf = (el: L) => el.name;

test("empty query returns all elements in order", () => {
  assert.deepStrictEqual(
    filterLayers(els, "  ", nameOf).map((e) => e.id),
    ["t1", "b1", "i1", "v1", "s1"],
  );
});

test("plain text matches the display name (case-insensitive)", () => {
  assert.deepStrictEqual(
    filterLayers(els, "image", nameOf).map((e) => e.id),
    ["i1"],
  );
  assert.deepStrictEqual(
    filterLayers(els, "BOX", nameOf).map((e) => e.id),
    ["s1"],
  );
});

test("kind: filters by element kind", () => {
  assert.deepStrictEqual(
    filterLayers(els, "kind:text", nameOf).map((e) => e.id),
    ["t1", "b1"],
  );
});

test("is:locked / is:hidden / is:source / is:group filter by state", () => {
  assert.deepStrictEqual(
    filterLayers(els, "is:locked", nameOf).map((e) => e.id),
    ["b1"],
  );
  assert.deepStrictEqual(
    filterLayers(els, "is:hidden", nameOf).map((e) => e.id),
    ["i1"],
  );
  assert.deepStrictEqual(
    filterLayers(els, "is:source", nameOf).map((e) => e.id),
    ["v1"],
  );
  assert.deepStrictEqual(
    filterLayers(els, "is:group", nameOf).map((e) => e.id),
    ["s1"],
  );
});

test("negated state tokens work (is:visible / is:unlocked / is:standalone)", () => {
  assert.deepStrictEqual(
    filterLayers(els, "is:visible", nameOf).map((e) => e.id),
    ["t1", "b1", "v1", "s1"],
  );
  assert.deepStrictEqual(
    filterLayers(els, "is:unlocked", nameOf).map((e) => e.id),
    ["t1", "i1", "v1", "s1"],
  );
});

test("multiple tokens combine with AND", () => {
  const mixed: L[] = [
    { id: "a", name: "Body copy", kind: "text", locked: true },
    { id: "b", name: "Body copy", kind: "text" },
    { id: "c", name: "Heading", kind: "text", locked: true },
  ];
  assert.deepStrictEqual(
    filterLayers(mixed, "kind:text is:locked body", nameOf).map((e) => e.id),
    ["a"],
  );
});

test("parseLayerQuery extracts predicates", () => {
  const q = parseLayerQuery("kind:image is:hidden hero");
  assert.deepStrictEqual(q.kinds, ["image"]);
  assert.strictEqual(q.hidden, true);
  assert.deepStrictEqual(q.text, ["hero"]);
});
