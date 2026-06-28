import assert from "node:assert/strict";
import { test } from "node:test";

import type { Deck, ImageElement, Slide, SlideElement } from "./deck";
import { DECK_JSON_NON_IMAGE_RESERVE, MAX_DECK_JSON_BYTES } from "@/lib/limits";
import {
  MAX_IMAGE_UPLOAD_BYTES,
  TOTAL_IMAGE_BUDGET_BYTES,
  canAddImage,
  dataUrlByteSize,
  isEmptyImageSrc,
  totalInlineImageBytes,
  validateImageFile,
} from "./image-element";

// ---------------------------------------------------------------------------
// isEmptyImageSrc — the empty/missing-source predicate
// ---------------------------------------------------------------------------

test("isEmptyImageSrc: null and undefined are empty", () => {
  assert.equal(isEmptyImageSrc(null), true);
  assert.equal(isEmptyImageSrc(undefined), true);
});

test("isEmptyImageSrc: empty and whitespace-only strings are empty", () => {
  assert.equal(isEmptyImageSrc(""), true);
  assert.equal(isEmptyImageSrc("   "), true);
  assert.equal(isEmptyImageSrc("\n\t "), true);
});

test("isEmptyImageSrc: a URL or data URL is not empty", () => {
  assert.equal(isEmptyImageSrc("https://example.com/a.png"), false);
  assert.equal(isEmptyImageSrc("data:image/png;base64,AAAA"), false);
});

// ---------------------------------------------------------------------------
// validateImageFile — type + size guard for uploads
// ---------------------------------------------------------------------------

test("validateImageFile: accepts an image under the size limit", () => {
  const result = validateImageFile({ type: "image/png", size: 1024 });
  assert.deepEqual(result, { ok: true });
});

test("validateImageFile: rejects a non-image MIME type", () => {
  const result = validateImageFile({ type: "application/pdf", size: 10 });
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.reason : "", /image file/i);
});

test("validateImageFile: rejects a file over the size limit", () => {
  const result = validateImageFile({
    type: "image/jpeg",
    size: MAX_IMAGE_UPLOAD_BYTES + 1,
  });
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.reason : "", /smaller than/i);
});

test("validateImageFile: a file exactly at the limit is accepted", () => {
  const result = validateImageFile({
    type: "image/gif",
    size: MAX_IMAGE_UPLOAD_BYTES,
  });
  assert.deepEqual(result, { ok: true });
});

test("validateImageFile: honors a custom maxBytes override", () => {
  const accepted = validateImageFile({ type: "image/webp", size: 50 }, 100);
  assert.deepEqual(accepted, { ok: true });
  const rejected = validateImageFile({ type: "image/webp", size: 150 }, 100);
  assert.equal(rejected.ok, false);
});

// ---------------------------------------------------------------------------
// Total inlined-image budget (issue #247)
// ---------------------------------------------------------------------------

/** Builds a data URL whose string length is `bytes` (ASCII → 1 char = 1 byte). */
function dataUrlOfBytes(bytes: number): string {
  const prefix = "data:image/png;base64,";
  return prefix + "A".repeat(Math.max(0, bytes - prefix.length));
}

function imageElement(src: string, id = "img"): ImageElement {
  return {
    id,
    kind: "image",
    content: { kind: "image", src },
    box: { x: 0, y: 0, w: 10, h: 10 },
    zIndex: 0,
  };
}

function deckWithElements(elements: SlideElement[]): Deck {
  const slide: Slide = {
    id: "test-id",
    index: 0,
    title: "Slide",
    bullets: [],
    notes: "",
    elements,
  };
  return { themeId: "default", slides: [slide] };
}

function deckWithBackground(backgroundImage: string | undefined): Deck {
  const slide: Slide = {
    id: "test-id",
    index: 0,
    title: "Slide",
    bullets: [],
    notes: "",
    backgroundImage,
  };
  return { themeId: "default", slides: [slide] };
}

test("dataUrlByteSize: a data URL is sized by its string length", () => {
  const url = dataUrlOfBytes(1000);
  assert.equal(dataUrlByteSize(url), 1000);
});

test("dataUrlByteSize: external URLs and empty/missing sources cost ~0", () => {
  assert.equal(dataUrlByteSize("https://example.com/a.png"), 0);
  assert.equal(dataUrlByteSize("/local/a.png"), 0);
  assert.equal(dataUrlByteSize(""), 0);
  assert.equal(dataUrlByteSize(null), 0);
  assert.equal(dataUrlByteSize(undefined), 0);
});

test("totalInlineImageBytes: sums only inlined image data URLs", () => {
  const deck = deckWithElements([
    imageElement(dataUrlOfBytes(1000), "a"),
    imageElement(dataUrlOfBytes(2000), "b"),
    imageElement("https://example.com/remote.png", "c"),
    {
      id: "t",
      kind: "text",
      content: { kind: "text", text: "hi" },
      box: { x: 0, y: 0, w: 10, h: 10 },
      zIndex: 0,
      designOverrides: {
        textStyle: { fontSize: 16, align: "left", bold: false, italic: false },
      },
    },
  ]);
  assert.equal(totalInlineImageBytes(deck), 3000);
});

test("totalInlineImageBytes: a deck with no elements is 0", () => {
  assert.equal(totalInlineImageBytes({ themeId: "default", slides: [] }), 0);
  assert.equal(totalInlineImageBytes(deckWithElements([])), 0);
});

test("canAddImage: under budget is ok and reports the projected total", () => {
  const deck = deckWithElements([imageElement(dataUrlOfBytes(1000))]);
  const check = canAddImage(deck, 500, 5000);
  assert.deepEqual(check, { ok: true, totalBytes: 1500, budget: 5000 });
});

test("canAddImage: exactly at budget is ok (inclusive)", () => {
  const deck = deckWithElements([imageElement(dataUrlOfBytes(1000))]);
  assert.equal(canAddImage(deck, 4000, 5000).ok, true);
});

test("canAddImage: over budget is rejected", () => {
  const deck = deckWithElements([imageElement(dataUrlOfBytes(1000))]);
  const check = canAddImage(deck, 4001, 5000);
  assert.equal(check.ok, false);
  assert.equal(check.totalBytes, 5001);
});

test("canAddImage: a non-positive net change never exceeds the budget", () => {
  // An already-over-budget deck: a like-for-like or shrinking replacement
  // (net <= 0) keeps the total from growing past the prior value.
  const deck = deckWithElements([imageElement(dataUrlOfBytes(6000))]);
  assert.equal(canAddImage(deck, 0, 5000).totalBytes, 6000);
  assert.equal(canAddImage(deck, -1000, 5000).totalBytes, 5000);
});

test("canAddImage: defaults to TOTAL_IMAGE_BUDGET_BYTES", () => {
  const deck = deckWithElements([]);
  assert.equal(canAddImage(deck, TOTAL_IMAGE_BUDGET_BYTES).ok, true);
  assert.equal(canAddImage(deck, TOTAL_IMAGE_BUDGET_BYTES + 1).ok, false);
});

// ---------------------------------------------------------------------------
// Issue #302 — budget derived from server cap + background image counting
// ---------------------------------------------------------------------------

test("budget derived from cap: TOTAL_IMAGE_BUDGET_BYTES equals cap minus reserve", () => {
  assert.equal(
    TOTAL_IMAGE_BUDGET_BYTES,
    MAX_DECK_JSON_BYTES - DECK_JSON_NON_IMAGE_RESERVE,
  );
  assert.ok(TOTAL_IMAGE_BUDGET_BYTES < MAX_DECK_JSON_BYTES);
});

test("budget derived from cap: MAX_IMAGE_UPLOAD_BYTES inlined stays within budget", () => {
  // Base64 expands raw bytes by 4/3. One maximally-sized upload should not
  // overflow the total image budget when inlined as a data URL.
  const worstCaseInlinedBytes = MAX_IMAGE_UPLOAD_BYTES * (4 / 3);
  assert.ok(
    worstCaseInlinedBytes <= TOTAL_IMAGE_BUDGET_BYTES,
    `${worstCaseInlinedBytes} inlined bytes exceeds budget ${TOTAL_IMAGE_BUDGET_BYTES}`,
  );
});

test("totalInlineImageBytes: background data URL counts toward the total", () => {
  const bgUrl = dataUrlOfBytes(5000);
  const deck: Deck = {
    schemaVersion: 6,
    canvas: { format: "16:9" },
    design: { themeId: "default" },
    masters: [{ id: "master-default", name: "Default", elements: [] }],
    defaultMasterId: "master-default",
    slides: [
      {
        id: "test-id",
        index: 0,
        title: "Slide",
        notes: "",
        designOverrides: {
          background: { type: "image", url: bgUrl },
        },
        elements: [imageElement(dataUrlOfBytes(1000))],
      },
    ],
  };
  assert.equal(totalInlineImageBytes(deck), 6000);
});

test("totalInlineImageBytes: master image data URLs count toward the total", () => {
  const masterUrl = dataUrlOfBytes(700);
  const deck: Deck = {
    schemaVersion: 6,
    canvas: { format: "16:9" },
    design: { themeId: "default" },
    masters: [
      {
        id: "master-default",
        name: "Default",
        elements: [
          {
            id: "logo",
            kind: "image",
            role: "logo",
            masterChromeKind: "logo",
            layer: "foreground",
            locked: true,
            box: { x: 0, y: 0, w: 10, h: 10 },
            zIndex: 0,
            content: { kind: "image", src: masterUrl },
          } as any,
        ],
      },
    ],
    defaultMasterId: "master-default",
    slides: [{ id: "slide", index: 0, title: "", notes: "", elements: [] }],
  };

  assert.equal(totalInlineImageBytes(deck), 700);
});

test("totalInlineImageBytes: remote background contributes 0", () => {
  const deck = deckWithBackground("https://example.com/bg.jpg");
  assert.equal(totalInlineImageBytes(deck), 0);
});

test("totalInlineImageBytes: absent backgroundImage contributes 0", () => {
  assert.equal(totalInlineImageBytes(deckWithBackground(undefined)), 0);
});

test("canAddImage: rejects image that pushes total over derived budget", () => {
  // deck already at budget, adding any positive amount fails
  const deck = deckWithElements([
    imageElement(dataUrlOfBytes(TOTAL_IMAGE_BUDGET_BYTES)),
  ]);
  const check = canAddImage(deck, 1);
  assert.equal(check.ok, false);
  assert.equal(check.totalBytes, TOTAL_IMAGE_BUDGET_BYTES + 1);
});
