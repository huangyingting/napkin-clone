/**
 * Builds the professional theme decks, validates each through the real v6
 * deck schema (`safeParseDeck`), and writes the validated JSON to disk.
 *
 * Run from the repo root:
 *   node --import tsx prototypes/slide-themes/build-themes.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { safeParseDeck } from "@/lib/presentation/deck-schema";
import {
  THEME_PACKAGE_TEMPLATE_KINDS,
  THEME_PACKAGE_TEMPLATE_METADATA,
} from "@/lib/presentation/theme-template-taxonomy";
import { buildDeck } from "./theme-kit";
import { THEMES } from "./themes";
import { initializeLayoutEngine } from "./layout-dsl";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "decks");
const runtimeOutDir = join(
  here,
  "../../src/lib/presentation/theme-package-decks",
);
mkdirSync(outDir, { recursive: true });
mkdirSync(runtimeOutDir, { recursive: true });

const manifest: {
  id: string;
  name: string;
  tagline: string;
  file: string;
  slides: number;
  fonts: { heading: string; body: string };
  accent: string;
  templates: Array<{
    kind: string;
    label: string;
    group: string;
    priority: number;
    renderFamily: string;
  }>;
}[] = [];

let failures = 0;

async function main(): Promise<void> {
  await initializeLayoutEngine();

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
    const semanticIds = new Set(
      (result.data as { slides: Array<{ templateId?: unknown }> }).slides.map(
        (slide) => slide.templateId,
      ),
    );
    for (const kind of THEME_PACKAGE_TEMPLATE_KINDS) {
      const expected = `theme:${spec.id}:${kind}`;
      if (!semanticIds.has(expected)) {
        failures += 1;
        console.error(`✗ ${spec.id} missing semantic source slide ${expected}`);
      }
    }
    manifest.push({
      id: spec.id,
      name: spec.name,
      tagline: spec.tagline,
      file: `decks/${file}`,
      slides,
      fonts: { heading: spec.fonts.heading, body: spec.fonts.body },
      accent: spec.palette.accent,
      templates: THEME_PACKAGE_TEMPLATE_KINDS.map((kind) => {
        const metadata = THEME_PACKAGE_TEMPLATE_METADATA[kind];
        return {
          kind,
          label: metadata.label,
          group: metadata.group,
          priority: metadata.priority,
          renderFamily: metadata.renderFamily,
        };
      }),
    });
    console.log(
      `✓ ${spec.name.padEnd(10)} valid — ${slides} slides → decks/${file}`,
    );
    writeFileSync(
      join(runtimeOutDir, file),
      `${JSON.stringify(result.data, null, 2)}\n`,
      "utf8",
    );
  }

  writeFileSync(
    join(here, "manifest.json"),
    `${JSON.stringify({ themes: manifest }, null, 2)}\n`,
    "utf8",
  );

  for (const entry of manifest) {
    if (entry.templates.length !== THEME_PACKAGE_TEMPLATE_KINDS.length) {
      failures += 1;
      console.error(
        `✗ ${entry.id} manifest missing semantic template metadata`,
      );
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} theme(s) failed validation.`);
    process.exit(1);
  }
  console.log(`\nAll ${manifest.length} themes validated and written.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
