import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
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

test("docs links: handles directory, extensionless, external, and non-markdown links", (t) => {
  const repoRoot = join(process.cwd(), ".squad", "docs-link-shapes-test");
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));
  const docsRoot = join(repoRoot, "docs");
  mkdirSync(join(docsRoot, "guide"), { recursive: true });
  mkdirSync(join(repoRoot, "src"), { recursive: true });
  writeFileSync(join(repoRoot, "src", "note.md"), "# Outside docs\n");
  writeFileSync(
    join(docsRoot, "README.md"),
    [
      "# Docs",
      "[Guide dir](guide/)",
      "[Guide extensionless](guide/topic)",
      "[External](https://example.com)",
      "[Mail](mailto:test@example.com)",
      "[Phone](tel:5551234)",
      "[Asset](guide/image.png)",
      "[Outside](../src/note.md)",
    ].join("\n"),
  );
  writeFileSync(
    join(docsRoot, "guide", "README.md"),
    "# Guide\n\n[Topic](topic.md#details)\n",
  );
  writeFileSync(
    join(docsRoot, "guide", "topic.md"),
    "# Topic\n\n## Details!\n",
  );

  assert.deepEqual(validateMarkdownLinks(repoRoot), []);
  assert.deepEqual(validateDocsIndex(repoRoot), []);
});

test("docs links: reports missing anchors and directories without README indexes", (t) => {
  const repoRoot = join(process.cwd(), ".squad", "docs-link-anchor-test");
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));
  const docsRoot = join(repoRoot, "docs");
  mkdirSync(join(docsRoot, "guide"), { recursive: true });
  writeFileSync(
    join(docsRoot, "README.md"),
    "# Docs\n\n[Topic](guide/topic.md#missing-anchor)\n",
  );
  writeFileSync(join(docsRoot, "guide", "topic.md"), "# Topic\n");

  assert.deepEqual(validateMarkdownLinks(repoRoot), [
    {
      filePath: "docs/README.md",
      link: "guide/topic.md#missing-anchor",
      reason: "target anchor #missing-anchor does not exist",
    },
  ]);
  assert.ok(
    validateDocsIndex(repoRoot).some(
      (finding) =>
        finding.filePath === "docs/guide" &&
        finding.reason ===
          "directory contains markdown files but has no README.md index",
    ),
  );
});

test("docs links CLI reports pass and failure results", (t) => {
  const scriptPath = join(process.cwd(), "scripts", "check-docs-links.mjs");
  const passRoot = join(process.cwd(), ".squad", "docs-links-cli-pass");
  const failRoot = join(process.cwd(), ".squad", "docs-links-cli-fail");
  t.after(() => {
    rmSync(passRoot, { recursive: true, force: true });
    rmSync(failRoot, { recursive: true, force: true });
  });
  mkdirSync(join(passRoot, "docs"), { recursive: true });
  mkdirSync(join(failRoot, "docs", "guide"), { recursive: true });
  writeFileSync(join(passRoot, "docs", "README.md"), "# Docs\n");
  writeFileSync(
    join(failRoot, "docs", "README.md"),
    "# Docs\n\n[Missing](guide/missing.md)\n",
  );
  writeFileSync(join(failRoot, "docs", "guide", "topic.md"), "# Topic\n");

  const passed = spawnSync(process.execPath, [scriptPath], {
    cwd: passRoot,
    encoding: "utf8",
  });
  assert.equal(passed.status, 0);
  assert.match(passed.stdout, /passed/);

  const failed = spawnSync(process.execPath, [scriptPath], {
    cwd: failRoot,
    encoding: "utf8",
  });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /Markdown link check failed/);
  assert.match(failed.stderr, /Docs index check failed/);
});
