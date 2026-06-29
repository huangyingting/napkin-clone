/**
 * Style registry, resolver, and theme package tests.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isStyleRef,
  STYLE_REFS,
} from "@/lib/presentation-vnext/style-registry";
import { validateThemePackage } from "@/lib/presentation-vnext/theme-package-schema";
import { resolveNodeStyle } from "@/lib/presentation-vnext/style-resolver";
import {
  buildMinimalThemePackage,
  buildThemeBinding,
  resetBuilderCounter,
} from "@/test/builders/deck-v7";

describe("style registry", () => {
  test("STYLE_REFS contains all documented refs", () => {
    assert.ok(
      STYLE_REFS.length >= 18,
      `Expected at least 18 refs, got ${STYLE_REFS.length}`,
    );
    assert.ok(STYLE_REFS.includes("text.title"));
    assert.ok(STYLE_REFS.includes("slide.cover"));
    assert.ok(STYLE_REFS.includes("surface.card"));
    assert.ok(STYLE_REFS.includes("decoration.background"));
  });

  test("isStyleRef accepts known refs", () => {
    assert.ok(isStyleRef("text.title"));
    assert.ok(isStyleRef("slide.cover"));
    assert.ok(isStyleRef("connector.primary"));
  });

  test("isStyleRef rejects unknown refs", () => {
    assert.ok(!isStyleRef("not.a.ref"));
    assert.ok(!isStyleRef(""));
    assert.ok(!isStyleRef(42));
    assert.ok(!isStyleRef(null));
  });
});

describe("validateThemePackage", () => {
  test("accepts a valid minimal package", () => {
    const pkg = buildMinimalThemePackage();
    const result = validateThemePackage(pkg);
    assert.ok(
      result.valid,
      `Expected valid but got: ${!result.valid && result.diagnostics.map((d) => d.message).join(", ")}`,
    );
  });

  test("rejects non-object input", () => {
    const result = validateThemePackage("not-a-package");
    assert.ok(!result.valid);
  });

  test("rejects wrong schemaVersion", () => {
    const pkg = { ...buildMinimalThemePackage(), schemaVersion: 2 };
    const result = validateThemePackage(pkg);
    assert.ok(!result.valid);
    if (!result.valid) {
      assert.ok(
        result.diagnostics.some((d) => d.code === "invalid-schema-version"),
      );
    }
  });

  test("rejects missing style ref", () => {
    const pkg = buildMinimalThemePackage();
    // Remove a required ref
    const { "text.title": _, ...stylesWithout } = pkg.styles;
    const badPkg = { ...pkg, styles: stylesWithout };
    const result = validateThemePackage(badPkg);
    assert.ok(!result.valid);
    if (!result.valid) {
      assert.ok(
        result.diagnostics.some(
          (d) =>
            d.code === "missing-style-default" &&
            d.message.includes("text.title"),
        ),
      );
    }
  });

  test("rejects missing default variant", () => {
    const pkg = buildMinimalThemePackage();
    const badPkg = {
      ...pkg,
      styles: {
        ...pkg.styles,
        "text.body": { elevated: { text: { fontSizePt: 16 } } }, // no "default"
      },
    };
    const result = validateThemePackage(badPkg);
    assert.ok(!result.valid);
    if (!result.valid) {
      assert.ok(
        result.diagnostics.some(
          (d) =>
            d.code === "missing-style-default" && d.message.includes("default"),
        ),
      );
    }
  });

  test("rejects missing token ref in style", () => {
    const pkg = buildMinimalThemePackage();
    const badPkg = {
      ...pkg,
      styles: {
        ...pkg.styles,
        "text.body": {
          default: {
            text: { color: { token: "colors.nonexistent.path" } },
          },
        },
      },
    };
    const result = validateThemePackage(badPkg);
    assert.ok(!result.valid);
    if (!result.valid) {
      assert.ok(result.diagnostics.some((d) => d.code === "missing-token"));
    }
  });
});

describe("resolveNodeStyle", () => {
  test("resolves package default variant", () => {
    resetBuilderCounter();
    const pkg = buildMinimalThemePackage();
    const themeBinding = buildThemeBinding();
    const binding = { ref: "text.title" as const };
    const { style, diagnostics } = resolveNodeStyle(binding, themeBinding, pkg);
    assert.ok(style.text, "Expected text style");
    assert.equal(style.text?.fontSizePt, 36);
    assert.ok(!diagnostics.some((d) => d.severity === "error"));
  });

  test("resolves named variant when present", () => {
    resetBuilderCounter();
    const pkg = buildMinimalThemePackage();
    const themeBinding = buildThemeBinding();
    const binding = { ref: "text.title" as const, variant: "large" };
    const { style, diagnostics } = resolveNodeStyle(binding, themeBinding, pkg);
    assert.equal(style.text?.fontSizePt, 48);
    assert.ok(!diagnostics.some((d) => d.severity === "error"));
  });

  test("falls back to default when variant missing and emits warning", () => {
    resetBuilderCounter();
    const pkg = buildMinimalThemePackage();
    const themeBinding = buildThemeBinding();
    const binding = { ref: "text.title" as const, variant: "nonexistent" };
    const { style, diagnostics } = resolveNodeStyle(binding, themeBinding, pkg);
    assert.equal(style.text?.fontSizePt, 36); // default
    assert.ok(
      diagnostics.some((d) => d.code === "missing-style-variant"),
      "Expected missing-style-variant warning",
    );
  });

  test("applies local style override above theme", () => {
    resetBuilderCounter();
    const pkg = buildMinimalThemePackage();
    const themeBinding = buildThemeBinding();
    const binding = { ref: "text.title" as const };
    const localStyle = { text: { fontSizePt: 60, color: "#ff0000" } };
    const { style } = resolveNodeStyle(binding, themeBinding, pkg, localStyle);
    assert.equal(style.text?.fontSizePt, 60);
    assert.equal(style.text?.color, "#ff0000");
  });

  test("emits local-style-overrides info diagnostic", () => {
    resetBuilderCounter();
    const pkg = buildMinimalThemePackage();
    const themeBinding = buildThemeBinding();
    const binding = { ref: "text.body" as const };
    const localStyle = { text: { italic: true } };
    const { diagnostics } = resolveNodeStyle(
      binding,
      themeBinding,
      pkg,
      localStyle,
    );
    assert.ok(
      diagnostics.some((d) => d.code === "local-style-overrides"),
      "Expected local-style-overrides info diagnostic",
    );
  });

  test("errors on unknown style ref", () => {
    resetBuilderCounter();
    const pkg = buildMinimalThemePackage();
    const themeBinding = buildThemeBinding();
    // Force an invalid ref via type cast
    const binding = { ref: "not.real" as "text.title" };
    const { diagnostics } = resolveNodeStyle(binding, themeBinding, pkg);
    assert.ok(
      diagnostics.some((d) => d.code === "unknown-style-ref"),
      "Expected unknown-style-ref error",
    );
  });

  test("applies deck-level token overrides to resolved theme", async () => {
    resetBuilderCounter();
    const pkg = buildMinimalThemePackage();
    const themeBinding = buildThemeBinding({
      overrides: {
        tokens: {
          colors: {
            canvas: { fill: "#000000", text: "#ffffff", mutedText: "#aaaaaa" },
          },
        },
      },
    });
    // resolveTheme should merge token overrides
    const { resolveTheme } =
      await import("@/lib/presentation-vnext/style-resolver");
    const resolved = resolveTheme(pkg, themeBinding);
    assert.equal(resolved.tokens.colors.canvas.fill, "#000000");
    assert.equal(resolved.tokens.colors.canvas.text, "#ffffff");
    // surface tokens unchanged
    assert.equal(resolved.tokens.colors.surface.fill, "#f5f5f5");
  });

  test("applies deck-level style overrides to resolved style", () => {
    resetBuilderCounter();
    const pkg = buildMinimalThemePackage();
    const themeBinding = buildThemeBinding({
      overrides: {
        styles: {
          "text.title": {
            default: {
              text: { fontSizePt: 99, color: "#ff0000" },
            },
          },
        },
      },
    });
    const binding = { ref: "text.title" as const };
    const { style } = resolveNodeStyle(binding, themeBinding, pkg);
    assert.equal(style.text?.fontSizePt, 99);
    assert.equal(style.text?.color, "#ff0000");
  });

  test("applies deck-level variant override on top of default", () => {
    resetBuilderCounter();
    const pkg = buildMinimalThemePackage();
    const themeBinding = buildThemeBinding({
      overrides: {
        styles: {
          "text.title": {
            default: { text: { fontSizePt: 50 } },
            large: { text: { fontSizePt: 72 } },
          },
        },
      },
    });
    const binding = { ref: "text.title" as const, variant: "large" };
    const { style } = resolveNodeStyle(binding, themeBinding, pkg);
    assert.equal(style.text?.fontSizePt, 72);
  });

  test("errors on missing-token when token path resolves to non-string", () => {
    resetBuilderCounter();
    const pkg = buildMinimalThemePackage("missing-token-pkg", {
      styles: {
        ...buildMinimalThemePackage().styles,
        "text.body": {
          default: {
            text: {
              // token that resolves to an object, not a string
              color: { token: "colors" }, // "colors" resolves to the whole colors object
            },
          },
        },
      },
    });
    const themeBinding = buildThemeBinding();
    const binding = { ref: "text.body" as const };
    const { diagnostics } = resolveNodeStyle(binding, themeBinding, pkg);
    assert.ok(
      diagnostics.some((d) => d.code === "missing-token"),
      "Expected missing-token diagnostic for non-scalar token",
    );
  });
});
