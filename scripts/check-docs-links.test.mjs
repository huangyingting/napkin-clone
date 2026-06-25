import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  extractMarkdownLinks,
  validateDocsIndex,
  validateMarkdownLinks,
} from "./check-docs-links.mjs";

test("docs links: extracts inline markdown links but ignores images", () => {
  assert.deepEqual(
    extractMarkdownLinks(
      "[Doc](./doc.md) ![Image](./image.png) [Web](https://example.com)",
    ),
    ["./doc.md", "https://example.com"],
  );
});

test("docs links: validates local files, anchors, and index reachability", (t) => {
  const repoRoot = join(process.cwd(), ".squad", "docs-link-test");
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));
  const docsRoot = join(repoRoot, "docs");
  mkdirSync(join(docsRoot, "guide"), { recursive: true });
  writeFileSync(
    join(docsRoot, "README.md"),
    "# Docs\n\n- [Guide](guide/README.md)\n",
  );
  writeFileSync(
    join(docsRoot, "guide", "README.md"),
    "# Guide\n\n- [Topic](topic.md#details)\n",
  );
  writeFileSync(join(docsRoot, "guide", "topic.md"), "# Topic\n\n## Details\n");

  assert.deepEqual(validateMarkdownLinks(repoRoot), []);
  assert.deepEqual(validateDocsIndex(repoRoot), []);
});

test("docs links: reports missing targets and unindexed markdown", (t) => {
  const repoRoot = join(process.cwd(), ".squad", "docs-link-missing-test");
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));
  const docsRoot = join(repoRoot, "docs");
  mkdirSync(join(docsRoot, "guide"), { recursive: true });
  writeFileSync(
    join(docsRoot, "README.md"),
    "# Docs\n\n- [Missing](guide/missing.md)\n",
  );
  writeFileSync(join(docsRoot, "guide", "topic.md"), "# Topic\n");

  const linkFindings = validateMarkdownLinks(repoRoot);
  assert.equal(linkFindings.length, 1);
  assert.equal(linkFindings[0].reason, "target file does not exist");

  const indexFindings = validateDocsIndex(repoRoot);
  assert.ok(
    indexFindings.some(
      (finding) =>
        finding.filePath === "docs/guide/topic.md" &&
        finding.reason === "not reachable from docs/README.md local links",
    ),
  );
});
