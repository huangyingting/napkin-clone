import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  DEFAULT_SLIDE_FONT_ID,
  SLIDE_FONTS,
  SLIDE_FONT_OPTIONS,
  ensureCjkFallback,
  isPrimarilyCjk,
  isSlideFontId,
  matchSlideFont,
  resolveSlideFont,
  slideFontCssStack,
  slideFontExportFace,
  resolveElementFontCss,
  buildSlideFontFaceCss,
} from "./slide-fonts";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const PUBLIC_DIR = path.join(REPO_ROOT, "public");

describe("slide font registry", () => {
  it("has unique, stable ids", () => {
    const ids = SLIDE_FONTS.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length, "font ids must be unique");
  });

  it("exposes the default font", () => {
    assert.ok(isSlideFontId(DEFAULT_SLIDE_FONT_ID));
    assert.ok(resolveSlideFont(DEFAULT_SLIDE_FONT_ID));
    assert.equal(resolveSlideFont("missing-font"), undefined);
  });

  it("every asset URL points to a file under public/fonts/slides", () => {
    for (const font of SLIDE_FONTS) {
      for (const asset of font.assets) {
        assert.ok(
          asset.url.startsWith("/fonts/slides/"),
          `${font.id} asset URL must be under /fonts/slides/: ${asset.url}`,
        );
        assert.ok(
          asset.url.endsWith(".woff2"),
          `${font.id} asset must be woff2: ${asset.url}`,
        );
        const filePath = path.join(PUBLIC_DIR, asset.url.replace(/^\//, ""));
        assert.ok(
          existsSync(filePath),
          `missing font asset file: ${asset.url}`,
        );
      }
    }
  });

  it("every font provides a PPTX mapping and a CSS stack", () => {
    for (const font of SLIDE_FONTS) {
      assert.ok(font.pptxFontFace.length > 0, `${font.id} pptxFontFace`);
      assert.ok(font.pptxCjkFontFace.length > 0, `${font.id} pptxCjkFontFace`);
      assert.ok(
        font.cssStack.includes(font.cssFamily),
        `${font.id} cssStack must include its family`,
      );
    }
  });

  it("non-CJK fonts include the self-hosted CJK fallback in their stack", () => {
    for (const font of SLIDE_FONTS) {
      if (font.id === "noto-sans-sc") continue;
      assert.ok(
        font.cssStack.includes("Noto Sans SC"),
        `${font.id} should include Noto Sans SC fallback`,
      );
    }
  });

  it("resolves CSS stacks by id", () => {
    assert.equal(slideFontCssStack("inter"), SLIDE_FONTS[0].cssStack);
    assert.equal(slideFontCssStack("unknown-font"), undefined);
    assert.equal(resolveElementFontCss("inter"), SLIDE_FONTS[0].cssStack);
    assert.equal(resolveElementFontCss("unknown-font"), undefined);
    assert.equal(resolveElementFontCss(undefined), undefined);
  });

  it("picker options mirror the registry order and css stacks", () => {
    assert.equal(SLIDE_FONT_OPTIONS.length, SLIDE_FONTS.length);
    SLIDE_FONT_OPTIONS.forEach((opt, i) => {
      assert.equal(opt.id, SLIDE_FONTS[i].id);
      assert.equal(opt.value, SLIDE_FONTS[i].cssStack);
    });
  });
});

describe("matchSlideFont", () => {
  it("matches by id, family, and full stack", () => {
    assert.equal(matchSlideFont("inter")?.id, "inter");
    assert.equal(matchSlideFont("Inter")?.id, "inter");
    assert.equal(
      matchSlideFont("'Inter', 'Noto Sans SC', sans-serif")?.id,
      "inter",
    );
    assert.equal(matchSlideFont("Comic Sans MS"), undefined);
  });
});

describe("isPrimarilyCjk", () => {
  it("detects Chinese-majority text", () => {
    assert.equal(isPrimarilyCjk("这是一个中文标题"), true);
    assert.equal(isPrimarilyCjk("Hello world"), false);
    assert.equal(isPrimarilyCjk(""), false);
    assert.equal(isPrimarilyCjk(undefined), false);
    // Mixed but mostly Chinese
    assert.equal(isPrimarilyCjk("中文 标题 demo"), true);
  });
});

describe("slideFontExportFace", () => {
  it("maps registry fonts to Office faces (Latin by default)", () => {
    assert.equal(
      slideFontExportFace("'Inter', 'Noto Sans SC', sans-serif"),
      "Aptos",
    );
    assert.equal(
      slideFontExportFace("'Source Serif 4', 'Noto Sans SC', serif"),
      "Georgia",
    );
    assert.equal(
      slideFontExportFace(
        "'JetBrains Mono', 'Noto Sans SC', ui-monospace, monospace",
      ),
      "Consolas",
    );
  });

  it("uses the CJK face for primarily-Chinese text", () => {
    assert.equal(
      slideFontExportFace(
        "'Inter', 'Noto Sans SC', sans-serif",
        "中文标题文本",
      ),
      "Microsoft YaHei",
    );
  });

  it("falls back to the first family for non-registry stacks", () => {
    assert.equal(slideFontExportFace("Arial, sans-serif"), "Arial");
    assert.equal(slideFontExportFace(undefined), undefined);
    assert.equal(slideFontExportFace("inherit"), undefined);
  });
});

describe("ensureCjkFallback", () => {
  it("inserts the self-hosted CJK fallback before the first generic family", () => {
    assert.equal(
      ensureCjkFallback("Inter, ui-sans-serif, system-ui, sans-serif"),
      "Inter, 'Noto Sans SC', ui-sans-serif, system-ui, sans-serif",
    );
    assert.equal(
      ensureCjkFallback("Oswald, sans-serif"),
      "Oswald, 'Noto Sans SC', sans-serif",
    );
    assert.equal(
      ensureCjkFallback("Georgia, ui-serif, serif"),
      "Georgia, 'Noto Sans SC', ui-serif, serif",
    );
  });

  it("appends when there is no generic family", () => {
    assert.equal(ensureCjkFallback("Oswald"), "Oswald, 'Noto Sans SC'");
  });

  it("is idempotent for stacks that already carry a Noto CJK family", () => {
    const stack = "'Inter', 'Noto Sans SC', sans-serif";
    assert.equal(ensureCjkFallback(stack), stack);
  });
});

describe("slide-fonts.css coverage", () => {
  it("buildSlideFontFaceCss emits one rule per asset with display and woff2 format", () => {
    const css = buildSlideFontFaceCss();
    const faceCount = (css.match(/@font-face/g) ?? []).length;
    const assetCount = SLIDE_FONTS.reduce((n, f) => n + f.assets.length, 0);

    assert.equal(faceCount, assetCount);
    assert.match(css, /font-display: swap;/);
    assert.match(css, /format\("woff2"\)/);
    assert.ok(css.endsWith("\n"));
  });

  it("checked-in CSS declares an @font-face for every registry asset", () => {
    const cssPath = path.join(REPO_ROOT, "src/app/slide-fonts.css");
    const css = readFileSync(cssPath, "utf8");
    const faceCount = (css.match(/@font-face/g) ?? []).length;
    const assetCount = SLIDE_FONTS.reduce((n, f) => n + f.assets.length, 0);
    assert.equal(
      faceCount,
      assetCount,
      "slide-fonts.css @font-face count must match registry assets; run scripts/gen-slide-fonts-css.ts",
    );
    for (const font of SLIDE_FONTS) {
      for (const asset of font.assets) {
        assert.ok(
          css.includes(asset.url),
          `slide-fonts.css missing src for ${asset.url}`,
        );
      }
      assert.ok(
        css.includes(`font-family: "${font.cssFamily}"`),
        `slide-fonts.css missing @font-face family for ${font.cssFamily}`,
      );
    }
  });
});
