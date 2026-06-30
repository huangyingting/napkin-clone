import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { SEMANTIC_TEMPLATE_KINDS } from "@/lib/presentation-vnext/template-registry";
import { validateThemePackage } from "@/lib/presentation-vnext/theme-package-schema";
import { safeParseDeckV7 } from "@/lib/presentation-vnext/validation";

function readDeck(id: string) {
  const parsed = safeParseDeckV7(
    JSON.parse(
      readFileSync(
        join(process.cwd(), `prototypes/slide-themes/decks/${id}.deck.json`),
        "utf8",
      ),
    ),
  );
  assert.equal(
    parsed.success,
    true,
    parsed.success ? undefined : parsed.errors.join("; "),
  );
  assert.ok(parsed.success);
  return parsed.data;
}

function readPackage(id: string) {
  const parsed = validateThemePackage(
    JSON.parse(
      readFileSync(
        join(
          process.cwd(),
          `prototypes/slide-themes/packages/${id}.package.json`,
        ),
        "utf8",
      ),
    ),
  );
  assert.equal(
    parsed.valid,
    true,
    parsed.valid
      ? undefined
      : parsed.diagnostics.map((diagnostic) => diagnostic.message).join("; "),
  );
  assert.ok(parsed.valid);
  return parsed.package;
}

test("native v7 packages materialize every semantic template into preview decks", () => {
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
    assert.equal(themePackage.schemaVersion, 1, id);
    assert.equal(deck.schemaVersion, 7, id);
    assert.equal(deck.theme.packageId, id);
    assert.equal(deck.slides.length, SEMANTIC_TEMPLATE_KINDS.length, id);

    for (const kind of SEMANTIC_TEMPLATE_KINDS) {
      const slide = deck.slides.find(
        (candidate) => candidate.template.kind === kind,
      );
      assert.ok(slide, `${id}:${kind}`);
      assert.ok(slide.children.length > 0, `${id}:${kind} has children`);
      assert.equal(
        slide.children.some((child) => child.type === "text"),
        true,
        `${id}:${kind} has text nodes`,
      );
    }
  }
});

test("native v7 packages retain distinctive style packages", () => {
  const clarity = readPackage("clarity");
  const ocean = readPackage("ocean");
  const pulse = readPackage("pulse");

  assert.equal(clarity.tokens.colors.accent.fill, "#0042ff");
  assert.ok(clarity.decorations?.grid);

  assert.equal(ocean.tokens.colors.accent.fill, "#7b5cff");
  assert.ok(ocean.decorations?.glow);

  assert.equal(pulse.tokens.fonts.heading.includes("JetBrains Mono"), true);
  assert.ok(pulse.decorations?.scanLine);
});
