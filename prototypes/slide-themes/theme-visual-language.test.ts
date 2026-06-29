import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { safeParseDeck } from "@/lib/presentation/deck-schema";

const deckPath = join(
  process.cwd(),
  "prototypes/slide-themes/decks/aurora.deck.json",
);

test("generated Aurora theme carries and uses rich visual-language primitives", () => {
  const parsed = safeParseDeck(JSON.parse(readFileSync(deckPath, "utf8")));
  assert.equal(parsed.success, true, parsed.success ? undefined : parsed.error);
  if (!parsed.success) return;

  const tokenSet = parsed.data.design?.themeOverrides?.tokenSet as any;
  assert.equal(tokenSet.visualLanguage.motifs.glowA.effect.kind, "blur");
  assert.equal(tokenSet.visualLanguage.surfaces.card.effect.kind, "glass");
  assert.equal(tokenSet.visualLanguage.text.kicker.textTransform, "uppercase");

  const cover = parsed.data.slides.find(
    (slide) => slide.templateId === "theme:aurora:cover",
  );
  assert.ok(cover, "expected Aurora cover slide");
  const glow = cover.elements?.find(
    (element) => element.name === "Glow",
  ) as any;
  assert.equal(glow?.designOverrides?.effect?.kind, "glow");
  assert.equal(glow?.designOverrides?.fill?.type, "radialGradient");
  assert.equal(glow?.designOverrides?.fill?.rx, 100);
  assert.equal(glow?.designOverrides?.fill?.ry, 90);
  assert.equal(glow?.shadow?.color, "#a855f7");

  const gradientText = cover.elements?.find(
    (element: any) => element.content?.text === "frontier",
  ) as any;
  assert.equal(
    gradientText?.designOverrides?.textStyle?.textFill?.type,
    "linearGradient",
  );
  assert.equal(
    gradientText?.designOverrides?.textStyle?.textFill?.stops.length,
    3,
  );
  assert.equal(gradientText?.designOverrides?.textStyle?.letterSpacing, -0.02);
});
