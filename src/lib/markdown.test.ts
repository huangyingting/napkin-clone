import assert from "node:assert/strict";
import test from "node:test";

import { blockText, parseMarkdown } from "@/lib/content";

test("parseMarkdown returns stable block ids for unchanged content", () => {
  const source = [
    "# Strategy",
    "",
    "Map the launch sequence clearly.",
    "",
    "- Outline milestones",
    "- Validate messaging",
    "",
    "Close with the next step.",
  ].join("\n");

  const first = parseMarkdown(source);
  const second = parseMarkdown(source);

  assert.deepEqual(
    second.map((block) => block.id),
    first.map((block) => block.id),
  );
});

test("editing one block changes only that block's id", () => {
  const original = [
    "# Strategy",
    "",
    "Map the launch sequence clearly.",
    "",
    "- Outline milestones",
    "- Validate messaging",
    "",
    "Close with the next step.",
  ].join("\n");
  const edited = [
    "# Strategy",
    "",
    "Map the launch sequence clearly.",
    "",
    "- Outline milestones",
    "- Validate audience fit",
    "",
    "Close with the next step.",
  ].join("\n");

  const before = parseMarkdown(original);
  const after = parseMarkdown(edited);

  assert.equal(before.length, after.length);
  assert.equal(before[0]?.id, after[0]?.id);
  assert.equal(before[1]?.id, after[1]?.id);
  assert.notEqual(before[2]?.id, after[2]?.id);
  assert.equal(before[3]?.id, after[3]?.id);
});

test("blockText returns a heading's text", () => {
  const [heading] = parseMarkdown("# Strategy");
  assert.equal(heading?.kind, "heading");
  assert.equal(blockText(heading!), "Strategy");
});

test("blockText returns a paragraph's text", () => {
  const [paragraph] = parseMarkdown("Map the launch sequence clearly.");
  assert.equal(paragraph?.kind, "paragraph");
  assert.equal(blockText(paragraph!), "Map the launch sequence clearly.");
});

test("blockText rejoins bullets as Markdown list lines", () => {
  const [bullets] = parseMarkdown("- Outline milestones\n- Validate messaging");
  assert.equal(bullets?.kind, "bullets");
  assert.equal(
    blockText(bullets!),
    "- Outline milestones\n- Validate messaging",
  );
});
