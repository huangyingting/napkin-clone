import assert from "node:assert/strict";
import { test, describe } from "node:test";

import {
  resolveThemePackage,
  registeredThemePackageIds,
} from "./theme-package-registry";
import { NEUTRAL_THEME_PACKAGE } from "./neutral-theme-package";

// ---------------------------------------------------------------------------
// resolveThemePackage — known packages
// ---------------------------------------------------------------------------

describe("resolveThemePackage — known packages", () => {
  test("resolves 'neutral' to NEUTRAL_THEME_PACKAGE with no diagnostic", () => {
    const result = resolveThemePackage("neutral");
    assert.equal(result.pkg, NEUTRAL_THEME_PACKAGE);
    assert.equal(result.diagnostic, undefined);
  });

  test("resolved package is a valid ThemePackageV1 with schemaVersion 1", () => {
    const { pkg } = resolveThemePackage("neutral");
    assert.equal(pkg.schemaVersion, 1);
    assert.ok(typeof pkg.id === "string" && pkg.id.length > 0);
    assert.ok(typeof pkg.tokens === "object" && pkg.tokens !== null);
    assert.ok(typeof pkg.styles === "object" && pkg.styles !== null);
  });
});

// ---------------------------------------------------------------------------
// resolveThemePackage — unknown packages
// ---------------------------------------------------------------------------

describe("resolveThemePackage — unknown packages", () => {
  test("returns neutral fallback with a diagnostic for unknown id", () => {
    const result = resolveThemePackage("my-unknown-theme");
    assert.equal(result.pkg, NEUTRAL_THEME_PACKAGE);
    assert.ok(typeof result.diagnostic === "string");
    assert.ok(
      result.diagnostic.includes("my-unknown-theme"),
      "diagnostic should mention the unknown id",
    );
  });

  test("returns neutral fallback with a diagnostic for empty string id", () => {
    const result = resolveThemePackage("");
    assert.equal(result.pkg, NEUTRAL_THEME_PACKAGE);
    assert.ok(typeof result.diagnostic === "string");
  });

  test("diagnostic message mentions 'neutral fallback'", () => {
    const result = resolveThemePackage("corporate-blue");
    assert.ok(result.diagnostic!.toLowerCase().includes("neutral"));
  });
});

// ---------------------------------------------------------------------------
// registeredThemePackageIds
// ---------------------------------------------------------------------------

describe("registeredThemePackageIds", () => {
  test("includes 'neutral'", () => {
    const ids = registeredThemePackageIds();
    assert.ok(ids.includes("neutral"));
  });

  test("returns an array of strings", () => {
    const ids = registeredThemePackageIds();
    assert.ok(Array.isArray(ids));
    assert.ok(ids.every((id) => typeof id === "string"));
  });
});
