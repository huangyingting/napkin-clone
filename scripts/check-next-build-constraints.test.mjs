import assert from "node:assert/strict";
import test from "node:test";

import { scanText } from "./check-next-build-constraints.mjs";

test("next build guard flags imported proxy matcher config", () => {
  const findings = scanText(
    "src/proxy.ts",
    'import { routeProtectionPolicy } from "@/lib/auth/route-protection-policy";\nexport const config = { matcher: routeProtectionPolicy.proxy.matcher };\n',
  );

  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "next-nonliteral-config");
});

test("next build guard allows literal proxy matcher config", () => {
  const findings = scanText(
    "src/proxy.ts",
    'export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"] };\n',
  );

  assert.deepEqual(findings, []);
});

test("next build guard flags nonliteral runtime declarations", () => {
  const findings = scanText(
    "src/app/api/example/route.ts",
    'import { runtime } from "./config";\nexport const runtime = runtime;\n',
  );

  assert.equal(findings[0].rule, "next-nonliteral-config");
});

test("next build guard flags use-server type and value re-exports", () => {
  const findings = scanText(
    "src/app/app/example/actions.ts",
    '"use server";\nexport type Result = { ok: boolean };\nexport { helper } from "@/lib/helper";\nexport async function save() {}\n',
  );

  assert.deepEqual(
    findings.map((finding) => finding.rule),
    ["use-server-non-action-export", "use-server-non-action-export"],
  );
});
