import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyDocumentListViewState,
  parseSort,
  parseTag,
  parseView,
} from "./document-list-url-state";

type TestDocument = Parameters<typeof applyDocumentListViewState>[0][number];

function doc(id: string, overrides: Partial<TestDocument> = {}): TestDocument {
  return {
    id,
    title: id,
    favorite: false,
    editedLabel: "Jan 1, 2026",
    workspaceName: null,
    thumbnail: null,
    excerpt: "",
    readingMinutes: 1,
    createdAtMs: 1,
    updatedAtMs: 1,
    canEdit: true,
    canManage: true,
    tags: [],
    ...overrides,
  };
}

test("parseSort keeps URL sort state client-local with a safe default", () => {
  assert.equal(parseSort("title"), "title");
  assert.equal(parseSort("unknown"), "edited");
});

test("parseView keeps URL favorite state client-local with a safe default", () => {
  assert.equal(parseView("favorites"), "favorites");
  assert.equal(parseView("all"), "all");
  assert.equal(parseView("unknown"), "all");
});

test("parseTag accepts only tags available in client list state", () => {
  const tags = [{ slug: "design" }, { slug: "planning" }];

  assert.equal(parseTag("design", tags), "design");
  assert.equal(parseTag("missing", tags), null);
  assert.equal(parseTag(null, tags), null);
});

test("applyDocumentListViewState filters tags and favorites in client view state", () => {
  const documents = [
    doc("alpha", {
      favorite: true,
      tags: [{ slug: "design", name: "Design" }],
      updatedAtMs: 3,
    }),
    doc("beta", {
      favorite: false,
      tags: [{ slug: "design", name: "Design" }],
      updatedAtMs: 2,
    }),
    doc("gamma", {
      favorite: true,
      tags: [{ slug: "planning", name: "Planning" }],
      updatedAtMs: 1,
    }),
  ];

  const visible = applyDocumentListViewState(documents, {
    sort: "edited",
    view: "favorites",
    tagSlug: "design",
  });

  assert.deepEqual(
    visible.map((document) => document.id),
    ["alpha"],
  );
});

test("applyDocumentListViewState sorts title view state without changing input", () => {
  const documents = [doc("b", { title: "Beta" }), doc("a", { title: "Alpha" })];

  const visible = applyDocumentListViewState(documents, {
    sort: "title",
    view: "all",
    tagSlug: null,
  });

  assert.deepEqual(
    visible.map((document) => document.title),
    ["Alpha", "Beta"],
  );
  assert.deepEqual(
    documents.map((document) => document.title),
    ["Beta", "Alpha"],
  );
});
