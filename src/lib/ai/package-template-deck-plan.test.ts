import assert from "node:assert/strict";
import { test } from "node:test";

import { repairPackageDeckPlan } from "./package-template-deck-plan";

const inventory = [{ id: "vis-1", title: "Chart", type: "chart", summary: "" }];

test("repairPackageDeckPlan rejects non-plans and repairs invalid kinds", () => {
  assert.equal(repairPackageDeckPlan(null, inventory), null);
  const plan = repairPackageDeckPlan(
    {
      schemaVersion: 1,
      slides: [{ title: "Intro", templateKind: "not-real", slots: {} }],
    },
    inventory,
  );
  assert.ok(plan);
  assert.equal(plan.slides[0].templateKind, "content");
});

test("repairPackageDeckPlan validates visual ids and clamps table slots", () => {
  const plan = repairPackageDeckPlan(
    {
      schemaVersion: 1,
      language: "en",
      slides: [
        {
          title: "Evidence",
          templateKind: "evidence",
          slots: {
            title: "Evidence",
            visualId: "invented",
            table: {
              caption: "Proof",
              columns: ["A", "B", "C", "D", "E"],
              rows: [
                ["1", "2", "3", "4", "5"],
                ["6", "7", "8", "9", "10"],
                ["11", "12", "13", "14", "15"],
                ["16", "17", "18", "19", "20"],
                ["21", "22", "23", "24", "25"],
                ["26", "27", "28", "29", "30"],
                ["31", "32", "33", "34", "35"],
              ],
            },
          },
        },
      ],
    },
    inventory,
  );

  assert.ok(plan);
  const slide = plan.slides[0];
  assert.equal(slide.slots.visualId, undefined);
  assert.equal(slide.slots.table?.columns.length, 4);
  assert.equal(slide.slots.table?.rows.length, 6);
  assert.match(slide.notes ?? "", /Table omitted columns/);
  assert.match(slide.notes ?? "", /Table omitted rows/);
  assert.equal(plan.selectedKindCounts.evidence, 1);
});

test("repairPackageDeckPlan keeps known visual ids", () => {
  const plan = repairPackageDeckPlan(
    {
      slides: [
        {
          title: "Visual",
          templateKind: "visual-focus",
          slots: { title: "Visual", visualId: "vis-1" },
        },
      ],
    },
    inventory,
  );
  assert.equal(plan?.slides[0].slots.visualId, "vis-1");
});
