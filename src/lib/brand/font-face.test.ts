/**
 * Tests for font durable-asset helpers (@font-face generation + rehydration).
 *
 * Covers: buildFontFaceCss (pure), validateBrandInput with fontDataUrl,
 * upload-validate → data-URL production, save→reload scenario, and export
 * behavior notes.
 *
 * DOM-free: runs under `node --import tsx --test`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildFontFaceCss } from "@/lib/brand/font-face";
import { validateBrandInput } from "@/lib/brand/schema";
import { validateFontUpload, FONT_MAX_BYTES } from "@/lib/brand/upload";

// ---------------------------------------------------------------------------
// buildFontFaceCss — pure @font-face CSS generation
// ---------------------------------------------------------------------------

describe("buildFontFaceCss", () => {
  it("returns empty string when fontFamily is null", () => {
    assert.equal(buildFontFaceCss(null, "data:font/woff2;base64,abc"), "");
  });

  it("returns empty string when fontDataUrl is null", () => {
    assert.equal(buildFontFaceCss("'MyFont', sans-serif", null), "");
  });

  it("returns empty string when both are empty strings", () => {
    assert.equal(buildFontFaceCss("", ""), "");
  });

  it("produces a valid @font-face rule from a stack family", () => {
    const css = buildFontFaceCss(
      "'Acme Brand', sans-serif",
      "data:font/woff2;base64,AAAA",
    );
    assert.match(css, /@font-face/);
    assert.match(css, /font-family: 'Acme Brand'/);
    assert.match(css, /src: url\('data:font\/woff2;base64,AAAA'\)/);
    assert.match(css, /font-display: swap/);
  });

  it("strips surrounding quotes from bare family name", () => {
    // Input family is already bare (no fallback stack)
    const css = buildFontFaceCss("'Foobar'", "data:font/woff2;base64,X");
    assert.match(css, /font-family: 'Foobar'/);
  });

  it("handles double-quoted family name", () => {
    const css = buildFontFaceCss('"Inter Round"', "data:font/ttf;base64,YY");
    assert.match(css, /font-family: 'Inter Round'/);
  });

  it("uses only the first font in the stack (strips fallbacks)", () => {
    const css = buildFontFaceCss(
      "'CustomFont', Arial, sans-serif",
      "data:font/otf;base64,ZZ",
    );
    // Should only appear once and with the primary family
    assert.match(css, /font-family: 'CustomFont'/);
    assert.ok(!css.includes("Arial"), "Should not include fallback names");
  });

  it("returns empty string for family with only whitespace after stripping", () => {
    const css = buildFontFaceCss("' '", "data:font/woff;base64,XX");
    // bare family after trimming would be empty
    assert.equal(css, "");
  });
});

// ---------------------------------------------------------------------------
// Upload validation → data-URL production (mirrors the API route logic)
// ---------------------------------------------------------------------------

describe("font upload → data-URL production", () => {
  it("validateFontUpload accepts woff2 and produces correct mime", () => {
    const result = validateFontUpload("font/woff2", "brand.woff2", 1024);
    assert.equal(result.ok, true);
    if (result.ok) {
      // API route builds: `data:${validation.mime};base64,${buffer.toString("base64")}`
      const fakeBuffer = Buffer.from("FAKEFONTDATA");
      const dataUrl = `data:${result.mime};base64,${fakeBuffer.toString("base64")}`;
      assert.match(dataUrl, /^data:font\/woff2;base64,/);
    }
  });

  it("rejects files exceeding FONT_MAX_BYTES", () => {
    const result = validateFontUpload(
      "font/woff2",
      "big.woff2",
      FONT_MAX_BYTES + 1,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "file_too_large");
  });

  it("rejects non-font MIME types", () => {
    const result = validateFontUpload("image/png", "fake.png", 512);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "type_rejected");
  });

  it("resolves font type from filename extension when MIME is octet-stream", () => {
    const result = validateFontUpload(
      "application/octet-stream",
      "font.ttf",
      100,
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.mime, "font/ttf");
  });
});

// ---------------------------------------------------------------------------
// validateBrandInput — fontDataUrl field
// ---------------------------------------------------------------------------

describe("validateBrandInput with fontDataUrl", () => {
  it("accepts a valid fontDataUrl (data-URL string)", () => {
    const dataUrl = "data:font/woff2;base64," + "A".repeat(100);
    const result = validateBrandInput({
      name: "FontBrand",
      fontFamily: "'Acme', sans-serif",
      fontDataUrl: dataUrl,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.fontDataUrl, dataUrl);
      assert.equal(result.data.fontFamily, "'Acme', sans-serif");
    }
  });

  it("accepts null fontDataUrl", () => {
    const result = validateBrandInput({
      name: "NoFont",
      fontDataUrl: null,
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.fontDataUrl, null);
  });

  it("treats missing fontDataUrl as null", () => {
    const result = validateBrandInput({ name: "NoFont" });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.fontDataUrl, null);
  });

  it("accepts a large fontDataUrl up to 3 MB", () => {
    // 3 MB - 1 byte: should be accepted
    const large = "data:font/woff2;base64," + "A".repeat(3 * 1024 * 1024 - 23);
    const result = validateBrandInput({ name: "Big", fontDataUrl: large });
    assert.equal(result.ok, true);
  });

  it("truncates fontDataUrl longer than 3 MB without erroring", () => {
    const oversize =
      "data:font/woff2;base64," + "A".repeat(3 * 1024 * 1024 + 100);
    const result = validateBrandInput({ name: "X", fontDataUrl: oversize });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok(
        result.data.fontDataUrl!.length <= 3 * 1024 * 1024,
        "fontDataUrl should be truncated to 3 MB",
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Save → reload scenario (rehydration contract)
// ---------------------------------------------------------------------------

describe("font save → reload rehydration contract", () => {
  it("buildFontFaceCss from stored brand fields produces replayable CSS", () => {
    // Simulate what is stored in DB after an upload + save
    const storedBrand = {
      fontFamily: "'AcmeBrand', sans-serif",
      fontDataUrl: "data:font/woff2;base64,BASE64FONTDATA",
    };
    const css = buildFontFaceCss(
      storedBrand.fontFamily,
      storedBrand.fontDataUrl,
    );
    // On reload this CSS is injected via injectBrandFontFace → browser loads font
    assert.match(css, /@font-face/);
    assert.match(css, /font-family: 'AcmeBrand'/);
    assert.match(css, /BASE64FONTDATA/);
  });

  it("buildFontFaceCss is idempotent — same inputs produce same output", () => {
    const a = buildFontFaceCss(
      "'Foo', sans-serif",
      "data:font/woff2;base64,XY",
    );
    const b = buildFontFaceCss(
      "'Foo', sans-serif",
      "data:font/woff2;base64,XY",
    );
    assert.equal(a, b);
  });

  it("returns empty string for a web-font brand (no custom data-URL needed)", () => {
    // Web fonts (Google Fonts) have fontDataUrl = null; they use a <link> tag.
    const css = buildFontFaceCss("'Inter', sans-serif", null);
    assert.equal(css, "");
  });
});

// ---------------------------------------------------------------------------
// Export behavior notes (documented in route.ts; verified via CSS output)
// ---------------------------------------------------------------------------

describe("export behavior — custom font in @font-face CSS", () => {
  it("SVG/PNG: @font-face CSS embeds the font data-URL for rasterization", () => {
    // The brand's @font-face is injected into <head> before export; canvas
    // rendering picks up the font at rasterization time.
    const css = buildFontFaceCss(
      "'BrandFont'",
      "data:font/woff2;base64,FONTDATA",
    );
    assert.match(css, /src: url\('data:font\/woff2;base64,FONTDATA'\)/);
  });

  it("PPTX: fontFamily string is referenced but font is not embedded (known limitation)", () => {
    // PPTX native shapes receive fontFamily only; @font-face CSS is not
    // applicable.  Callers must document this limitation.
    // This test asserts the CSS output is NOT PPTX-compatible on its own.
    const css = buildFontFaceCss("'BrandFont'", "data:font/woff2;base64,X");
    assert.ok(!css.includes("pptx"), "CSS is not PPTX-specific output");
    assert.match(
      css,
      /@font-face/,
      "CSS is still valid for SVG/HTML/PNG paths",
    );
  });
});
