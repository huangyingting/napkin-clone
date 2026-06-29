import assert from "node:assert/strict";
import test from "node:test";

import { safeParseDeck } from "@/lib/presentation/deck-schema";
import {
  THEME_PACKAGE_TEMPLATE_KINDS,
  THEME_PACKAGE_TEMPLATE_METADATA,
  type ThemePackageRenderFamily,
} from "@/lib/presentation/theme-template-taxonomy";

import { initializeLayoutEngine } from "./layout-dsl";
import { buildDeck } from "./theme-kit";
import { familySlide } from "./render-family-layouts";
import { THEMES } from "./themes";

const GENERATED_DSL_RENDER_FAMILIES: ThemePackageRenderFamily[] = [
  "agenda",
  "metric-row",
  "two-column",
  "pricing-cards",
];

function templateKindForFamily(family: ThemePackageRenderFamily): string {
  const kind = THEME_PACKAGE_TEMPLATE_KINDS.find(
    (entry) => THEME_PACKAGE_TEMPLATE_METADATA[entry].renderFamily === family,
  );
  assert.ok(kind, `expected a template kind for ${family}`);
  return kind;
}

function assertNoPersistedCss(value: unknown): void {
  if (typeof value === "string") {
    assert.equal(value.includes("gradient("), false, value);
    assert.equal(value.includes("var(--"), false, value);
    assert.equal(value.includes("glass("), false, value);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) assertNoPersistedCss(item);
    return;
  }
  for (const item of Object.values(value)) assertNoPersistedCss(item);
}

test("generated DSL-authored render families compile to plain v6 elements", async () => {
  await initializeLayoutEngine();

  const clarity = THEMES.find((theme) => theme.id === "clarity");
  assert.ok(clarity);
  const result = safeParseDeck(buildDeck(clarity));
  assert.equal(result.success, true);
  assertNoPersistedCss(result.success ? result.data : undefined);

  for (const family of GENERATED_DSL_RENDER_FAMILIES) {
    const kind = templateKindForFamily(family);
    const slide = result.success
      ? result.data.slides.find(
          (entry) => entry.templateId === `theme:clarity:${kind}`,
        )
      : undefined;
    assert.ok(slide, `missing slide for ${family}`);
    const panels = (slide.elements ?? []).filter(
      (element) => element.kind === "shape" && element.name === "Panel",
    );
    assert.ok(panels.length > 0, `${family} should render panel shapes`);
    for (const element of slide.elements ?? []) {
      assert.ok(element.box.w > 0, `${family} element ${element.id} has width`);
      assert.ok(
        element.box.h > 0,
        `${family} element ${element.id} has height`,
      );
    }
  }
});

test("standalone cards-3 family compiles to plain v6 elements", async () => {
  await initializeLayoutEngine();

  const clarity = THEMES.find((theme) => theme.id === "clarity");
  assert.ok(clarity);
  const slide = familySlide(clarity, "cards-3-proof", "cards-3", "Cards 3");
  assert.ok(slide);
  assertNoPersistedCss(slide);
  const elements = (
    slide as { elements?: Array<{ kind: string; name?: string }> }
  ).elements;
  const panels = elements?.filter(
    (element) => element.kind === "shape" && element.name === "Panel",
  );
  assert.equal(panels?.length, 3);
});
