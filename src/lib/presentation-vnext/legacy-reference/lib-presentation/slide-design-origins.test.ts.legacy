import assert from "node:assert/strict";
import test from "node:test";

import type { Deck, Slide } from "./deck";
import { inspectSlideDesignOrigins } from "./slide-design-origins";

function deck(overrides: Partial<Deck> = {}): Deck {
  return {
    schemaVersion: 6,
    canvas: { format: "16:9" },
    design: { themeId: "indigo" },
    defaultMasterId: "master-default",
    masters: [
      {
        id: "master-default",
        name: "Default",
        background: { type: "solid", color: { value: "#eeeeee" } },
        elements: [],
      },
      {
        id: "master-alt",
        name: "Alt",
        background: { type: "solid", color: { value: "#dddddd" } },
        elements: [],
      },
    ],
    slides: [],
    ...overrides,
  } as Deck;
}

function slide(overrides: Partial<Slide> = {}): Slide {
  return {
    id: "slide-1",
    index: 0,
    title: "Slide",
    notes: "",
    elements: [],
    ...overrides,
  } as Slide;
}

test("inspectSlideDesignOrigins reports theme and default master origins", () => {
  const report = inspectSlideDesignOrigins(deck(), slide());
  assert.equal(report.themeId.layer, "theme");
  assert.equal(report.themeId.value, "indigo");
  assert.equal(report.masterId?.layer, "deck");
  assert.equal(report.masterId?.value, "master-default");
  assert.equal(report.background.layer, "master");
  assert.equal(report.background.sourceId, "master-default");
  assert.equal(report.accent.layer, "theme");
});

test("inspectSlideDesignOrigins reports slide overrides", () => {
  const report = inspectSlideDesignOrigins(
    deck(),
    slide({
      masterId: "master-alt",
      designOverrides: {
        background: { type: "solid", color: { value: "#ffffff" } },
        accent: { value: "#ff00aa" },
      },
    }),
  );
  assert.equal(report.masterId?.layer, "deck");
  assert.equal(report.masterId?.value, "master-default");
  assert.equal(report.background.layer, "slide");
  assert.deepEqual(report.background.value, {
    type: "solid",
    color: "#ffffff",
  });
  assert.equal(report.accent.layer, "slide");
  assert.equal(report.accent.value, "#ff00aa");
});

test("inspectSlideDesignOrigins reports theme background when no master exists", () => {
  const report = inspectSlideDesignOrigins(
    deck({ masters: [], defaultMasterId: "" }),
    slide(),
  );
  assert.equal(report.masterId, undefined);
  assert.equal(report.background.layer, "theme");
});
