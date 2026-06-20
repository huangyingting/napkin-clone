/**
 * Unit tests for the Brand Studio entitlement guard (issue #94).
 *
 * Pure — no DB, no network. Covers the free / Plus / Pro decision matrix and the
 * throw/allow behavior of the assert guards.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  brandEntitlementDecision,
  assertCanBrand,
  assertCanFontUpload,
  isCustomFontFamily,
  BrandEntitlementError,
  BRAND_STYLES_UPGRADE_MESSAGE,
  FONT_UPLOAD_UPGRADE_MESSAGE,
} from "@/lib/billing/brand-entitlements";
import { BRAND_WEB_FONTS } from "@/lib/brand/schema";

describe("brandEntitlementDecision", () => {
  it("free: no brand styles, no font upload", () => {
    assert.deepStrictEqual(brandEntitlementDecision("free"), {
      canBrand: false,
      canFontUpload: false,
    });
  });

  it("plus: brand styles only, no font upload", () => {
    assert.deepStrictEqual(brandEntitlementDecision("plus"), {
      canBrand: true,
      canFontUpload: false,
    });
  });

  it("pro: brand styles and font upload", () => {
    assert.deepStrictEqual(brandEntitlementDecision("pro"), {
      canBrand: true,
      canFontUpload: true,
    });
  });

  it("unknown/null plans fall back to free (no capabilities)", () => {
    for (const plan of ["enterprise", "", null, undefined]) {
      assert.deepStrictEqual(brandEntitlementDecision(plan), {
        canBrand: false,
        canFontUpload: false,
      });
    }
  });
});

describe("assertCanBrand", () => {
  it("throws a 403 BrandEntitlementError for free", () => {
    assert.throws(
      () => assertCanBrand(brandEntitlementDecision("free")),
      (err: unknown) => {
        assert.ok(err instanceof BrandEntitlementError);
        assert.strictEqual(err.feature, "brandStyles");
        assert.strictEqual(err.status, 403);
        assert.strictEqual(err.message, BRAND_STYLES_UPGRADE_MESSAGE);
        return true;
      },
    );
  });

  it("allows Plus and Pro", () => {
    assert.doesNotThrow(() => assertCanBrand(brandEntitlementDecision("plus")));
    assert.doesNotThrow(() => assertCanBrand(brandEntitlementDecision("pro")));
  });
});

describe("assertCanFontUpload", () => {
  it("throws a 403 BrandEntitlementError for free and Plus", () => {
    for (const plan of ["free", "plus"]) {
      assert.throws(
        () => assertCanFontUpload(brandEntitlementDecision(plan)),
        (err: unknown) => {
          assert.ok(err instanceof BrandEntitlementError);
          assert.strictEqual(err.feature, "fontUpload");
          assert.strictEqual(err.status, 403);
          assert.strictEqual(err.message, FONT_UPLOAD_UPGRADE_MESSAGE);
          return true;
        },
        `expected throw for ${plan}`,
      );
    }
  });

  it("allows Pro only", () => {
    assert.doesNotThrow(() =>
      assertCanFontUpload(brandEntitlementDecision("pro")),
    );
  });
});

describe("isCustomFontFamily", () => {
  it("returns false for empty / system-default values", () => {
    assert.strictEqual(isCustomFontFamily(null), false);
    assert.strictEqual(isCustomFontFamily(undefined), false);
    assert.strictEqual(isCustomFontFamily(""), false);
    assert.strictEqual(isCustomFontFamily("   "), false);
  });

  it("returns false for curated web fonts", () => {
    for (const font of BRAND_WEB_FONTS) {
      assert.strictEqual(
        isCustomFontFamily(font.cssFamily),
        false,
        `expected web font not custom: ${font.cssFamily}`,
      );
    }
  });

  it("returns true for an uploaded custom font family", () => {
    assert.strictEqual(isCustomFontFamily("'My-Brand-Font', sans-serif"), true);
    assert.strictEqual(isCustomFontFamily("ComicSans"), true);
  });
});
