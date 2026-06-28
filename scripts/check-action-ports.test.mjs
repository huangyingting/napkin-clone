import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { scanActionPorts, scanText } from "./check-action-ports.mjs";

test("action-port check: flags shared component imports from app actions", () => {
  const findings = scanText(
    "src/components/editor/example.tsx",
    'import { saveDeckJson } from "@/app/app/documents/[id]/actions";',
  );

  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "component-app-actions-import");
});

test("action-port check: flags shared component imports from app dash actions", () => {
  const findings = scanText(
    "src/components/dashboard/example.tsx",
    'import { toggleFavorite } from "@/app/app/actions";',
  );

  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "component-app-actions-import");
});

test("action-port check: accepts component imports from stable port modules", () => {
  const findings = scanText(
    "src/components/editor/example.tsx",
    'import type { DeckActionPort } from "@/lib/action-ports";',
  );

  assert.deepEqual(findings, []);
});

test("action-port check: accepts package imports in shared components", () => {
  assert.deepEqual(
    scanText("src/components/example.tsx", 'import React from "react";'),
    [],
  );
});

test("action-port check: flags shared lib imports from app route modules", () => {
  const findings = scanText(
    "src/lib/example.ts",
    'import { VisualNode } from "@/app/app/documents/[id]/visual-node";',
  );

  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "lib-app-import");
});

test("action-port check: allows route-only app components to import sibling actions", () => {
  const findings = scanText(
    "src/app/app/document-card.tsx",
    'import { renameDocument } from "./actions";',
  );

  assert.deepEqual(findings, []);
});

test("action-port check: scans repository roots and skips unsupported files", (t) => {
  const repoRoot = join(process.cwd(), ".squad", "action-port-scan-test");
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));
  mkdirSync(join(repoRoot, "src", "components", "nested"), { recursive: true });
  mkdirSync(join(repoRoot, "src", "lib"), { recursive: true });
  writeFileSync(
    join(repoRoot, "src", "components", "nested", "bad.tsx"),
    'export { save } from "@/app/app/actions";\n',
  );
  writeFileSync(
    join(repoRoot, "src", "lib", "bad.js"),
    'const route = import("@/app/app/documents/view");\n',
  );
  writeFileSync(
    join(repoRoot, "src", "components", "notes.txt"),
    'import { save } from "@/app/app/actions";\n',
  );

  const findings = scanActionPorts(repoRoot);

  assert.deepEqual(
    findings.map((finding) => finding.rule),
    ["component-app-actions-import", "lib-app-import"],
  );
});

test("action-port CLI reports pass and failure results", (t) => {
  const scriptPath = join(process.cwd(), "scripts", "check-action-ports.mjs");
  const passRoot = join(process.cwd(), ".squad", "action-port-cli-pass");
  const failRoot = join(process.cwd(), ".squad", "action-port-cli-fail");
  t.after(() => {
    rmSync(passRoot, { recursive: true, force: true });
    rmSync(failRoot, { recursive: true, force: true });
  });
  mkdirSync(join(passRoot, "src", "components"), { recursive: true });
  mkdirSync(join(failRoot, "src", "components"), { recursive: true });
  writeFileSync(
    join(passRoot, "src", "components", "ok.ts"),
    'import { port } from "@/lib/action-ports";\n',
  );
  writeFileSync(
    join(failRoot, "src", "components", "bad.ts"),
    'import { save } from "@/app/app/actions";\n',
  );

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
  assert.match(failed.stderr, /component-app-actions-import/);
  assert.match(failed.stderr, /Allowed exception/);
});
