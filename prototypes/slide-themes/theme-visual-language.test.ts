import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { safeParseDeck } from "@/lib/presentation/deck-schema";
import { THEME_PACKAGE_TEMPLATE_KINDS } from "@/lib/presentation/theme-template-taxonomy";

function readDeck(id: string) {
  const parsed = safeParseDeck(
    JSON.parse(
      readFileSync(
        join(process.cwd(), `prototypes/slide-themes/decks/${id}.deck.json`),
        "utf8",
      ),
    ),
  );
  assert.equal(parsed.success, true, parsed.success ? undefined : parsed.error);
  assert.ok(parsed.success);
  return parsed.data;
}

function readPackage(id: string) {
  return JSON.parse(
    readFileSync(
      join(
        process.cwd(),
        `prototypes/slide-themes/packages/${id}.package.json`,
      ),
      "utf8",
    ),
  );
}

function assertNativeComponents(slide: any): void {
  assert.ok(slide.elements?.length > 1, slide.templateId);
  assert.ok(
    slide.elements.some((element: any) => element.kind === "text"),
    `${slide.templateId} has text elements`,
  );
  assert.ok(
    slide.elements.some((element: any) => element.kind === "shape"),
    `${slide.templateId} has shape elements`,
  );
  assert.equal(
    slide.elements.some(
      (element: any) =>
        element.kind === "image" &&
        /^data:image\/svg\+xml,/.test(element.content?.src ?? ""),
    ),
    false,
    `${slide.templateId} does not use full-slide SVG image`,
  );
}

test("package JSON materializes every semantic template into preview decks", () => {
  for (const id of [
    "clarity",
    "ocean",
    "aurora",
    "monolith",
    "editorial",
    "noir",
    "terra",
    "pulse",
  ]) {
    const themePackage = readPackage(id);
    const deck = readDeck(id);
    assert.equal(
      themePackage.templates.length,
      THEME_PACKAGE_TEMPLATE_KINDS.length,
      id,
    );
    assert.equal(deck.slides.length, THEME_PACKAGE_TEMPLATE_KINDS.length, id);
    assert.equal(deck.masters[0]?.elements?.length, 0, id);

    for (const kind of THEME_PACKAGE_TEMPLATE_KINDS) {
      const template = themePackage.templates.find(
        (candidate: any) => candidate.id === `theme:${id}:${kind}`,
      );
      const slide = deck.slides.find(
        (candidate) => candidate.templateId === `theme:${id}:${kind}`,
      );
      assert.ok(template, `${id}:${kind}`);
      assert.ok(slide, `${id}:${kind}`);
      assert.equal(slide.elements[0]?.id, template.elements[0]?.id);
      assertNativeComponents(slide);
    }
  }
});

test("package JSON retains distinctive native component treatments", () => {
  const editorialCover = readDeck("editorial").slides.find(
    (slide) => slide.templateId === "theme:editorial:cover",
  );
  assert.ok(
    editorialCover?.elements.some(
      (element: any) => element.name === "Editorial ring",
    ),
  );
  assert.ok(
    editorialCover?.elements.some(
      (element: any) =>
        element.kind === "text" && element.content?.text.includes("Brand"),
    ),
  );

  const oceanCover = readDeck("ocean").slides.find(
    (slide) => slide.templateId === "theme:ocean:cover",
  );
  assert.ok(
    oceanCover?.elements.some(
      (element: any) => element.name === "Iridescent field",
    ),
  );

  const pulseCover = readDeck("pulse").slides.find(
    (slide) => slide.templateId === "theme:pulse:cover",
  );
  assert.ok(
    pulseCover?.elements.some((element: any) => element.name === "Scan line"),
  );
  assert.ok(
    pulseCover?.elements.some(
      (element: any) =>
        element.kind === "text" &&
        element.content?.text.includes("studio_showe"),
    ),
  );
});
