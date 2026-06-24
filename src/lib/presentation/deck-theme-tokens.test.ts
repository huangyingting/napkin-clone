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
  DECK_TEXT_ROLES,
  DEFAULT_TOKEN_SET,
  deriveRoleToken,
  isBuiltInTheme,
  isDeckTextRole,
  resolveBulletDefaults,
  resolveConnectorDefaults,
  resolveImageDefaults,
  resolveRoleToken,
  resolveSlideBackground,
  resolveThemeTokens,
  resolveVisualDefaults,
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

describe("semantic text roles (#603)", () => {
  it("exposes the canonical role list", () => {
    assert.deepStrictEqual(DECK_TEXT_ROLES, [
      "h1",
      "h2",
      "h3",
      "subtitle",
      "body",
      "bullet",
      "caption",
      "footer",
      "shapeLabel",
    ]);
  });

  it("isDeckTextRole recognizes valid and rejects invalid roles", () => {
    assert.strictEqual(isDeckTextRole("h1"), true);
    assert.strictEqual(isDeckTextRole("shapeLabel"), true);
    assert.strictEqual(isDeckTextRole("title"), false);
    assert.strictEqual(isDeckTextRole(undefined), false);
    assert.strictEqual(isDeckTextRole(42), false);
  });

  it("every built-in theme yields usable role typography for every role", () => {
    for (const ts of BUILT_IN_TOKEN_SETS) {
      for (const role of DECK_TEXT_ROLES) {
        const token = resolveRoleToken(ts, role);
        assert.ok(
          typeof token.fontFamily === "string" && token.fontFamily.length > 0,
          `${ts.id}/${role} fontFamily`,
        );
        assert.ok(
          Number.isFinite(token.fontSize) && token.fontSize > 0,
          `${ts.id}/${role} fontSize`,
        );
        assert.match(
          token.color,
          /^#[0-9a-fA-F]{6,8}$/,
          `${ts.id}/${role} color`,
        );
        assert.ok(token.weight >= 100 && token.weight <= 900);
      }
    }
  });

  it("derives heading roles bold and body roles regular", () => {
    const h1 = deriveRoleToken(DEFAULT_TOKEN_SET, "h1");
    const body = deriveRoleToken(DEFAULT_TOKEN_SET, "body");
    assert.strictEqual(h1.weight, 700);
    assert.strictEqual(body.weight, 400);
  });

  it("derives heading roles from the heading font when defined", () => {
    const indigo = resolveThemeTokens("indigo");
    const h1 = deriveRoleToken(indigo, "h1");
    const body = deriveRoleToken(indigo, "body");
    assert.ok(h1.fontFamily?.startsWith("Space Grotesk"));
    assert.ok(body.fontFamily?.startsWith("Inter"));
  });

  it("footer and caption roles use the muted color", () => {
    const footer = deriveRoleToken(DEFAULT_TOKEN_SET, "footer");
    assert.strictEqual(footer.color, DEFAULT_TOKEN_SET.colors.muted);
  });

  it("resolveRoleToken merges an authored partial token over derived defaults", () => {
    const themed = {
      ...DEFAULT_TOKEN_SET,
      typography: {
        ...DEFAULT_TOKEN_SET.typography,
        roles: { h1: { fontSize: 48, color: "#ff0000", weight: 800 } },
      },
    };
    const token = resolveRoleToken(themed, "h1");
    assert.strictEqual(token.fontSize, 48);
    assert.strictEqual(token.color, "#ff0000");
    assert.strictEqual(token.weight, 800);
    // align falls back to the derived default since the authored token omits it
    assert.strictEqual(token.align, "center");
  });
});

describe("non-text default tokens (#601)", () => {
  it("resolves bullet defaults with fallbacks when absent", () => {
    const d = resolveBulletDefaults(DEFAULT_TOKEN_SET);
    assert.strictEqual(d.markerColor, DEFAULT_TOKEN_SET.colors.accent);
    assert.strictEqual(d.gapPct, 0);
    assert.strictEqual(d.indentPct, 0);
    assert.strictEqual(d.numberStyle, "decimal");
  });

  it("resolves connector defaults with fallbacks when absent", () => {
    const d = resolveConnectorDefaults(DEFAULT_TOKEN_SET);
    assert.strictEqual(d.color, DEFAULT_TOKEN_SET.colors.onBg);
    assert.strictEqual(d.width, 0.4);
    assert.strictEqual(d.dash, "solid");
    assert.strictEqual(d.startArrow, "none");
    assert.strictEqual(d.endArrow, "arrow");
  });

  it("resolves image defaults with fallbacks when absent", () => {
    const d = resolveImageDefaults(DEFAULT_TOKEN_SET);
    assert.strictEqual(d.fitMode, "contain");
    assert.strictEqual(d.radiusPct, 0);
    assert.strictEqual(d.maskShape, "none");
    assert.strictEqual(d.shadow, false);
  });

  it("resolves visual defaults with fallbacks when absent", () => {
    const d = resolveVisualDefaults(DEFAULT_TOKEN_SET);
    assert.strictEqual(d.transparentBackground, false);
    assert.strictEqual(d.styleThemeId, undefined);
  });

  it("authored non-text tokens win over fallbacks", () => {
    const themed = {
      ...DEFAULT_TOKEN_SET,
      bullet: {
        markerColor: "#ff0000",
        gapPct: 2,
        numberStyle: "lower-alpha" as const,
      },
      connector: {
        color: "#00ff00",
        width: 1.2,
        dash: "dashed" as const,
        endArrow: "filled" as const,
      },
      image: { fitMode: "cover" as const, radiusPct: 8, shadow: true },
      visual: { styleThemeId: "mono", transparentBackground: true },
    };
    assert.strictEqual(resolveBulletDefaults(themed).markerColor, "#ff0000");
    assert.strictEqual(
      resolveBulletDefaults(themed).numberStyle,
      "lower-alpha",
    );
    assert.strictEqual(resolveConnectorDefaults(themed).dash, "dashed");
    assert.strictEqual(resolveConnectorDefaults(themed).endArrow, "filled");
    assert.strictEqual(resolveImageDefaults(themed).fitMode, "cover");
    assert.strictEqual(resolveImageDefaults(themed).shadow, true);
    assert.strictEqual(resolveVisualDefaults(themed).styleThemeId, "mono");
    assert.strictEqual(
      resolveVisualDefaults(themed).transparentBackground,
      true,
    );
  });

  it("every built-in theme resolves non-text defaults without throwing", () => {
    for (const ts of BUILT_IN_TOKEN_SETS) {
      assert.ok(resolveBulletDefaults(ts).markerColor.startsWith("#"));
      assert.ok(resolveConnectorDefaults(ts).color.startsWith("#"));
      assert.ok(resolveImageDefaults(ts).fitMode.length > 0);
      assert.strictEqual(
        typeof resolveVisualDefaults(ts).transparentBackground,
        "boolean",
      );
    }
  });
});
