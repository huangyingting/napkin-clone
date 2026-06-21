import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveEditingSurface } from "./editing-surface";
import {
  DOCKED_PREFERENCE_STORAGE_KEY,
  parseStoredDockedPreference,
  toggleDockedPreference,
} from "./docked-preference-storage";

// ---------------------------------------------------------------------------
// DOCKED_PREFERENCE_STORAGE_KEY — pinned so persistence stays compatible.
// ---------------------------------------------------------------------------

test("storage key is the exact namespaced value", () => {
  assert.equal(
    DOCKED_PREFERENCE_STORAGE_KEY,
    "textiq:editing.dockedPreference",
  );
});

// ---------------------------------------------------------------------------
// parseStoredDockedPreference — raw localStorage string → DockedPreference.
// ---------------------------------------------------------------------------

test("parseStoredDockedPreference maps null → off (SSR / unset default)", () => {
  assert.equal(parseStoredDockedPreference(null), "off");
});

test('parseStoredDockedPreference maps "on" → on', () => {
  assert.equal(parseStoredDockedPreference("on"), "on");
});

test('parseStoredDockedPreference maps "off" → off', () => {
  assert.equal(parseStoredDockedPreference("off"), "off");
});

test("parseStoredDockedPreference maps garbage → off", () => {
  assert.equal(parseStoredDockedPreference("ON"), "off");
  assert.equal(parseStoredDockedPreference("true"), "off");
  assert.equal(parseStoredDockedPreference(""), "off");
  assert.equal(parseStoredDockedPreference("1"), "off");
  assert.equal(parseStoredDockedPreference("docked"), "off");
});

// ---------------------------------------------------------------------------
// toggleDockedPreference — pure on↔off reducer.
// ---------------------------------------------------------------------------

test("toggleDockedPreference flips off → on", () => {
  assert.equal(toggleDockedPreference("off"), "on");
});

test("toggleDockedPreference flips on → off", () => {
  assert.equal(toggleDockedPreference("on"), "off");
});

test("toggleDockedPreference is its own inverse", () => {
  assert.equal(toggleDockedPreference(toggleDockedPreference("on")), "on");
  assert.equal(toggleDockedPreference(toggleDockedPreference("off")), "off");
});

// ---------------------------------------------------------------------------
// Integration with the resolver: turning the preference "on" must produce a
// docked surface at ≥ lg for every selection kind, and remain a no-op below lg.
// (The full 24-row matrix lives in editing-surface.test.ts; these are focused
// assertions that the toggle feeds the resolver correctly.)
// ---------------------------------------------------------------------------

test('dockedPreference "on" forces docked at ≥ lg for all selection kinds', () => {
  for (const selectionKind of ["range", "visual", "none"] as const) {
    const resolved = resolveEditingSurface({
      pointerFine: true,
      widthTier: ">=lg",
      selectionKind,
      dockedPreference: "on",
    });
    assert.equal(resolved.mode, "docked");
  }
});

test('dockedPreference "on" is a no-op below lg (falls back to float/sheet/none)', () => {
  assert.equal(
    resolveEditingSurface({
      pointerFine: true,
      widthTier: "<lg",
      selectionKind: "range",
      dockedPreference: "on",
    }).mode,
    "float",
  );
  assert.equal(
    resolveEditingSurface({
      pointerFine: false,
      widthTier: "<lg",
      selectionKind: "visual",
      dockedPreference: "on",
    }).mode,
    "sheet",
  );
  assert.equal(
    resolveEditingSurface({
      pointerFine: true,
      widthTier: "<lg",
      selectionKind: "none",
      dockedPreference: "on",
    }).mode,
    "none",
  );
});
