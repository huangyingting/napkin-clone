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
import {
  LEGACY_THEME_PACKAGE_TEMPLATE_ALIASES,
  SEMANTIC_TO_RENDER_FAMILY,
  THEME_PACKAGE_TEMPLATE_KINDS,
  THEME_PACKAGE_TEMPLATE_METADATA,
  resolveThemePackageTemplateKind,
  templateCategoryForFamily,
  type LegacyThemePackageTemplateAlias,
  type ThemePackageTemplateGroup,
  type ThemePackageTemplateKind,
  type ThemePackageTemplateMetadata,
} from "./theme-template-taxonomy";

export {
  LEGACY_THEME_PACKAGE_TEMPLATE_ALIASES,
  SEMANTIC_TO_RENDER_FAMILY,
  THEME_PACKAGE_RENDER_FAMILIES,
  THEME_PACKAGE_TEMPLATE_GROUPS,
  THEME_PACKAGE_TEMPLATE_KINDS,
  THEME_PACKAGE_TEMPLATE_METADATA,
  isThemePackageTemplateKind,
  resolveThemePackageTemplateKind,
  type TemplateCapacity,
  type TemplateSlotBinding,
  type TemplateSlotKey,
  type ThemePackageRenderFamily,
  type ThemePackageTemplateGroup,
  type ThemePackageTemplateKind,
  type ThemePackageTemplateMetadata,
} from "./theme-template-taxonomy";

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

export interface PresentationThemePackage {
  id: ThemePackageId;
  name: string;
  tagline: string;
  accent: string;
  tokenSet: PresentationTheme;
  masters: SlideMaster[];
  defaultMasterId: string;
  templates: SlideTemplate[];
  templateMetadata: ThemePackageTemplateMetadata[];
}

type PackageDeckSource = {
  id: ThemePackageId;
  name: string;
  tagline: string;
  deck: Deck;
};

const PACKAGE_ID_SET = new Set<string>(THEME_PACKAGE_IDS);
const TEMPLATE_ID_KIND_SET = new Set<string>([
  ...THEME_PACKAGE_TEMPLATE_KINDS,
  ...LEGACY_THEME_PACKAGE_TEMPLATE_ALIASES,
]);
const PACKAGE_ALIASES: Record<string, ThemePackageId> = {
  default: DEFAULT_THEME_PACKAGE_ID,
};

const LEGACY_TEMPLATE_KIND_TO_BASE_INDEX: Record<
  LegacyThemePackageTemplateAlias,
  number
> = {
  "two-column": 3,
};

function baseTemplateIndex(kind: ThemePackageTemplateKind): number {
  const family = SEMANTIC_TO_RENDER_FAMILY[kind];
  switch (family) {
    case "cover":
      return 0;
    case "section-divider":
      return 1;
    case "two-column":
    case "before-after":
    case "problem-solution":
    case "pros-cons":
    case "matrix-2x2":
      return 3;
    case "quote-hero":
    case "stat-hero":
      return 4;
    case "closing":
      return 5;
    default:
      return 2;
  }
}

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

export function resolveThemePackageTemplateId(
  packageId: ThemePackageId,
  kind: ThemePackageTemplateKind | LegacyThemePackageTemplateAlias,
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
  kind: ThemePackageTemplateKind | LegacyThemePackageTemplateAlias,
  slide: Slide,
): SlideTemplate {
  const semanticKind = resolveThemePackageTemplateKind(kind) ?? "content";
  const metadata = THEME_PACKAGE_TEMPLATE_METADATA[semanticKind];
  const elements = [...(slide.elements ?? [])]
    .sort((a, b) => ((a as any).zIndex ?? 0) - ((b as any).zIndex ?? 0))
    .map(templateElementFromSlideElement);
  return {
    id: resolveThemePackageTemplateId(packageId, kind),
    name: kind === "two-column" ? "Two-column" : metadata.label,
    category: templateCategoryForFamily(metadata.renderFamily),
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
  const slideByTemplateId = new Map(
    slides
      .filter((slide) => typeof slide.templateId === "string")
      .map((slide) => [slide.templateId as string, slide]),
  );
  const semanticSlide = (kind: ThemePackageTemplateKind): Slide =>
    slideByTemplateId.get(resolveThemePackageTemplateId(source.id, kind)) ??
    slides[baseTemplateIndex(kind)] ??
    slides[2] ??
    slides[0]!;
  return {
    id: source.id,
    name: source.name,
    tagline: source.tagline,
    accent: tokenSet.colors.accent,
    tokenSet: { ...tokenSet, id: source.id, name: source.name },
    masters,
    defaultMasterId,
    templates: [
      ...THEME_PACKAGE_TEMPLATE_KINDS.map((kind) =>
        templateFromSlide(
          source.id,
          defaultMasterId,
          kind,
          semanticSlide(kind),
        ),
      ),
      ...LEGACY_THEME_PACKAGE_TEMPLATE_ALIASES.map((kind) =>
        templateFromSlide(
          source.id,
          defaultMasterId,
          kind,
          slides[LEGACY_TEMPLATE_KIND_TO_BASE_INDEX[kind]] ??
            slides[2] ??
            slides[0]!,
        ),
      ),
    ],
    templateMetadata: THEME_PACKAGE_TEMPLATE_KINDS.map((kind) =>
      clone(THEME_PACKAGE_TEMPLATE_METADATA[kind]),
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
    TEMPLATE_ID_KIND_SET.has(kind ?? "")
  );
}

export function getThemePackageTemplateMetadata(
  _packageId: string,
  kind: unknown,
): ThemePackageTemplateMetadata | undefined {
  const resolvedKind = resolveThemePackageTemplateKind(kind);
  return resolvedKind
    ? clone(THEME_PACKAGE_TEMPLATE_METADATA[resolvedKind])
    : undefined;
}

export function themePackageTemplateCatalogForAi(
  packageId: string,
): Array<
  Pick<
    ThemePackageTemplateMetadata,
    | "kind"
    | "label"
    | "group"
    | "priority"
    | "renderFamily"
    | "bestFor"
    | "avoidFor"
    | "signals"
    | "accepts"
    | "required"
    | "capacity"
  >
> {
  const themePackage = getThemePackage(packageId);
  if (!themePackage) return [];
  return themePackage.templateMetadata.map(
    ({ bindings: _bindings, ...metadata }) => clone(metadata),
  );
}

export function themePackageTemplateGroupsForUi(packageId: string): Array<{
  group: ThemePackageTemplateGroup;
  templates: ThemePackageTemplateMetadata[];
}> {
  const themePackage = getThemePackage(packageId);
  if (!themePackage) return [];
  const groups = new Map<
    ThemePackageTemplateGroup,
    ThemePackageTemplateMetadata[]
  >();
  for (const metadata of themePackage.templateMetadata) {
    const bucket = groups.get(metadata.group) ?? [];
    bucket.push(clone(metadata));
    groups.set(metadata.group, bucket);
  }
  return [...groups.entries()].map(([group, templates]) => ({
    group,
    templates: templates.sort((a, b) => a.priority - b.priority),
  }));
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

export function slideFromThemePackageTemplate(template: SlideTemplate): Slide {
  return {
    id: `preview-${template.id.replace(/[^a-z0-9-]+/gi, "-")}`,
    index: 0,
    title: template.name,
    notes: "",
    templateId: template.id,
    ...(template.defaultMasterId ? { masterId: template.defaultMasterId } : {}),
    ...(template.slideDesignDefaults
      ? { designOverrides: template.slideDesignDefaults }
      : {}),
    elements: template.elements.map((element, index) => ({
      id: element.id,
      kind: element.kind,
      ...(element.role ? { role: element.role } : {}),
      box: element.box ?? { x: 10, y: 10, w: 80, h: 20 },
      zIndex: index,
      content: element.contentDefaults ?? { kind: element.kind },
      ...(element.designOverrides
        ? { designOverrides: element.designOverrides }
        : {}),
      ...(typeof element.opacity === "number"
        ? { opacity: element.opacity }
        : {}),
      ...(typeof element.rotation === "number"
        ? { rotation: element.rotation }
        : {}),
      ...(typeof element.locked === "boolean"
        ? { locked: element.locked }
        : {}),
      ...(typeof element.name === "string" ? { name: element.name } : {}),
    })),
  } as unknown as Slide;
}

export function previewDeckForThemePackage(
  themePackage: PresentationThemePackage,
): Deck {
  return {
    schemaVersion: 6,
    canvas: { format: "16:9" },
    design: {
      themeId: themePackage.id,
      themeOverrides: { tokenSet: themePackage.tokenSet },
    },
    masters: themePackage.masters,
    defaultMasterId: themePackage.defaultMasterId,
    slides: [],
  } as Deck;
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
