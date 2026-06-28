/**
 * Builds the six professional theme decks, validates each through the real v6
 * deck schema (`safeParseDeck`), and writes the validated JSON to disk.
 *
 * Run from the repo root:
 *   node --import tsx prototypes/slide-themes/build-themes.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { safeParseDeck } from "@/lib/presentation/deck-schema";
import { buildDeck } from "./theme-kit";
import { THEMES } from "./themes";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "decks");
mkdirSync(outDir, { recursive: true });

const manifest: {
  id: string;
  name: string;
  tagline: string;
  file: string;
  slides: number;
  fonts: { heading: string; body: string };
  accent: string;
}[] = [];

let failures = 0;

for (const spec of THEMES) {
  const deck = buildDeck(spec);
  const result = safeParseDeck(deck);
  if (!result.success) {
    failures += 1;
    console.error(`✗ ${spec.id} FAILED schema validation: ${result.error}`);
    continue;
  }
  const file = `${spec.id}.deck.json`;
  writeFileSync(
    join(outDir, file),
    `${JSON.stringify(result.data, null, 2)}\n`,
    "utf8",
  );
  const slides = (result.data as { slides: unknown[] }).slides.length;
  manifest.push({
    id: spec.id,
    name: spec.name,
    tagline: spec.tagline,
    file: `decks/${file}`,
    slides,
    fonts: { heading: spec.fonts.heading, body: spec.fonts.body },
    accent: spec.palette.accent,
  });
  console.log(
    `✓ ${spec.name.padEnd(10)} valid — ${slides} slides → decks/${file}`,
  );
}

writeFileSync(
  join(here, "manifest.json"),
  `${JSON.stringify({ themes: manifest }, null, 2)}\n`,
  "utf8",
);

if (failures > 0) {
  console.error(`\n${failures} theme(s) failed validation.`);
  process.exit(1);
}
console.log(`\nAll ${manifest.length} themes validated and written.`);
