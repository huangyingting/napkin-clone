import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const budgets = [
  ["src/components/presentation/slide-editor.tsx", 3200],
  ["src/components/presentation/slide-stage-editor.tsx", 2100],
  ["src/components/presentation/slide-inspector.tsx", 800],
  ["src/components/presentation/slide-inspector/controls.tsx", 2800],
];

test("slide editor composition roots stay within ownership budgets", async () => {
  for (const [file, maxLines] of budgets) {
    const source = await readFile(file, "utf8");
    const lineCount = source.split("\n").length;
    assert.ok(
      lineCount <= maxLines,
      `${file} has ${lineCount} lines; keep it <= ${maxLines} by moving owned behavior into focused slide-editor, slide-stage, or slide-inspector modules.`,
    );
  }
});
