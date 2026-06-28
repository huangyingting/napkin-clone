import auroraDeckJson from "./theme-package-decks/aurora.deck.json";
import clarityDeckJson from "./theme-package-decks/clarity.deck.json";
import editorialDeckJson from "./theme-package-decks/editorial.deck.json";
import monolithDeckJson from "./theme-package-decks/monolith.deck.json";
import noirDeckJson from "./theme-package-decks/noir.deck.json";
import oceanDeckJson from "./theme-package-decks/ocean.deck.json";
import pulseDeckJson from "./theme-package-decks/pulse.deck.json";
import terraDeckJson from "./theme-package-decks/terra.deck.json";

import type {
  Deck,
  Slide,
  SlideMaster,
  SlideTemplate,
  SlideTemplateElement,
} from "./deck-core";
import type { SlideElement } from "./deck-elements";
import type { PresentationTheme } from "./presentation-theme-types";
import { resolveThemeTokens } from "./presentation-theme-resolvers";

export const THEME_PACKAGE_IDS = [
  "clarity",
  "ocean",
  "aurora",
  "monolith",
  "editorial",
  "noir",
  "terra",
  "pulse",
] as const;

export type ThemePackageId = (typeof THEME_PACKAGE_IDS)[number];

export const DEFAULT_THEME_PACKAGE_ID: ThemePackageId = "clarity";

export const THEME_PACKAGE_TEMPLATE_KINDS = [
  "cover",
  "section",
  "content",
  "two-column",
  "quote",
  "closing",
] as const;

export type ThemePackageTemplateKind =
  (typeof THEME_PACKAGE_TEMPLATE_KINDS)[number];

export interface PresentationThemePackage {
  id: ThemePackageId;
  name: string;
  tagline: string;
  accent: string;
  tokenSet: PresentationTheme;
  masters: SlideMaster[];
  defaultMasterId: string;
  templates: SlideTemplate[];
}

type PackageDeckSource = {
  id: ThemePackageId;
  name: string;
  tagline: string;
  deck: Deck;
};

const PACKAGE_ID_SET = new Set<string>(THEME_PACKAGE_IDS);
const TEMPLATE_KIND_SET = new Set<string>(THEME_PACKAGE_TEMPLATE_KINDS);
const PACKAGE_ALIASES: Record<string, ThemePackageId> = {
  default: DEFAULT_THEME_PACKAGE_ID,
};

const TEMPLATE_META: Record<
  ThemePackageTemplateKind,
  { name: string; category: SlideTemplate["category"] }
> = {
  cover: { name: "Cover", category: "title" },
  section: { name: "Section divider", category: "section" },
  content: { name: "Content", category: "content" },
  "two-column": { name: "Two-column", category: "comparison" },
  quote: { name: "Quote / stat", category: "content" },
  closing: { name: "Closing", category: "title" },
};

const PACKAGE_DECK_SOURCES: PackageDeckSource[] = [
  {
    id: "clarity",
    name: "Clarity",
    tagline: "Clean business layouts that keep the content in front.",
    deck: clarityDeckJson as unknown as Deck,
  },
  {
    id: "ocean",
    name: "Ocean",
    tagline: "Clear product and data layouts with blue-green depth.",
    deck: oceanDeckJson as unknown as Deck,
  },
  {
    id: "aurora",
    name: "Aurora",
    tagline: "Modern tech and SaaS keynote layouts.",
    deck: auroraDeckJson as unknown as Deck,
  },
  {
    id: "monolith",
    name: "Monolith",
    tagline: "Corporate and consulting layouts with crisp structure.",
    deck: monolithDeckJson as unknown as Deck,
  },
  {
    id: "editorial",
    name: "Editorial",
    tagline: "Magazine-style brand and report storytelling.",
    deck: editorialDeckJson as unknown as Deck,
  },
  {
    id: "noir",
    name: "Noir",
    tagline: "Premium dark pitch decks with amber accents.",
    deck: noirDeckJson as unknown as Deck,
  },
  {
    id: "terra",
    name: "Terra",
    tagline: "Research and sustainability decks with organic geometry.",
    deck: terraDeckJson as unknown as Deck,
  },
  {
    id: "pulse",
    name: "Pulse",
    tagline: "Launch and marketing layouts with high-contrast energy.",
    deck: pulseDeckJson as unknown as Deck,
  },
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function packageTemplateId(
  packageId: ThemePackageId,
  kind: ThemePackageTemplateKind,
): string {
  return `theme:${packageId}:${kind}`;
}

function templateElementFromSlideElement(
  element: SlideElement,
  index: number,
): SlideTemplateElement {
  const record = element as unknown as Record<string, unknown>;
  return {
    id:
      typeof record.id === "string"
        ? record.id
        : `template-element-${index + 1}`,
    kind: typeof record.kind === "string" ? record.kind : "shape",
    ...(typeof record.role === "string" ? { role: record.role } : {}),
    ...(record.box !== undefined ? { box: clone(record.box) } : {}),
    ...(record.content !== undefined
      ? { contentDefaults: clone(record.content as Record<string, unknown>) }
      : {}),
    ...(record.designOverrides !== undefined
      ? {
          designOverrides: clone(
            record.designOverrides as Record<string, unknown>,
          ),
        }
      : {}),
    ...(typeof record.opacity === "number" ? { opacity: record.opacity } : {}),
    ...(typeof record.rotation === "number"
      ? { rotation: record.rotation }
      : {}),
    ...(typeof record.locked === "boolean" ? { locked: record.locked } : {}),
    ...(typeof record.name === "string" ? { name: record.name } : {}),
  };
}

function templateFromSlide(
  packageId: ThemePackageId,
  masterId: string,
  kind: ThemePackageTemplateKind,
  slide: Slide,
): SlideTemplate {
  const meta = TEMPLATE_META[kind];
  const elements = [...(slide.elements ?? [])]
    .sort((a, b) => ((a as any).zIndex ?? 0) - ((b as any).zIndex ?? 0))
    .map(templateElementFromSlideElement);
  return {
    id: packageTemplateId(packageId, kind),
    name: meta.name,
    category: meta.category,
    defaultMasterId: masterId,
    ...(slide.designOverrides
      ? { slideDesignDefaults: clone(slide.designOverrides) }
      : {}),
    elements,
  };
}

function buildThemePackage(
  source: PackageDeckSource,
): PresentationThemePackage {
  const tokenSet = clone(
    ((source.deck as any).design?.themeOverrides?.tokenSet ??
      resolveThemeTokens("default")) as PresentationTheme,
  );
  const masters = clone(source.deck.masters ?? []);
  const defaultMasterId = source.deck.defaultMasterId ?? `master-${source.id}`;
  const slides = source.deck.slides ?? [];
  return {
    id: source.id,
    name: source.name,
    tagline: source.tagline,
    accent: tokenSet.colors.accent,
    tokenSet: { ...tokenSet, id: source.id, name: source.name },
    masters,
    defaultMasterId,
    templates: THEME_PACKAGE_TEMPLATE_KINDS.map((kind, index) =>
      templateFromSlide(source.id, defaultMasterId, kind, slides[index]!),
    ),
  };
}

export const THEME_PACKAGES: readonly PresentationThemePackage[] =
  PACKAGE_DECK_SOURCES.map(buildThemePackage);

const PACKAGE_BY_ID = new Map(
  THEME_PACKAGES.map((themePackage) => [themePackage.id, themePackage]),
);

export function isThemePackageId(value: unknown): value is ThemePackageId {
  return typeof value === "string" && PACKAGE_ID_SET.has(value);
}

export function resolveThemePackageId(
  packageId: string,
): ThemePackageId | undefined {
  if (isThemePackageId(packageId)) return packageId;
  return PACKAGE_ALIASES[packageId];
}

export function getThemePackage(
  packageId: string,
): PresentationThemePackage | undefined {
  const resolvedPackageId = resolveThemePackageId(packageId);
  return resolvedPackageId ? PACKAGE_BY_ID.get(resolvedPackageId) : undefined;
}

export function isThemePackageTemplateId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const [prefix, packageId, kind] = value.split(":");
  return (
    prefix === "theme" &&
    !!resolveThemePackageId(packageId ?? "") &&
    TEMPLATE_KIND_SET.has(kind ?? "")
  );
}

export function themePackageTemplatesForDeck(deck: Deck): SlideTemplate[] {
  const themeId = (deck as any).design?.themeId;
  if (typeof themeId !== "string") return [];
  const packageId = resolveThemePackageId(themeId);
  if (!packageId) return [];
  return (deck.customTemplates ?? []).filter(
    (template) =>
      template.id.startsWith(`theme:${packageId}:`) ||
      template.id.startsWith(`theme:${themeId}:`),
  );
}

export function applyThemePackage(deck: Deck, packageId: string): Deck | null {
  const themePackage = getThemePackage(packageId);
  if (!themePackage) return null;

  const customTemplates = [
    ...(deck.customTemplates ?? []).filter(
      (template) => !isThemePackageTemplateId(template.id),
    ),
    ...clone(themePackage.templates),
  ];
  const slides = deck.slides.map(
    (slide) =>
      ({ ...slide, masterId: themePackage.defaultMasterId }) as typeof slide,
  );

  return {
    ...deck,
    design: {
      ...((deck as any).design ?? {}),
      themeId: themePackage.id,
      themeOverrides: { tokenSet: clone(themePackage.tokenSet) },
    },
    masters: clone(themePackage.masters),
    defaultMasterId: themePackage.defaultMasterId,
    customTemplates,
    slides,
  } as Deck;
}
