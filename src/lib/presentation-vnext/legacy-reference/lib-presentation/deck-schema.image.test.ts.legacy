import assert from "node:assert/strict";
import { test } from "node:test";

import {
  safeParseDeck,
  validateImageCrop,
  validateImageFitMode,
  validateImageMaskShape,
} from "./deck-schema";
import { elementDeck } from "./deck-schema.test-helpers";

function imageElementDeck(overrides: Record<string, unknown> = {}): unknown {
  const { fitMode, maskShape, radius, ...contentOverrides } = overrides;
  return elementDeck([
    {
      id: "img-1",
      kind: "image",
      role: "image",
      zIndex: 0,
      box: { x: 8, y: 10, w: 32, h: 24 },
      content: {
        kind: "image",
        src: "https://example.com/a.png",
        ...contentOverrides,
      },
      ...(fitMode !== undefined ||
      maskShape !== undefined ||
      radius !== undefined
        ? { designOverrides: { fitMode, maskShape, radius } }
        : {}),
    },
  ]);
}

// ---------------------------------------------------------------------------
// Image crop / fit / mask validation (issue #342)
// ---------------------------------------------------------------------------

test("validateImageFitMode accepts the supported fit modes", () => {
  for (const fitMode of ["contain", "cover", "fill", "none"] as const) {
    assert.equal(validateImageFitMode(fitMode, "fitMode"), fitMode);
  }
  assert.equal(validateImageFitMode(undefined, "fitMode"), undefined);
});

test("validateImageFitMode rejects an unknown fit mode", () => {
  assert.throws(
    () => validateImageFitMode("stretch", "fitMode"),
    /fitMode must be one of/,
  );
});

test("validateImageMaskShape accepts the supported mask shapes", () => {
  for (const maskShape of [
    "none",
    "rect",
    "circle",
    "ellipse",
    "rounded",
    "diamond",
    "triangle",
  ] as const) {
    assert.equal(validateImageMaskShape(maskShape, "maskShape"), maskShape);
  }
  assert.equal(validateImageMaskShape(undefined, "maskShape"), undefined);
});

test("validateImageMaskShape rejects an unknown mask shape", () => {
  assert.throws(
    () => validateImageMaskShape("star", "maskShape"),
    /maskShape must be one of/,
  );
});

test("validateImageCrop accepts fractional top/right/bottom/left values", () => {
  assert.deepEqual(validateImageCrop(undefined, "crop"), undefined);
  assert.deepEqual(
    validateImageCrop({ top: 0.1, right: 0.2, bottom: 0.3, left: 0.4 }, "crop"),
    {
      top: 0.1,
      right: 0.2,
      bottom: 0.3,
      left: 0.4,
    },
  );
});

test("validateImageCrop rejects out-of-range crop fractions", () => {
  assert.throws(
    () =>
      validateImageCrop(
        { top: -0.1, right: 0.2, bottom: 0.3, left: 0.4 },
        "crop",
      ),
    /crop\.top must be between 0 and 1/,
  );
});

test("safeParseDeck round-trips image crop, fitMode, and maskShape", () => {
  const result = safeParseDeck(
    imageElementDeck({
      fitMode: "fill",
      maskShape: "triangle",
      crop: { top: 0.1, right: 0.2, bottom: 0.3, left: 0.05 },
    }),
  );
  assert.equal(result.success, true);
  if (result.success) {
    const element = result.data.slides[0].elements?.[0];
    assert.equal(element?.kind, "image");
    if (element?.kind === "image") {
      assert.equal((element as any).designOverrides.fitMode, "fill");
      assert.equal((element as any).designOverrides.maskShape, "triangle");
      assert.deepEqual((element as any).content.crop, {
        top: 0.1,
        right: 0.2,
        bottom: 0.3,
        left: 0.05,
      });
    }
  }
});

test("safeParseDeck rejects obsolete image fit alias", () => {
  const result = safeParseDeck(imageElementDeck({ fit: "cover" }));
  assert.equal(result.success, false);
});

test("safeParseDeck rejects an invalid image crop", () => {
  assert.equal(
    safeParseDeck(
      imageElementDeck({
        crop: { top: 1.1, right: 0, bottom: 0, left: 0 },
      }),
    ).success,
    false,
  );
});

// ---------------------------------------------------------------------------
// assetId schema validator (Epic #374)
// ---------------------------------------------------------------------------

test("safeParseDeck round-trips assetId when it is a non-empty string", () => {
  const result = safeParseDeck(imageElementDeck({ assetId: "clr1234abcdef" }));
  assert.equal(result.success, true);
  if (result.success) {
    const element = result.data.slides[0].elements?.[0];
    assert.equal(element?.kind, "image");
    if (element?.kind === "image") {
      assert.equal((element as any).content.assetId, "clr1234abcdef");
    }
  }
});

test("safeParseDeck accepts an image element without assetId (optional field)", () => {
  const result = safeParseDeck(imageElementDeck());
  assert.equal(result.success, true);
  if (result.success) {
    const element = result.data.slides[0].elements?.[0];
    assert.equal(element?.kind, "image");
    if (element?.kind === "image") {
      assert.equal((element as any).content.assetId, undefined);
    }
  }
});

test("safeParseDeck rejects assetId that is not a string", () => {
  const result = safeParseDeck(imageElementDeck({ assetId: 42 }));
  assert.equal(result.success, false);
});
