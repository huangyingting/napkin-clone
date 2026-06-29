/**
 * Builds preview decks and runtime theme package sources from package JSON.
 *
 * `prototypes/slide-themes/packages/*.package.json` is the source of truth.
 * The script materializes those packages into schema-valid preview decks and
 * copies the same package JSON to the runtime package-source directory.
 *
 * Run from the repo root:
 *   node --import tsx prototypes/slide-themes/build-themes.ts
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { safeParseDeck } from "@/lib/presentation/deck-schema";
import {
  THEME_PACKAGE_TEMPLATE_KINDS,
  THEME_PACKAGE_TEMPLATE_METADATA,
} from "@/lib/presentation/theme-template-taxonomy";
import { THEME_PACKAGE_SOURCE_IDS } from "./themes";

type PackageDeckSource = {
  id: string;
  name: string;
  tagline: string;
  accent: string;
  tokenSet: Record<string, unknown>;
  masters: Record<string, unknown>[];
  defaultMasterId: string;
  templates: Array<Record<string, unknown>>;
};

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "decks");
const packageDir = join(here, "packages");
const runtimeOutDir = join(
  here,
  "../../src/lib/presentation/theme-package-sources",
);
mkdirSync(outDir, { recursive: true });
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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readPackageSource(packageFile: string): PackageDeckSource {
  return JSON.parse(
    readFileSync(join(packageDir, packageFile), "utf8"),
  ) as PackageDeckSource;
}

function slideFromPackageTemplate(
  template: Record<string, unknown>,
  index: number,
): Record<string, unknown> {
  const elements = Array.isArray(template.elements) ? template.elements : [];
  return {
    id: `preview-${String(template.id).replace(/[^a-z0-9-]+/gi, "-")}`,
    index,
    title: String(template.name ?? template.id ?? `Slide ${index + 1}`),
    notes: "",
    templateId: template.id,
    ...(template.defaultMasterId ? { masterId: template.defaultMasterId } : {}),
    ...(template.slideDesignDefaults
      ? { designOverrides: clone(template.slideDesignDefaults) }
      : {}),
    elements: elements.map((element, elementIndex) => {
      const record = element as Record<string, unknown>;
      return {
        id: record.id ?? `template-element-${elementIndex + 1}`,
        kind: record.kind ?? "shape",
        ...(record.role ? { role: record.role } : {}),
        box: record.box ?? { x: 10, y: 10, w: 80, h: 20 },
        zIndex: elementIndex,
        content: record.contentDefaults ?? { kind: record.kind ?? "shape" },
        ...(record.designOverrides
          ? { designOverrides: clone(record.designOverrides) }
          : {}),
        ...(typeof record.opacity === "number"
          ? { opacity: record.opacity }
          : {}),
        ...(typeof record.rotation === "number"
          ? { rotation: record.rotation }
          : {}),
        ...(typeof record.locked === "boolean"
          ? { locked: record.locked }
          : {}),
        ...(typeof record.name === "string" ? { name: record.name } : {}),
      };
    }),
  };
}

function deckFromPackageSource(
  source: PackageDeckSource,
): Record<string, unknown> {
  const tokenSet = clone(source.tokenSet);
  return {
    schemaVersion: 6,
    canvas: { format: "16:9" },
    design: {
      themeId: source.id,
      themeOverrides: {
        tokenSet: { ...tokenSet, id: source.id, name: source.name },
      },
    },
    masters: clone(source.masters),
    defaultMasterId: source.defaultMasterId,
    slides: source.templates.map((template, index) =>
      slideFromPackageTemplate(template, index),
    ),
  };
}

for (const packageId of THEME_PACKAGE_SOURCE_IDS) {
  const file = `${packageId}.deck.json`;
  const packageFile = `${packageId}.package.json`;
  let packageSource: PackageDeckSource;
  try {
    packageSource = readPackageSource(packageFile);
  } catch (error) {
    failures += 1;
    console.error(
      `✗ ${packageId} package source failed to read: ${error instanceof Error ? error.message : String(error)}`,
    );
    continue;
  }

  if (packageSource.id !== packageId) {
    failures += 1;
    console.error(
      `✗ ${packageFile} id mismatch: expected ${packageId}, found ${packageSource.id}`,
    );
    continue;
  }

  const templateIds = new Set(
    packageSource.templates.map((template) => template.id),
  );
  for (const kind of THEME_PACKAGE_TEMPLATE_KINDS) {
    const expected = `theme:${packageId}:${kind}`;
    if (!templateIds.has(expected)) {
      failures += 1;
      console.error(`✗ ${packageId} missing package template ${expected}`);
    }
  }

  const deck = deckFromPackageSource(packageSource);
  const result = safeParseDeck(deck);
  if (!result.success) {
    failures += 1;
    console.error(
      `✗ ${packageId} preview deck FAILED schema validation: ${result.error}`,
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
      `✗ ${packageId} package source FAILED schema validation: ${packageValidation.error}`,
    );
    continue;
  }

  writeFileSync(
    join(outDir, file),
    `${JSON.stringify(result.data, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(runtimeOutDir, packageFile),
    `${JSON.stringify(packageSource, null, 2)}\n`,
    "utf8",
  );

  const tokenTypography =
    (packageSource.tokenSet.typography as
      | Record<string, unknown>
      | undefined) ?? {};
  manifest.push({
    id: packageSource.id,
    name: packageSource.name,
    tagline: packageSource.tagline,
    file: `decks/${file}`,
    packageFile: `packages/${packageFile}`,
    slides: result.data.slides.length,
    fonts: {
      heading: String(tokenTypography.headingFontFamily ?? ""),
      body: String(tokenTypography.fontFamily ?? ""),
    },
    accent: packageSource.accent,
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
    `✓ ${packageSource.name.padEnd(24)} valid — packages/${packageFile} → decks/${file}`,
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
  console.error(`\n${failures} theme package(s) failed validation.`);
  process.exit(1);
}
console.log(`\nAll ${manifest.length} theme packages validated and written.`);
