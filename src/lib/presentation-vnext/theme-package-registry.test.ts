import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getThemePackageV7,
  listThemePackagesV7,
  resolveThemePackageForDeck,
} from "./theme-package-registry";

test("getThemePackageV7 resolves generated v7 theme packages by id", () => {
  assert.equal(getThemePackageV7("ocean")?.id, "ocean");
  assert.equal(getThemePackageV7("clarity")?.id, "clarity");
});

test("resolveThemePackageForDeck returns the requested v7 package", () => {
  const result = resolveThemePackageForDeck({
    theme: { packageId: "ocean" },
  });

  assert.equal(result.package.id, "ocean");
  assert.equal(result.fallback, false);
  assert.deepEqual(result.diagnostics, []);
});

test("resolveThemePackageForDeck falls back to neutral with a diagnostic for unknown packages", () => {
  const result = resolveThemePackageForDeck({
    theme: { packageId: "missing-package" },
  });

  assert.equal(result.package.id, "neutral");
  assert.equal(result.fallback, true);
  assert.equal(result.diagnostics[0]?.code, "unknown-theme-package");
  assert.equal(result.diagnostics[0]?.path, "theme.packageId");
});

test("listThemePackagesV7 includes neutral and generated runtime packages", () => {
  const ids = listThemePackagesV7().map((themePackage) => themePackage.id);

  assert.ok(ids.includes("neutral"));
  assert.ok(ids.includes("ocean"));
  assert.ok(ids.includes("pulse"));
});

test("listThemePackagesV7 returns a stable memoized list", () => {
  const first = listThemePackagesV7();
  const second = listThemePackagesV7();

  assert.equal(first, second);
});
