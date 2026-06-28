import assert from "node:assert/strict";
import { test } from "node:test";

import {
  deriveTagSlug,
  firstAvailableTagSlug,
  normalizeTagName,
  TAG_NAME_MAX_LENGTH,
  tagSlugCandidate,
  tagSlugCandidates,
} from "./taxonomy";

test("normalizeTagName trims and collapses whitespace", () => {
  assert.equal(
    normalizeTagName("  Design   System\tTokens  "),
    "Design System Tokens",
  );
});

test("normalizeTagName clamps to the tag name max length", () => {
  const normalized = normalizeTagName("a".repeat(TAG_NAME_MAX_LENGTH + 10));
  assert.equal(normalized.length, TAG_NAME_MAX_LENGTH);
});

test("normalizeTagName trims after clamping", () => {
  assert.equal(
    normalizeTagName(`${"a".repeat(TAG_NAME_MAX_LENGTH - 1)}  b`),
    "a".repeat(TAG_NAME_MAX_LENGTH - 1),
  );
});

test("deriveTagSlug slugifies names and falls back deterministically", () => {
  assert.equal(deriveTagSlug("Design System"), "design-system");
  assert.equal(deriveTagSlug("!!!"), "tag");
});

test("tagSlugCandidates uses deterministic bounded suffixes", () => {
  assert.deepEqual(tagSlugCandidates("tag", 4), [
    "tag",
    "tag-2",
    "tag-3",
    "tag-4",
  ]);
});

test("tag slug candidates reject negative direct attempts and clamp invalid bounds", () => {
  assert.throws(
    () => tagSlugCandidate("tag", -1),
    /attempt index must be non-negative/,
  );
  assert.deepEqual(tagSlugCandidates("tag", Number.NaN), []);
  assert.deepEqual(tagSlugCandidates("tag", -2), []);
});

test("firstAvailableTagSlug returns the first unused deterministic candidate", () => {
  const used = new Set(["roadmap", "roadmap-2", "roadmap-3"]);
  assert.equal(firstAvailableTagSlug("roadmap", used, 5), "roadmap-4");
});

test("firstAvailableTagSlug returns null after the bounded retry space is exhausted", () => {
  const used = new Set(["tag", "tag-2", "tag-3"]);
  assert.equal(firstAvailableTagSlug("tag", used, 3), null);
});
