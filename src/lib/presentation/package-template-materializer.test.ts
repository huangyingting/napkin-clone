import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDeck } from "@/test/builders/deck";
import { safeParseDeck } from "./deck-schema";
import { materializePackageTemplateDeck } from "./package-template-materializer";

const baseDeck = buildDeck({ design: { themeId: "clarity" }, slides: [] });

test("materializePackageTemplateDeck creates schema-valid semantic package slides", () => {
  const deck = materializePackageTemplateDeck({
    baseDeck,
    packageId: "clarity",
    plan: {
      schemaVersion: 1,
      language: "en",
      slides: [
        {
          title: "Evidence",
          templateKind: "evidence",
          slots: {
            title: "Evidence",
            table: {
              caption: "Proof",
              columns: ["Source", "Claim"],
              rows: [
                ["A", "One"],
                ["B", "Two"],
              ],
            },
          },
        },
        {
          title: "Next",
          templateKind: "next-steps",
          slots: { title: "Next", bullets: ["Ship", "Measure"] },
        },
      ],
    },
  });

  assert.ok(deck);
  assert.equal(safeParseDeck(deck).success, true);
  assert.equal(deck.slides.length, 2);
  assert.equal(deck.slides[0].templateId, "theme:clarity:evidence");
  assert.equal(deck.slides[0].masterId, "master-clarity");
  assert.ok(
    deck.slides[0].elements?.some((element) => element.kind === "table"),
  );
  assert.equal(deck.slides[1].templateId, "theme:clarity:next-steps");
});
