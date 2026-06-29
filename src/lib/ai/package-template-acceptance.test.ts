import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDeck } from "@/test/builders/deck";
import { safeParseDeck } from "@/lib/presentation/deck-schema";
import { runPackageTemplateDeckGeneration } from "./run-package-template-deck-generation";
import type { ThemePackageId } from "@/lib/presentation/theme-packages";

const contentJson = {
  root: {
    type: "root",
    children: [
      {
        type: "heading",
        tag: "h1",
        children: [{ type: "text", text: "Plan" }],
      },
      { type: "paragraph", children: [{ type: "text", text: "Details" }] },
    ],
  },
};

const fixtures = [
  {
    name: "technical/product explanation",
    slides: [
      {
        title: "Architecture",
        templateKind: "cover",
        slots: { title: "Architecture" },
      },
      {
        title: "Context",
        templateKind: "detail",
        slots: {
          title: "Context",
          body: "System context with enough background, constraints, and rationale to need a paragraph-oriented slide.",
        },
      },
      {
        title: "Architecture",
        templateKind: "architecture",
        slots: { title: "Architecture", bullets: ["Service", "Queue"] },
      },
      {
        title: "Next",
        templateKind: "recommendation",
        slots: { title: "Next", bullets: ["Ship", "Measure"] },
      },
    ],
  },
  {
    name: "business strategy report",
    slides: [
      { title: "Summary", templateKind: "cover", slots: { title: "Summary" } },
      {
        title: "Market",
        templateKind: "matrix",
        slots: { title: "Market", bullets: ["Segment", "Motion"] },
      },
      {
        title: "Data",
        templateKind: "table",
        slots: {
          title: "Data",
          table: {
            columns: ["Metric", "Value"],
            rows: [
              ["ARR", "$12M"],
              ["Growth", "30%"],
            ],
          },
        },
      },
      {
        title: "Roadmap",
        templateKind: "roadmap",
        slots: { title: "Roadmap", bullets: ["Q1", "Q2"] },
      },
      {
        title: "Next",
        templateKind: "recommendation",
        slots: { title: "Next", bullets: ["Decide"] },
      },
    ],
  },
  {
    name: "legal evidence analysis",
    slides: [
      { title: "Case", templateKind: "cover", slots: { title: "Case" } },
      {
        title: "Timeline",
        templateKind: "timeline",
        slots: { title: "Timeline", bullets: ["Notice", "Response"] },
      },
      {
        title: "Evidence",
        templateKind: "evidence",
        slots: {
          title: "Evidence",
          table: {
            columns: ["Source", "Claim"],
            rows: [
              ["Email", "Notice"],
              ["Letter", "Breach"],
            ],
          },
        },
      },
      {
        title: "Recommendation",
        templateKind: "recommendation",
        slots: { title: "Recommendation", bullets: ["File", "Preserve"] },
      },
      {
        title: "Appendix",
        templateKind: "appendix",
        slots: { title: "Appendix", body: "Record details" },
      },
    ],
  },
] as const;

async function runFixture(
  packageId: ThemePackageId,
  slides: readonly unknown[],
) {
  return runPackageTemplateDeckGeneration({
    contentJson,
    visuals: new Map(),
    baseDeck: buildDeck({ design: { themeId: packageId }, slides: [] }),
    packageId,
    complete: async () =>
      JSON.stringify({ schemaVersion: 1, language: "en", slides }),
    maxAttempts: 1,
  });
}

for (const fixture of fixtures) {
  test(`package-template acceptance: ${fixture.name}`, async () => {
    for (const packageId of ["clarity", "noir", "terra"] as const) {
      const result = await runFixture(packageId, fixture.slides);
      assert.equal(safeParseDeck(result.deck).success, true, packageId);
      assert.equal(
        result.deck.slides[0]?.templateId,
        `theme:${packageId}:cover`,
      );
      assert.ok(result.deck.slides.length >= 4);
      assert.ok(
        result.deck.slides.every((slide) =>
          String(slide.templateId).startsWith(`theme:${packageId}:`),
        ),
      );
      assert.equal((result.deck as any).design.themeId, packageId);
      assert.ok(result.deck.masters?.length);
      for (const slide of result.deck.slides) {
        for (const element of slide.elements ?? []) {
          if (element.kind === "table") {
            assert.ok(element.content.columns.length <= 4);
            assert.ok(element.content.rows.length <= 6);
          }
        }
      }
    }
  });
}
