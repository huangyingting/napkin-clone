import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_TYPOGRAPHY,
  getThemeTypography,
  placeholderStyle,
  resolveBodyFont,
  resolveHeadingFont,
  THEME_TYPOGRAPHY,
} from "./theme-typography";

test("getThemeTypography returns a known theme by id", () => {
  assert.equal(getThemeTypography("amber"), THEME_TYPOGRAPHY.amber);
});

test("getThemeTypography falls back to default for an unknown theme id", () => {
  assert.equal(getThemeTypography("unknown-theme"), DEFAULT_TYPOGRAPHY);
});

test("resolveHeadingFont prefers a theme heading font when present", () => {
  assert.equal(
    resolveHeadingFont(THEME_TYPOGRAPHY.sunset),
    THEME_TYPOGRAPHY.sunset.headingFontFamily,
  );
});

test("resolveHeadingFont falls back to the body font when no heading font exists", () => {
  assert.equal(
    resolveHeadingFont(THEME_TYPOGRAPHY.ocean),
    THEME_TYPOGRAPHY.ocean.fontFamily,
  );
});

test("resolveBodyFont always returns the base font family", () => {
  assert.equal(
    resolveBodyFont(THEME_TYPOGRAPHY.grape),
    THEME_TYPOGRAPHY.grape.fontFamily,
  );
});

test("placeholderStyle maps title placeholders to the heading font and H1 scale", () => {
  assert.deepEqual(placeholderStyle("title", THEME_TYPOGRAPHY.indigo), {
    fontFamily: resolveHeadingFont(THEME_TYPOGRAPHY.indigo),
    fontSize: THEME_TYPOGRAPHY.indigo.scale.h1,
    bold: true,
    align: "center",
  });
});

test("placeholderStyle maps subtitle and footer placeholders to centered body-font tokens", () => {
  assert.deepEqual(placeholderStyle("subtitle", THEME_TYPOGRAPHY.rose), {
    fontFamily: resolveBodyFont(THEME_TYPOGRAPHY.rose),
    fontSize: THEME_TYPOGRAPHY.rose.scale.h2,
    align: "center",
  });
  assert.deepEqual(placeholderStyle("footer", THEME_TYPOGRAPHY.rose), {
    fontFamily: resolveBodyFont(THEME_TYPOGRAPHY.rose),
    fontSize: THEME_TYPOGRAPHY.rose.scale.footer,
    align: "center",
  });
});

test("placeholderStyle maps body and visual placeholders to list and H3 tokens", () => {
  assert.deepEqual(placeholderStyle("body", THEME_TYPOGRAPHY.slate), {
    fontFamily: resolveBodyFont(THEME_TYPOGRAPHY.slate),
    fontSize: THEME_TYPOGRAPHY.slate.scale.list,
    align: "left",
  });
  assert.deepEqual(placeholderStyle("visual", THEME_TYPOGRAPHY.slate), {
    fontFamily: resolveHeadingFont(THEME_TYPOGRAPHY.slate),
    fontSize: THEME_TYPOGRAPHY.slate.scale.h3,
    bold: true,
    align: "center",
  });
});
