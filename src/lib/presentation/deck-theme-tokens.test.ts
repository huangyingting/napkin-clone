/**
 * Unit tests for deck-theme-tokens.ts helpers.
 * Run with: node --import tsx --test "src/**\/*.test.ts"
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  allThemeTokenSets,
  backgroundTreatmentToCss,
  BUILT_IN_TOKEN_SETS,
  DEFAULT_TOKEN_SET,
  isBuiltInTheme,
  resolveSlideBackground,
  resolveThemeTokens,
} from "./deck-theme-tokens";

describe("resolveThemeTokens", () => {
  it("returns the default token set for undefined", () => {
    assert.strictEqual(resolveThemeTokens(undefined), DEFAULT_TOKEN_SET);
  });

  it("returns the default token set for null", () => {
    assert.strictEqual(resolveThemeTokens(null), DEFAULT_TOKEN_SET);
  });

  it("returns the default token set for an unknown id", () => {
    assert.strictEqual(resolveThemeTokens("does-not-exist"), DEFAULT_TOKEN_SET);
  });

  it("returns the correct token set for 'indigo'", () => {
    const ts = resolveThemeTokens("indigo");
    assert.strictEqual(ts.id, "indigo");
    assert.strictEqual(ts.name, "Indigo");
  });

  it("returns the correct token set for 'ocean'", () => {
    assert.strictEqual(resolveThemeTokens("ocean").id, "ocean");
  });

  it("returns the correct token set for 'forest'", () => {
    assert.strictEqual(resolveThemeTokens("forest").id, "forest");
  });

  it("returns the correct token set for 'sunset'", () => {
    assert.strictEqual(resolveThemeTokens("sunset").id, "sunset");
  });

  it("returns the correct token set for 'grape'", () => {
    assert.strictEqual(resolveThemeTokens("grape").id, "grape");
  });

  it("returns the correct token set for 'default'", () => {
    assert.strictEqual(resolveThemeTokens("default").id, "default");
  });

  it("returns the same object reference for repeated calls with the same id", () => {
    assert.strictEqual(
      resolveThemeTokens("indigo"),
      resolveThemeTokens("indigo"),
    );
  });
});

describe("BUILT_IN_TOKEN_SETS", () => {
  it("contains exactly the six built-in theme ids", () => {
    const ids = BUILT_IN_TOKEN_SETS.map((ts) => ts.id).sort();
    assert.deepStrictEqual(ids, [
      "default",
      "forest",
      "grape",
      "indigo",
      "ocean",
      "sunset",
    ]);
  });

  it("every token set has the required color fields", () => {
    const colorFields = [
      "slideBg",
      "surface",
      "accent",
      "onBg",
      "onSurface",
      "onAccent",
      "muted",
    ] as const;
    for (const ts of BUILT_IN_TOKEN_SETS) {
      for (const field of colorFields) {
        assert.ok(
          typeof ts.colors[field] === "string" &&
            ts.colors[field].startsWith("#"),
          `${ts.id}.colors.${field} should be a hex string`,
        );
      }
    }
  });

  it("every token set has a complete FontScale", () => {
    const scaleFields = ["h1", "h2", "h3", "body", "list", "footer"] as const;
    for (const ts of BUILT_IN_TOKEN_SETS) {
      for (const field of scaleFields) {
        assert.ok(
          typeof ts.typography.scale[field] === "number" &&
            ts.typography.scale[field] > 0,
          `${ts.id}.typography.scale.${field} should be a positive number`,
        );
      }
    }
  });

  it("every token set has positive spacing values", () => {
    for (const ts of BUILT_IN_TOKEN_SETS) {
      assert.ok(ts.spacing.slidePaddingPt > 0);
      assert.ok(ts.spacing.gridUnitPt > 0);
    }
  });

  it("every token set has a valid defaultBackground", () => {
    for (const ts of BUILT_IN_TOKEN_SETS) {
      assert.ok(
        ["solid", "gradient", "image"].includes(ts.defaultBackground.type),
      );
    }
  });
});

describe("resolveSlideBackground", () => {
  const tokenSet = resolveThemeTokens("indigo");

  it("returns the token set default background when no overrides are present", () => {
    const bg = resolveSlideBackground(tokenSet);
    assert.deepStrictEqual(bg, tokenSet.defaultBackground);
  });

  it("prefers slideBackgroundImage over all other overrides", () => {
    const bg = resolveSlideBackground(tokenSet, {
      masterBackground: { type: "solid", color: "#000000" },
      slideBackground: "#ff0000",
      slideBackgroundGradient: { from: "#aaa", to: "#bbb" },
      slideBackgroundImage: "https://example.com/img.png",
    });
    assert.deepStrictEqual(bg, {
      type: "image",
      url: "https://example.com/img.png",
    });
  });

  it("prefers slideBackgroundGradient over solid and master", () => {
    const bg = resolveSlideBackground(tokenSet, {
      masterBackground: { type: "solid", color: "#000000" },
      slideBackground: "#ff0000",
      slideBackgroundGradient: { from: "#aaa", to: "#bbb", angle: 90 },
    });
    assert.deepStrictEqual(bg, {
      type: "gradient",
      from: "#aaa",
      to: "#bbb",
      angle: 90,
    });
  });

  it("prefers slideBackground over master and theme", () => {
    const bg = resolveSlideBackground(tokenSet, {
      masterBackground: { type: "solid", color: "#000000" },
      slideBackground: "#ff0000",
    });
    assert.deepStrictEqual(bg, { type: "solid", color: "#ff0000" });
  });

  it("uses master background when only masterBackground is set", () => {
    const master = { type: "gradient", from: "#111", to: "#222" } as const;
    const bg = resolveSlideBackground(tokenSet, { masterBackground: master });
    assert.deepStrictEqual(bg, master);
  });

  it("falls back to token set default when master background is absent", () => {
    const bg = resolveSlideBackground(tokenSet, {});
    assert.deepStrictEqual(bg, tokenSet.defaultBackground);
  });

  it("gradient angle defaults are preserved (undefined passthrough)", () => {
    const bg = resolveSlideBackground(tokenSet, {
      slideBackgroundGradient: { from: "#aaa", to: "#bbb" },
    });
    assert.strictEqual((bg as { angle?: number }).angle, undefined);
  });
});

describe("backgroundTreatmentToCss", () => {
  it("returns the color string for a solid background", () => {
    assert.strictEqual(
      backgroundTreatmentToCss({ type: "solid", color: "#ff0000" }),
      "#ff0000",
    );
  });

  it("builds a linear-gradient string for gradient backgrounds", () => {
    const css = backgroundTreatmentToCss({
      type: "gradient",
      from: "#aaa",
      to: "#bbb",
      angle: 45,
    });
    assert.strictEqual(css, "linear-gradient(45deg, #aaa, #bbb)");
  });

  it("uses 135deg as the default gradient angle", () => {
    const css = backgroundTreatmentToCss({
      type: "gradient",
      from: "#aaa",
      to: "#bbb",
    });
    assert.strictEqual(css, "linear-gradient(135deg, #aaa, #bbb)");
  });

  it("builds a url() background for image backgrounds", () => {
    const css = backgroundTreatmentToCss({
      type: "image",
      url: "https://example.com/bg.jpg",
    });
    assert.strictEqual(
      css,
      'url("https://example.com/bg.jpg") center / cover no-repeat',
    );
  });
});

describe("allThemeTokenSets", () => {
  it("returns a copy of the built-in sets", () => {
    const result = allThemeTokenSets();
    assert.strictEqual(result.length, BUILT_IN_TOKEN_SETS.length);
  });

  it("returns a new array each call (not the same reference)", () => {
    assert.notStrictEqual(allThemeTokenSets(), allThemeTokenSets());
  });
});

describe("isBuiltInTheme", () => {
  it("returns true for all built-in ids", () => {
    for (const ts of BUILT_IN_TOKEN_SETS) {
      assert.strictEqual(isBuiltInTheme(ts.id), true);
    }
  });

  it("returns false for an unknown id", () => {
    assert.strictEqual(isBuiltInTheme("custom-brand"), false);
  });

  it("returns false for an empty string", () => {
    assert.strictEqual(isBuiltInTheme(""), false);
  });
});
