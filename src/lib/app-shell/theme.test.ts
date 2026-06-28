import assert from "node:assert/strict";
import test from "node:test";

import {
  APP_THEME_MODES,
  type AppThemeMode,
  nextAppThemeMode,
  normalizeAppThemeMode,
  resolveAppThemeMode,
} from "./theme";

test("normalizes unknown app theme modes to system", () => {
  assert.equal(normalizeAppThemeMode("dark"), "dark");
  assert.equal(normalizeAppThemeMode("ocean"), "ocean");
  assert.equal(normalizeAppThemeMode("neon"), "system");
  assert.equal(normalizeAppThemeMode(null), "system");
});

test("resolves system theme from the current OS preference", () => {
  assert.equal(resolveAppThemeMode("system", true), "dark");
  assert.equal(resolveAppThemeMode("system", false), "light");
  assert.equal(resolveAppThemeMode("dark", false), "dark");
  assert.equal(resolveAppThemeMode("light", true), "light");
  assert.equal(resolveAppThemeMode("mint", true), "light");
});

test("cycles through every app theme mode", () => {
  let mode: AppThemeMode = "system";
  const seen: AppThemeMode[] = [];

  for (let index = 0; index < APP_THEME_MODES.length; index += 1) {
    seen.push(mode);
    mode = nextAppThemeMode(mode);
  }

  assert.deepEqual(seen, [...APP_THEME_MODES]);
  assert.equal(mode, "system");
});
