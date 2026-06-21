import assert from "node:assert/strict";
import { test } from "node:test";

import {
  groupForSelectionKind,
  resolveEditingSurface,
  selectionKindFromContext,
  type DockedPreference,
  type EditingSurfaceSelectionKind,
  type EditingSurfaceWidthTier,
  type ResolvedEditingSurface,
} from "./editing-surface";

// ---------------------------------------------------------------------------
// selectionKindFromContext — raw EditorContextKind → coarse selection kind.
// ---------------------------------------------------------------------------

test("selectionKindFromContext maps range → range", () => {
  assert.equal(selectionKindFromContext("range"), "range");
});

test("selectionKindFromContext maps visual → visual", () => {
  assert.equal(selectionKindFromContext("visual"), "visual");
});

test("selectionKindFromContext maps none → none", () => {
  assert.equal(selectionKindFromContext("none"), "none");
});

test("selectionKindFromContext maps empty-block → none", () => {
  assert.equal(selectionKindFromContext("empty-block"), "none");
});

test("selectionKindFromContext maps collapsed → none", () => {
  assert.equal(selectionKindFromContext("collapsed"), "none");
});

// ---------------------------------------------------------------------------
// groupForSelectionKind — selection kind → content group.
// ---------------------------------------------------------------------------

test("groupForSelectionKind maps range → text-format", () => {
  assert.equal(groupForSelectionKind("range"), "text-format");
});

test("groupForSelectionKind maps visual → visual-edit", () => {
  assert.equal(groupForSelectionKind("visual"), "visual-edit");
});

test("groupForSelectionKind maps none → overall", () => {
  assert.equal(groupForSelectionKind("none"), "overall");
});

// ---------------------------------------------------------------------------
// resolveEditingSurface — the full 2 × 2 × 3 × 2 = 24-row decision matrix.
// One explicit assertion per row, in the exact order of the design contract.
// ---------------------------------------------------------------------------

function expectSurface(
  pointerFine: boolean,
  widthTier: EditingSurfaceWidthTier,
  selectionKind: EditingSurfaceSelectionKind,
  dockedPreference: DockedPreference,
  expected: ResolvedEditingSurface,
) {
  assert.deepEqual(
    resolveEditingSurface({
      pointerFine,
      widthTier,
      selectionKind,
      dockedPreference,
    }),
    expected,
  );
}

// --- pointerFine = true, dockedPreference = off -----------------------------

test("T,>=lg,range,off → float(text-format)", () => {
  expectSurface(true, ">=lg", "range", "off", {
    mode: "float",
    group: "text-format",
  });
});

test("T,>=lg,visual,off → float(visual-edit)", () => {
  expectSurface(true, ">=lg", "visual", "off", {
    mode: "float",
    group: "visual-edit",
  });
});

test("T,>=lg,none,off → docked(overall)", () => {
  expectSurface(true, ">=lg", "none", "off", {
    mode: "docked",
    group: "overall",
  });
});

// --- pointerFine = true, dockedPreference = on ------------------------------

test("T,>=lg,range,on → docked(text-format)", () => {
  expectSurface(true, ">=lg", "range", "on", {
    mode: "docked",
    group: "text-format",
  });
});

test("T,>=lg,visual,on → docked(visual-edit)", () => {
  expectSurface(true, ">=lg", "visual", "on", {
    mode: "docked",
    group: "visual-edit",
  });
});

test("T,>=lg,none,on → docked(overall)", () => {
  expectSurface(true, ">=lg", "none", "on", {
    mode: "docked",
    group: "overall",
  });
});

// --- pointerFine = true, <lg, dockedPreference = off ------------------------

test("T,<lg,range,off → float(text-format)", () => {
  expectSurface(true, "<lg", "range", "off", {
    mode: "float",
    group: "text-format",
  });
});

test("T,<lg,visual,off → float(visual-edit)", () => {
  expectSurface(true, "<lg", "visual", "off", {
    mode: "float",
    group: "visual-edit",
  });
});

test("T,<lg,none,off → none(overall)", () => {
  expectSurface(true, "<lg", "none", "off", {
    mode: "none",
    group: "overall",
  });
});

// --- pointerFine = true, <lg, dockedPreference = on (R2: preference ignored) -

test("T,<lg,range,on → float(text-format)", () => {
  expectSurface(true, "<lg", "range", "on", {
    mode: "float",
    group: "text-format",
  });
});

test("T,<lg,visual,on → float(visual-edit)", () => {
  expectSurface(true, "<lg", "visual", "on", {
    mode: "float",
    group: "visual-edit",
  });
});

test("T,<lg,none,on → none(overall)", () => {
  expectSurface(true, "<lg", "none", "on", {
    mode: "none",
    group: "overall",
  });
});

// --- pointerFine = false, >=lg, dockedPreference = off ----------------------

test("F,>=lg,range,off → sheet(text-format)", () => {
  expectSurface(false, ">=lg", "range", "off", {
    mode: "sheet",
    group: "text-format",
  });
});

test("F,>=lg,visual,off → sheet(visual-edit)", () => {
  expectSurface(false, ">=lg", "visual", "off", {
    mode: "sheet",
    group: "visual-edit",
  });
});

test("F,>=lg,none,off → docked(overall)", () => {
  expectSurface(false, ">=lg", "none", "off", {
    mode: "docked",
    group: "overall",
  });
});

// --- pointerFine = false, >=lg, dockedPreference = on -----------------------

test("F,>=lg,range,on → docked(text-format)", () => {
  expectSurface(false, ">=lg", "range", "on", {
    mode: "docked",
    group: "text-format",
  });
});

test("F,>=lg,visual,on → docked(visual-edit)", () => {
  expectSurface(false, ">=lg", "visual", "on", {
    mode: "docked",
    group: "visual-edit",
  });
});

test("F,>=lg,none,on → docked(overall)", () => {
  expectSurface(false, ">=lg", "none", "on", {
    mode: "docked",
    group: "overall",
  });
});

// --- pointerFine = false, <lg, dockedPreference = off -----------------------

test("F,<lg,range,off → sheet(text-format)", () => {
  expectSurface(false, "<lg", "range", "off", {
    mode: "sheet",
    group: "text-format",
  });
});

test("F,<lg,visual,off → sheet(visual-edit)", () => {
  expectSurface(false, "<lg", "visual", "off", {
    mode: "sheet",
    group: "visual-edit",
  });
});

test("F,<lg,none,off → none(overall)", () => {
  expectSurface(false, "<lg", "none", "off", {
    mode: "none",
    group: "overall",
  });
});

// --- pointerFine = false, <lg, dockedPreference = on (R2: preference ignored) -

test("F,<lg,range,on → sheet(text-format)", () => {
  expectSurface(false, "<lg", "range", "on", {
    mode: "sheet",
    group: "text-format",
  });
});

test("F,<lg,visual,on → sheet(visual-edit)", () => {
  expectSurface(false, "<lg", "visual", "on", {
    mode: "sheet",
    group: "visual-edit",
  });
});

test("F,<lg,none,on → none(overall)", () => {
  expectSurface(false, "<lg", "none", "on", {
    mode: "none",
    group: "overall",
  });
});

// ---------------------------------------------------------------------------
// Totality — the resolver returns a value for every one of the 24 inputs and
// the group is always selection-derived (even when mode === "none").
// ---------------------------------------------------------------------------

test("resolveEditingSurface is total over all 24 input combinations", () => {
  const pointerFines = [true, false];
  const widthTiers: EditingSurfaceWidthTier[] = [">=lg", "<lg"];
  const selectionKinds: EditingSurfaceSelectionKind[] = [
    "range",
    "visual",
    "none",
  ];
  const dockedPrefs: DockedPreference[] = ["on", "off"];

  let count = 0;
  for (const pointerFine of pointerFines) {
    for (const widthTier of widthTiers) {
      for (const selectionKind of selectionKinds) {
        for (const dockedPreference of dockedPrefs) {
          const result = resolveEditingSurface({
            pointerFine,
            widthTier,
            selectionKind,
            dockedPreference,
          });
          // Mode is always one of the four valid modes.
          assert.ok(["float", "sheet", "docked", "none"].includes(result.mode));
          // Group is always selection-derived, regardless of mode.
          assert.equal(result.group, groupForSelectionKind(selectionKind));
          count += 1;
        }
      }
    }
  }
  assert.equal(count, 24);
});

// ---------------------------------------------------------------------------
// Surface-visibility regression rule (epic #87, item 5): a "collapse to none"
// helper for the wiring — when the registry yields no tools for the resolved
// group, the surface collapses to mode "none" (but the group is preserved).
// This pins the contract the wiring relies on (see use-editing-surface.ts).
// ---------------------------------------------------------------------------

test("default-off behaviour matches today: fine pointer + range → float", () => {
  // The canonical 'today' float case for the inline text toolbar.
  expectSurface(true, ">=lg", "range", "off", {
    mode: "float",
    group: "text-format",
  });
  expectSurface(true, "<lg", "range", "off", {
    mode: "float",
    group: "text-format",
  });
});

test("default-off behaviour matches today: coarse pointer + selection → sheet", () => {
  expectSurface(false, ">=lg", "range", "off", {
    mode: "sheet",
    group: "text-format",
  });
  expectSurface(false, "<lg", "visual", "off", {
    mode: "sheet",
    group: "visual-edit",
  });
});
