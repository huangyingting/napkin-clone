import assert from "node:assert/strict";
import test from "node:test";

import {
  ETA_HINT,
  GENERATION_STAGES,
  getStageLabel,
} from "@/lib/ai/generation-stages";

test("getStageLabel returns the first stage label at 0 ms", () => {
  assert.strictEqual(getStageLabel(0), GENERATION_STAGES[0].label);
});

test("getStageLabel stays in the first stage before its threshold is met", () => {
  assert.strictEqual(getStageLabel(1), GENERATION_STAGES[0].label);
  assert.strictEqual(getStageLabel(2_999), GENERATION_STAGES[0].label);
});

test("getStageLabel advances to second stage exactly at its threshold", () => {
  assert.strictEqual(getStageLabel(3_000), GENERATION_STAGES[1].label);
  assert.strictEqual(getStageLabel(4_000), GENERATION_STAGES[1].label);
  assert.strictEqual(getStageLabel(8_999), GENERATION_STAGES[1].label);
});

test("getStageLabel advances to the final stage at its threshold", () => {
  const last = GENERATION_STAGES[GENERATION_STAGES.length - 1];
  assert.strictEqual(getStageLabel(last.from), last.label);
  assert.strictEqual(getStageLabel(last.from + 1_000), last.label);
  assert.strictEqual(getStageLabel(last.from + 60_000), last.label);
});

test("getStageLabel covers at least two distinct stages (≥2 required)", () => {
  const uniqueLabels = new Set(GENERATION_STAGES.map((s) => s.label));
  assert.ok(
    uniqueLabels.size >= 2,
    `Expected ≥2 distinct stage labels, got ${uniqueLabels.size}`,
  );
});

test("stages are sorted by strictly ascending 'from' thresholds", () => {
  for (let i = 1; i < GENERATION_STAGES.length; i++) {
    assert.ok(
      GENERATION_STAGES[i].from > GENERATION_STAGES[i - 1].from,
      `Stage ${i} 'from' (${GENERATION_STAGES[i].from}) must be > stage ${i - 1} 'from' (${GENERATION_STAGES[i - 1].from})`,
    );
  }
});

test("ETA_HINT is a non-empty string", () => {
  assert.ok(typeof ETA_HINT === "string" && ETA_HINT.length > 0);
});

test("getStageLabel is monotone: label never reverts to an earlier stage", () => {
  // Sweep elapsed time 0–15000 ms and verify we only advance, never retreat.
  let lastIndex = 0;
  for (let ms = 0; ms <= 15_000; ms += 100) {
    const label = getStageLabel(ms);
    const idx = GENERATION_STAGES.findIndex((s) => s.label === label);
    assert.ok(
      idx >= lastIndex,
      `At ${ms} ms label "${label}" (index ${idx}) regressed from index ${lastIndex}`,
    );
    lastIndex = idx;
  }
});
