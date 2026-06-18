import assert from "node:assert/strict";
import test from "node:test";

import { parseMarkdown } from "@/lib/markdown";
import { VISUAL_KINDS } from "@/lib/visual/schema";
import {
  BLANK_TEMPLATE_ID,
  TEMPLATE_CATALOG,
  getTemplate,
  getTemplateOrBlank,
  type TemplateEntry,
} from "@/lib/templates/catalog";

test("catalog has at least four templates including the expected set", () => {
  assert.ok(TEMPLATE_CATALOG.length >= 4);
  const names = TEMPLATE_CATALOG.map((entry) => entry.name);
  assert.ok(names.includes("Blank"));
  assert.ok(names.includes("Process / Flowchart"));
  assert.ok(names.includes("Mind Map"));
  assert.ok(names.includes("Comparison"));
});

test("entries are well-formed with unique ids", () => {
  const seen = new Set<string>();
  for (const entry of TEMPLATE_CATALOG) {
    assert.equal(typeof entry.id, "string");
    assert.ok(entry.id.length > 0);
    assert.equal(typeof entry.name, "string");
    assert.ok(entry.name.length > 0);
    assert.equal(typeof entry.description, "string");
    assert.ok(entry.description.length > 0);
    assert.equal(typeof entry.content, "string");
    assert.ok(!seen.has(entry.id), `duplicate template id: ${entry.id}`);
    seen.add(entry.id);
  }
});

test("every template content parses to at least one block", () => {
  for (const entry of TEMPLATE_CATALOG) {
    const blocks = parseMarkdown(entry.content);
    assert.ok(
      blocks.length >= 1,
      `template ${entry.id} parsed to ${blocks.length} blocks`,
    );
  }
});

test("any visualKind is a valid VisualKind", () => {
  for (const entry of TEMPLATE_CATALOG) {
    if (entry.visualKind !== undefined) {
      assert.ok(
        (VISUAL_KINDS as readonly string[]).includes(entry.visualKind),
        `template ${entry.id} has invalid visualKind: ${entry.visualKind}`,
      );
    }
  }
});

test("a Blank template exists with the documented id and no visualKind", () => {
  const blank = getTemplate(BLANK_TEMPLATE_ID);
  assert.ok(blank);
  assert.equal(blank?.name, "Blank");
  assert.equal(blank?.visualKind, undefined);
});

test("getTemplate returns the matching entry or undefined", () => {
  const entry: TemplateEntry | undefined = getTemplate("flowchart");
  assert.equal(entry?.visualKind, "flowchart");
  assert.equal(getTemplate("not-a-real-template"), undefined);
});

test("getTemplateOrBlank falls back to Blank for unknown/missing ids", () => {
  assert.equal(getTemplateOrBlank("flowchart").id, "flowchart");
  assert.equal(getTemplateOrBlank("not-a-real-template").id, BLANK_TEMPLATE_ID);
  assert.equal(getTemplateOrBlank(null).id, BLANK_TEMPLATE_ID);
  assert.equal(getTemplateOrBlank(undefined).id, BLANK_TEMPLATE_ID);
});
