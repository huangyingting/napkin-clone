/**
 * Builds professional theme preview decks and runtime theme package sources.
 * Preview decks validate through `safeParseDeck`; package sources validate by
 * round-tripping as `customTemplates` in a current-schema deck.
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
import { buildDeck, buildThemePackageSource } from "./theme-kit";
import { THEMES } from "./themes";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "decks");
const packageOutDir = join(here, "packages");
const runtimeOutDir = join(
  here,
  "../../src/lib/presentation/theme-package-sources",
);
mkdirSync(outDir, { recursive: true });
mkdirSync(packageOutDir, { recursive: true });
mkdirSync(runtimeOutDir, { recursive: true });

const manifest: {
  id: string;
  name: string;
  tagline: string;
  file: string;
  packageFile: string;
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

for (const spec of THEMES) {
  const deck = buildDeck(spec);
  const result = safeParseDeck(deck);
  if (!result.success) {
    failures += 1;
    console.error(`✗ ${spec.id} FAILED schema validation: ${result.error}`);
    continue;
  }
  const file = `${spec.id}.deck.json`;
  const packageFile = `${spec.id}.package.json`;
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
      console.error(`✗ ${spec.id} missing template preview slide ${expected}`);
    }
  }
  let packageSource: ReturnType<typeof buildThemePackageSource>;
  try {
    packageSource = buildThemePackageSource(spec);
  } catch (error) {
    failures += 1;
    console.error(
      `✗ ${spec.id} package source failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    continue;
  }
  const packageValidation = safeParseDeck({
    ...result.data,
    customTemplates: packageSource.templates,
    slides: [],
  });
  if (!packageValidation.success) {
    failures += 1;
    console.error(
      `✗ ${spec.id} package source FAILED schema validation: ${packageValidation.error}`,
    );
    continue;
  }
  manifest.push({
    id: spec.id,
    name: spec.name,
    tagline: spec.tagline,
    file: `decks/${file}`,
    packageFile: `packages/${packageFile}`,
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
    join(runtimeOutDir, packageFile),
    `${JSON.stringify(packageSource, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(packageOutDir, packageFile),
    `${JSON.stringify(packageSource, null, 2)}\n`,
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
    console.error(`✗ ${entry.id} manifest missing semantic template metadata`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} theme(s) failed validation.`);
  process.exit(1);
}
console.log(`\nAll ${manifest.length} themes validated and written.`);
