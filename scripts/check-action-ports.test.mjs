import assert from "node:assert/strict";
import test from "node:test";

import { scanText } from "./check-action-ports.mjs";

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
