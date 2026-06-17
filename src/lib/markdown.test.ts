import assert from "node:assert/strict";
import test from "node:test";

import { parseMarkdown } from "@/lib/markdown";

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
