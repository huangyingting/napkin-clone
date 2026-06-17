import assert from "node:assert/strict";
import test from "node:test";

import {
  ICON_CATALOG,
  getIconEntry,
  isKnownIcon,
  searchIcons,
  type IconEntry,
} from "@/lib/icons/catalog";

test("catalog entries are well-formed and uniquely named", () => {
  assert.ok(ICON_CATALOG.length > 0);
  const seen = new Set<string>();
  for (const entry of ICON_CATALOG) {
    assert.equal(typeof entry.name, "string");
    assert.ok(entry.name.length > 0);
    assert.ok(Array.isArray(entry.keywords));
    assert.ok(entry.keywords.length > 0);
    assert.ok(!seen.has(entry.name), `duplicate icon name: ${entry.name}`);
    seen.add(entry.name);
  }
});

test("exact name match ranks the icon first", () => {
  const results = searchIcons("Lightbulb");
  assert.ok(results.length > 0);
  assert.equal(results[0].name, "Lightbulb");
});

test("name search is case-insensitive", () => {
  const lower = searchIcons("database");
  const upper = searchIcons("DATABASE");
  assert.equal(lower[0]?.name, "Database");
  assert.deepEqual(
    lower.map((entry) => entry.name),
    upper.map((entry) => entry.name),
  );
});

test("partial name prefixes still match", () => {
  const results = searchIcons("light");
  assert.ok(results.some((entry) => entry.name === "Lightbulb"));
});

test("keyword match returns icons whose name does not contain the query", () => {
  const results = searchIcons("idea");
  const names = results.map((entry) => entry.name);
  assert.ok(names.includes("Lightbulb"));
  // "idea" is a keyword of Lightbulb but not part of its name.
  assert.ok(!"Lightbulb".toLowerCase().includes("idea"));
});

test("keyword match surfaces multiple relevant icons", () => {
  const results = searchIcons("money");
  const names = results.map((entry) => entry.name);
  assert.ok(names.includes("DollarSign"));
  assert.ok(names.includes("Wallet"));
});

test("empty query returns a curated, non-empty default set", () => {
  const results = searchIcons("");
  assert.ok(results.length > 0);
  for (const entry of results) {
    assert.ok(isKnownIcon(entry.name));
  }
});

test("whitespace-only query behaves like an empty query", () => {
  const blank = searchIcons("   ");
  const empty = searchIcons("");
  assert.deepEqual(
    blank.map((entry) => entry.name),
    empty.map((entry) => entry.name),
  );
});

test("an unmatched query returns an empty array", () => {
  assert.deepEqual(searchIcons("zzzznotarealicon"), []);
});

test("limit caps the number of results", () => {
  const limited = searchIcons("a", 3);
  assert.ok(limited.length <= 3);

  const defaults = searchIcons("", 5);
  assert.ok(defaults.length <= 5);

  assert.deepEqual(searchIcons("idea", 0), []);
});

test("results are deterministic across calls", () => {
  const a = searchIcons("chart");
  const b = searchIcons("chart");
  assert.deepEqual(
    a.map((entry: IconEntry) => entry.name),
    b.map((entry: IconEntry) => entry.name),
  );
});

test("isKnownIcon / getIconEntry agree with the catalog", () => {
  assert.equal(isKnownIcon("Lightbulb"), true);
  assert.equal(isKnownIcon("NotAnIcon"), false);
  assert.equal(isKnownIcon(null), false);
  assert.equal(isKnownIcon(undefined), false);
  assert.equal(getIconEntry("Lightbulb")?.name, "Lightbulb");
  assert.equal(getIconEntry("NotAnIcon"), undefined);
});
