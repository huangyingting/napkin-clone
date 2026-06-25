import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  AI_GENERATION_INPUT_MAX_CHARS,
  BRAND_FONT_MAX_BYTES,
  BRAND_LOGO_MAX_BYTES,
  DECK_JSON_MAX_BYTES,
  DECK_OUTPUT_TOKEN_BUDGET as CENTRAL_DECK_OUTPUT_TOKEN_BUDGET,
  EXPORT_PREFLIGHT_MAX_SLIDES,
  GENERATED_DECK_MAX_SLIDES,
  IMPORT_MAX_BYTES_BY_MIME,
  IMPORT_MAX_UPLOAD_BYTES,
  INLINE_IMAGE_HARD_BYTES,
  LIMIT_INVENTORY,
  MAX_IMAGE_UPLOAD_BYTES as CENTRAL_MAX_IMAGE_UPLOAD_BYTES,
  SLIDE_ASSET_MAX_BYTES,
  SLIDE_ASSET_MAX_DIMENSION_PX,
  TOTAL_IMAGE_BUDGET_BYTES,
} from "@/lib/limits";
import { MAX_INPUT_CHARS } from "@/lib/ai/generate";
import {
  DECK_OUTPUT_TOKEN_BUDGET,
  MAX_DECK_SLIDES,
} from "@/lib/ai/generate-deck";
import { FONT_MAX_BYTES, LOGO_MAX_BYTES } from "@/lib/brand/upload";
import { MAX_DECK_JSON_BYTES } from "@/lib/presentation/deck-limits";
import {
  MAX_IMAGE_UPLOAD_BYTES,
  TOTAL_IMAGE_BUDGET_BYTES as IMAGE_ELEMENT_BUDGET_BYTES,
} from "@/lib/presentation/image-element";
import {
  ASSET_MAX_BYTES,
  ASSET_MAX_DIMENSION_PX,
} from "@/lib/slides/asset-upload";
import {
  DEFAULT_MAX_SLIDES,
  runExportPreflight,
} from "@/lib/visual/export-preflight";
import { MAX_UPLOAD_BYTES, maxBytesForMime } from "@/lib/import/validate";
import type { Deck } from "@/lib/presentation/deck";

describe("central limits boundary", () => {
  test("high-traffic validators import the same central hard caps", () => {
    assert.equal(MAX_DECK_JSON_BYTES, DECK_JSON_MAX_BYTES);
    assert.equal(MAX_INPUT_CHARS, AI_GENERATION_INPUT_MAX_CHARS);
    assert.equal(MAX_DECK_SLIDES, GENERATED_DECK_MAX_SLIDES);
    assert.equal(DECK_OUTPUT_TOKEN_BUDGET, CENTRAL_DECK_OUTPUT_TOKEN_BUDGET);

    assert.equal(MAX_UPLOAD_BYTES, IMPORT_MAX_UPLOAD_BYTES);
    assert.equal(
      maxBytesForMime("text/plain"),
      IMPORT_MAX_BYTES_BY_MIME["text/plain"],
    );
    assert.equal(
      maxBytesForMime("application/pdf"),
      IMPORT_MAX_BYTES_BY_MIME["application/pdf"],
    );

    assert.equal(FONT_MAX_BYTES, BRAND_FONT_MAX_BYTES);
    assert.equal(LOGO_MAX_BYTES, BRAND_LOGO_MAX_BYTES);
    assert.equal(ASSET_MAX_BYTES, SLIDE_ASSET_MAX_BYTES);
    assert.equal(ASSET_MAX_DIMENSION_PX, SLIDE_ASSET_MAX_DIMENSION_PX);

    assert.equal(DEFAULT_MAX_SLIDES, EXPORT_PREFLIGHT_MAX_SLIDES);
    assert.equal(IMAGE_ELEMENT_BUDGET_BYTES, TOTAL_IMAGE_BUDGET_BYTES);
    assert.equal(MAX_IMAGE_UPLOAD_BYTES, CENTRAL_MAX_IMAGE_UPLOAD_BYTES);
    assert.equal(TOTAL_IMAGE_BUDGET_BYTES, INLINE_IMAGE_HARD_BYTES);
  });

  test("inventory marks every entry as enforcement or warning-only", () => {
    assert.ok(LIMIT_INVENTORY.length >= 20);
    const ids = new Set<string>();
    for (const limit of LIMIT_INVENTORY) {
      assert.ok(limit.id);
      assert.ok(!ids.has(limit.id), `duplicate limit id ${limit.id}`);
      ids.add(limit.id);
      assert.ok(limit.value > 0);
      assert.ok(
        limit.enforcement === "enforced" || limit.enforcement === "warning",
      );
      assert.ok(limit.diagnostic.scope);
      assert.ok(limit.diagnostic.metric);
    }
  });

  test("export preflight attaches safe BUDGET_EXCEEDED metadata to advisory slide warnings", () => {
    const deck = {
      themeId: "default",
      slides: Array.from({ length: DEFAULT_MAX_SLIDES + 1 }, (_, index) => ({
        id: `slide-${index}`,
        index,
        title: `Slide ${index}`,
        bullets: [],
        visualIds: [],
        layout: "content",
        notes: "",
        themeId: "default",
        elements: [],
      })),
    } as Deck;

    const result = runExportPreflight(deck, { target: "pptx" });
    const oversized = result.diagnostics.find(
      (diagnostic) => diagnostic.code === "oversized-deck",
    );

    assert.ok(oversized);
    assert.equal(oversized.diagnostic?.code, "BUDGET_EXCEEDED");
    assert.equal(oversized.diagnostic?.scope, "export.preflight");
    assert.deepEqual(Object.keys(oversized.diagnostic?.meta ?? {}).sort(), [
      "actual",
      "budget",
      "metric",
    ]);
    assert.equal(oversized.budget?.hardAt, DEFAULT_MAX_SLIDES);
  });
});
