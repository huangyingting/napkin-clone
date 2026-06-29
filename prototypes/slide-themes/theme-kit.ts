import {
  SEMANTIC_TO_RENDER_FAMILY,
  THEME_PACKAGE_TEMPLATE_KINDS,
  THEME_PACKAGE_TEMPLATE_METADATA,
  type ThemePackageRenderFamily,
  type ThemePackageTemplateKind,
  type ThemePackageTemplateMetadata,
} from "@/lib/presentation/theme-template-taxonomy";
import { familySlide } from "./render-family-layouts";

/**
 * Shared authoring kit for the eight professional slide themes.
 *
 * Pure data builders that emit v6 deck JSON. Geometry is expressed in slide
 * percentages (0–100); text `fontSize` is a percent of slide height, matching
 * the conventions in `src/lib/presentation/slide-templates.ts`. Decorative
 * shapes live on slides (masters are chrome-only in the v6 schema), which is
 * how the themes get their individual personality.
 */

export type Hex = string;

export interface ThemePalette {
  slideBg: Hex;
  surface: Hex;
  accent: Hex;
  onBg: Hex;
  onSurface: Hex;
  onAccent: Hex;
  muted: Hex;
  /** Extra decorative colors used only by shape layers. */
  deco: Hex[];
}

export interface ThemeFonts {
  /** Slide fontId for headings (must be a registry id). */
  heading: string;
  /** Slide fontId for body copy (must be a registry id). */
  body: string;
  /** CSS family for headings (theme typography token). */
  headingCss: string;
  /** CSS family for body (theme typography token). */
  bodyCss: string;
}

export type Box = { x: number; y: number; w: number; h: number };

export type ShapeKind =
  | "rect"
  | "square"
  | "circle"
  | "ellipse"
  | "line"
  | "triangle"
  | "diamond";

export type ColorToken =
  | "slideBg"
  | "surface"
  | "accent"
  | "onBg"
  | "onSurface"
  | "onAccent"
  | "muted";

export type ColorRef = { token: ColorToken } | { value: Hex };

export type Fill =
  | ColorRef
  | {
      type: "radialGradient";
      inner: ColorRef;
      outer: ColorRef;
      cx?: number;
      cy?: number;
      r?: number;
    };

export type ShapeEffect = {
  kind: "glass";
  intensity: "light" | "medium" | "strong";
};

export type BackgroundTreatment =
  | { type: "solid"; color: Hex | ColorRef }
  | {
      type: "gradient";
      from: Hex | ColorRef;
      to: Hex | ColorRef;
      angle?: number;
    }
  | {
      type: "radialGradient";
      inner: Hex | ColorRef;
      outer: Hex | ColorRef;
      cx?: number;
      cy?: number;
      r?: number;
    };

export interface ThemeVisualLanguage {
  surface: "flat" | "glass" | "paper" | "ink";
  backgroundMode: "quiet" | "radial" | "field" | "split";
  motifShapes: {
    primary: ShapeKind;
    secondary: ShapeKind;
    accent: ShapeKind;
  };
  card: {
    fill: "surface" | "glass" | "slideBg";
    radius: number;
    stroke?: boolean;
  };
  image: {
    maskShape:
      | "rect"
      | "rounded"
      | "circle"
      | "ellipse"
      | "diamond"
      | "triangle";
    radius?: number;
  };
}

export const token = (value: ColorToken): ColorRef => ({ token: value });
export const value = (hex: Hex): ColorRef => ({ value: hex });

function colorRef(input: Hex | ColorRef): ColorRef {
  return typeof input === "string" ? { value: input } : input;
}

export function radialFill(
  inner: Hex | ColorRef,
  outer: Hex | ColorRef,
  options: { cx?: number; cy?: number; r?: number } = {},
): Fill {
  return {
    type: "radialGradient",
    inner: colorRef(inner),
    outer: colorRef(outer),
    ...options,
  };
}

let elementSeq = 0;
export function resetSeq(): void {
  elementSeq = 0;
}
function nextId(prefix: string): string {
  elementSeq += 1;
  return `${prefix}-${elementSeq.toString(36)}`;
}

/* ----------------------------------------------------------------------- *
 * Element builders
 * ----------------------------------------------------------------------- */

export interface TextStyleInput {
  fontSize: number;
  color: Hex;
  fontId?: string;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  lineHeight?: number;
  paragraphSpacing?: number;
  underline?: boolean;
}

export function text(opts: {
  zIndex: number;
  box: Box;
  role?: string;
  text?: string;
  paragraphs?: {
    text: string;
    listType?: "bullet" | "number";
    indent?: number;
  }[];
  style: TextStyleInput;
  name?: string;
  rotation?: number;
  opacity?: number;
  locked?: boolean;
}): Record<string, unknown> {
  const paragraphs = opts.paragraphs ?? [{ text: opts.text ?? "" }];
  const flat = paragraphs.map((p) => p.text).join("\n");
  return {
    id: nextId("t"),
    kind: "text",
    ...(opts.role ? { role: opts.role } : {}),
    box: opts.box,
    zIndex: opts.zIndex,
    ...(opts.rotation ? { rotation: opts.rotation } : {}),
    ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}),
    ...(opts.locked ? { locked: true } : {}),
    ...(opts.name ? { name: opts.name } : {}),
    content: { kind: "text", text: flat, paragraphs },
    designOverrides: {
      textStyle: {
        fontSize: opts.style.fontSize,
        bold: opts.style.bold ?? false,
        italic: opts.style.italic ?? false,
        align: opts.style.align ?? "left",
        color: opts.style.color,
        ...(opts.style.fontId ? { fontId: opts.style.fontId } : {}),
        ...(opts.style.verticalAlign
          ? { verticalAlign: opts.style.verticalAlign }
          : {}),
        ...(opts.style.lineHeight ? { lineHeight: opts.style.lineHeight } : {}),
        ...(opts.style.paragraphSpacing
          ? { paragraphSpacing: opts.style.paragraphSpacing }
          : {}),
        ...(opts.style.underline ? { underline: true } : {}),
      },
    },
  };
}

export function shape(opts: {
  zIndex: number;
  shape: ShapeKind;
  box: Box;
  fill?: Hex | Fill;
  stroke?: { color: Hex; width: number };
  radius?: number;
  effect?: ShapeEffect;
  opacity?: number;
  rotation?: number;
  dash?: boolean;
  name?: string;
  locked?: boolean;
}): Record<string, unknown> {
  const design: Record<string, unknown> = {};
  if (opts.fill)
    design.fill =
      typeof opts.fill === "string" ? { value: opts.fill } : opts.fill;
  if (opts.stroke) design.stroke = opts.stroke;
  if (opts.radius !== undefined) {
    design.radius = opts.radius;
  } else if (opts.shape === "rect" || opts.shape === "square") {
    design.radius = 0;
  }
  if (opts.effect) design.effect = opts.effect;
  if (opts.dash) design.dash = true;
  return {
    id: nextId("s"),
    kind: "shape",
    box: opts.box,
    zIndex: opts.zIndex,
    ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}),
    ...(opts.rotation ? { rotation: opts.rotation } : {}),
    ...(opts.locked ? { locked: true } : {}),
    ...(opts.name ? { name: opts.name } : {}),
    content: { kind: "shape", shape: opts.shape },
    ...(Object.keys(design).length > 0 ? { designOverrides: design } : {}),
  };
}

export function radialOrb(opts: {
  zIndex: number;
  box: Box;
  inner: Hex | ColorRef;
  outer: Hex | ColorRef;
  opacity?: number;
  shape?: "circle" | "ellipse";
  locked?: boolean;
  name?: string;
}): Record<string, unknown> {
  return shape({
    zIndex: opts.zIndex,
    shape: opts.shape ?? "circle",
    box: opts.box,
    fill: radialFill(opts.inner, opts.outer, { cx: 42, cy: 38, r: 72 }),
    opacity: opts.opacity ?? 0.22,
    locked: opts.locked ?? true,
    name: opts.name ?? "Radial orb",
  });
}

export function glassPanel(opts: {
  zIndex: number;
  box: Box;
  fill?: Hex | Fill;
  intensity?: ShapeEffect["intensity"];
  radius?: number;
  stroke?: { color: Hex; width: number };
  locked?: boolean;
  name?: string;
}): Record<string, unknown> {
  return shape({
    zIndex: opts.zIndex,
    shape: "rect",
    box: opts.box,
    fill: opts.fill ?? token("surface"),
    radius: opts.radius ?? 10,
    stroke: opts.stroke,
    effect: { kind: "glass", intensity: opts.intensity ?? "medium" },
    locked: opts.locked ?? true,
    name: opts.name ?? "Glass panel",
  });
}

export function motif(opts: {
  zIndex: number;
  shape: ShapeKind;
  box: Box;
  fill: Hex | Fill;
  opacity?: number;
  rotation?: number;
  radius?: number;
  locked?: boolean;
  name?: string;
}): Record<string, unknown> {
  return shape({
    zIndex: opts.zIndex,
    shape: opts.shape,
    box: opts.box,
    fill: opts.fill,
    opacity: opts.opacity,
    rotation: opts.rotation,
    radius: opts.radius,
    locked: opts.locked ?? true,
    name: opts.name ?? "Motif",
  });
}

export function visualLanguage(spec: ThemeSpec): ThemeVisualLanguage {
  if (spec.visualLanguage) return spec.visualLanguage;
  const radius = spec.cornerRadiusPt + 6;
  switch (spec.id) {
    case "clarity":
      return {
        surface: "glass",
        backgroundMode: "quiet",
        motifShapes: {
          primary: "square",
          secondary: "circle",
          accent: "diamond",
        },
        card: { fill: "glass", radius: spec.cornerRadiusPt, stroke: false },
        image: { maskShape: "rounded", radius: spec.cornerRadiusPt },
      };
    case "ocean":
      return {
        surface: "glass",
        backgroundMode: "radial",
        motifShapes: {
          primary: "circle",
          secondary: "ellipse",
          accent: "diamond",
        },
        card: { fill: "glass", radius, stroke: true },
        image: { maskShape: "rounded", radius },
      };
    case "aurora":
      return {
        surface: "glass",
        backgroundMode: "radial",
        motifShapes: {
          primary: "circle",
          secondary: "diamond",
          accent: "triangle",
        },
        card: { fill: "glass", radius, stroke: false },
        image: { maskShape: "rounded", radius },
      };
    case "monolith":
      return {
        surface: "ink",
        backgroundMode: "field",
        motifShapes: {
          primary: "square",
          secondary: "diamond",
          accent: "rect",
        },
        card: {
          fill: "glass",
          radius: Math.max(0, spec.cornerRadiusPt),
          stroke: true,
        },
        image: { maskShape: "rect", radius: spec.cornerRadiusPt },
      };
    case "editorial":
      return {
        surface: "paper",
        backgroundMode: "split",
        motifShapes: {
          primary: "square",
          secondary: "diamond",
          accent: "circle",
        },
        card: { fill: "glass", radius: spec.cornerRadiusPt, stroke: true },
        image: { maskShape: "rect", radius: spec.cornerRadiusPt },
      };
    case "noir":
      return {
        surface: "glass",
        backgroundMode: "radial",
        motifShapes: {
          primary: "diamond",
          secondary: "circle",
          accent: "triangle",
        },
        card: { fill: "glass", radius, stroke: true },
        image: { maskShape: "diamond", radius },
      };
    case "terra":
      return {
        surface: "paper",
        backgroundMode: "radial",
        motifShapes: {
          primary: "circle",
          secondary: "ellipse",
          accent: "diamond",
        },
        card: { fill: "glass", radius: radius + 4, stroke: false },
        image: { maskShape: "circle", radius },
      };
    case "pulse":
      return {
        surface: "glass",
        backgroundMode: "field",
        motifShapes: {
          primary: "triangle",
          secondary: "diamond",
          accent: "circle",
        },
        card: { fill: "glass", radius, stroke: true },
        image: { maskShape: "triangle", radius },
      };
    default:
      return {
        surface: "flat",
        backgroundMode: "quiet",
        motifShapes: {
          primary: "square",
          secondary: "circle",
          accent: "diamond",
        },
        card: { fill: "glass", radius, stroke: false },
        image: { maskShape: "rounded", radius },
      };
  }
}

/** A short uppercase "kicker" label often used above titles. */
export function kicker(
  zIndex: number,
  box: Box,
  label: string,
  color: Hex,
  fontId: string,
): Record<string, unknown> {
  return text({
    zIndex,
    box,
    role: "label",
    text: label,
    style: {
      fontSize: 2.2,
      color,
      fontId,
      bold: true,
      align: "left",
      verticalAlign: "middle",
    },
    name: "Kicker",
  });
}

export const IMAGE_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20800%20450%22%3E%3Crect%20width%3D%22800%22%20height%3D%22450%22%20fill%3D%22%23e9e9ee%22%2F%3E%3Cpath%20d%3D%22M300%20270l70-70%2055%2055%2040-40%2075%2075%22%20fill%3D%22none%22%20stroke%3D%22%2394949f%22%20stroke-width%3D%2214%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Ccircle%20cx%3D%22320%22%20cy%3D%22165%22%20r%3D%2226%22%20fill%3D%22%2394949f%22%2F%3E%3C%2Fsvg%3E";

export function image(opts: {
  zIndex: number;
  box: Box;
  radius?: number;
  fitMode?: "contain" | "cover";
  maskShape?: string;
  name?: string;
}): Record<string, unknown> {
  const design: Record<string, unknown> = {};
  if (opts.radius !== undefined) design.radius = opts.radius;
  if (opts.fitMode) design.fitMode = opts.fitMode;
  if (opts.maskShape) design.maskShape = opts.maskShape;
  return {
    id: nextId("img"),
    kind: "image",
    role: "image",
    box: opts.box,
    zIndex: opts.zIndex,
    ...(opts.name ? { name: opts.name } : {}),
    content: {
      kind: "image",
      src: IMAGE_PLACEHOLDER,
      alt: "Image placeholder",
    },
    ...(Object.keys(design).length > 0 ? { designOverrides: design } : {}),
  };
}

/* ----------------------------------------------------------------------- *
 * Theme + deck assembly
 * ----------------------------------------------------------------------- */

export interface ThemeSpec {
  id: string;
  name: string;
  tagline: string;
  palette: ThemePalette;
  fonts: ThemeFonts;
  cornerRadiusPt: number;
  shadowCss: string;
  visualLanguage?: ThemeVisualLanguage;
  defaultBackground: BackgroundTreatment;
  /** Master background treatment. */
  masterBackground: BackgroundTreatment;
  /** Builds the ordered slide list for the demo deck. */
  buildSlides: (spec: ThemeSpec) => Record<string, unknown>[];
}

export interface ThemeTemplateSourceSpec {
  kind: ThemePackageTemplateKind;
  renderFamily: ThemePackageRenderFamily;
  metadata: ThemePackageTemplateMetadata;
  buildSlide: (
    packageId: string,
    baseSlides: readonly Record<string, unknown>[],
  ) => Record<string, unknown>;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function baseSlideIndexForRenderFamily(
  family: ThemePackageRenderFamily,
): number {
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

function semanticSlideFromBase(
  packageId: string,
  kind: ThemePackageTemplateKind,
  baseSlides: readonly Record<string, unknown>[],
): Record<string, unknown> {
  const metadata = THEME_PACKAGE_TEMPLATE_METADATA[kind];
  const base = clone(
    baseSlides[baseSlideIndexForRenderFamily(metadata.renderFamily)] ??
      baseSlides[2] ??
      baseSlides[0] ??
      slide(`${packageId}-empty`, metadata.label, "blank", []),
  );
  return {
    ...base,
    id: `${packageId}-${kind}`,
    title: metadata.label,
    templateId: `theme:${packageId}:${kind}`,
  };
}

export function templateSourceSpecsForTheme(): ThemeTemplateSourceSpec[] {
  return THEME_PACKAGE_TEMPLATE_KINDS.map((kind) => {
    const metadata = THEME_PACKAGE_TEMPLATE_METADATA[kind];
    return {
      kind,
      renderFamily: SEMANTIC_TO_RENDER_FAMILY[kind],
      metadata,
      buildSlide: (packageId, baseSlides) =>
        semanticSlideFromBase(packageId, kind, baseSlides),
    };
  });
}

export function buildSemanticSlidesFromBase(
  packageId: string,
  baseSlides: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  return templateSourceSpecsForTheme().map((templateSpec) =>
    templateSpec.buildSlide(packageId, baseSlides),
  );
}

export function buildSemanticSlides(
  spec: ThemeSpec,
): Record<string, unknown>[] {
  const baseSlides = spec.buildSlides(spec);
  return THEME_PACKAGE_TEMPLATE_KINDS.map((kind) => {
    const metadata = THEME_PACKAGE_TEMPLATE_METADATA[kind];
    const designed = familySlide(
      spec,
      kind,
      metadata.renderFamily,
      metadata.label,
    );
    return designed ?? semanticSlideFromBase(spec.id, kind, baseSlides);
  });
}

function roleTokens(spec: ThemeSpec): Record<string, unknown> {
  const { palette, fonts } = spec;
  return {
    title: {
      fontFamily: fonts.headingCss,
      fontSize: 40,
      color: palette.onBg,
      weight: 800,
      align: "left",
      lineHeight: 1.05,
    },
    sectionTitle: {
      fontFamily: fonts.headingCss,
      fontSize: 34,
      color: palette.onBg,
      weight: 800,
      align: "left",
      lineHeight: 1.05,
    },
    subtitle: {
      fontFamily: fonts.bodyCss,
      fontSize: 20,
      color: palette.muted,
      weight: 400,
      align: "left",
      lineHeight: 1.3,
    },
    body: {
      fontFamily: fonts.bodyCss,
      fontSize: 16,
      color: palette.onSurface,
      weight: 400,
      align: "left",
      lineHeight: 1.45,
    },
    bullet: {
      fontFamily: fonts.bodyCss,
      fontSize: 15,
      color: palette.onSurface,
      weight: 400,
      align: "left",
      lineHeight: 1.5,
    },
    quote: {
      fontFamily: fonts.headingCss,
      fontSize: 26,
      color: palette.onBg,
      weight: 600,
      italic: true,
      align: "left",
      lineHeight: 1.3,
    },
    caption: {
      fontFamily: fonts.bodyCss,
      fontSize: 11,
      color: palette.muted,
      weight: 500,
      align: "left",
    },
    label: {
      fontFamily: fonts.headingCss,
      fontSize: 11,
      color: palette.accent,
      weight: 700,
      align: "left",
    },
    footer: {
      fontFamily: fonts.bodyCss,
      fontSize: 9,
      color: palette.muted,
      weight: 500,
      align: "left",
    },
    pageNumber: {
      fontFamily: fonts.bodyCss,
      fontSize: 9,
      color: palette.muted,
      weight: 600,
      align: "right",
    },
  };
}

function tokenSet(spec: ThemeSpec): Record<string, unknown> {
  const { palette, fonts } = spec;
  return {
    id: `pro-${spec.id}`,
    name: spec.name,
    colors: {
      slideBg: palette.slideBg,
      surface: palette.surface,
      accent: palette.accent,
      onBg: palette.onBg,
      onSurface: palette.onSurface,
      onAccent: palette.onAccent,
      muted: palette.muted,
    },
    typography: {
      fontFamily: fonts.bodyCss,
      headingFontFamily: fonts.headingCss,
      scale: { h1: 40, h2: 32, h3: 22, body: 16, list: 15, footer: 10 },
      roles: roleTokens(spec),
    },
    spacing: { slidePaddingPt: 40, gridUnitPt: 6 },
    shape: {
      cornerRadiusPt: spec.cornerRadiusPt,
      shadowCss: spec.shadowCss,
      fill: palette.accent,
    },
    defaultBackground: spec.defaultBackground,
  };
}

export function buildDeck(spec: ThemeSpec): Record<string, unknown> {
  resetSeq();
  const slides = buildSemanticSlides(spec).map((slide, index) => ({
    ...slide,
    index,
  }));
  return {
    schemaVersion: 6,
    canvas: { format: "16:9" },
    design: {
      themeId: `pro-${spec.id}`,
      themeOverrides: { tokenSet: tokenSet(spec) },
    },
    masters: [
      {
        id: `master-${spec.id}`,
        name: `${spec.name} Master`,
        background: bg(spec.masterBackground),
        elements: [
          {
            id: "footer",
            kind: "text",
            role: "footer",
            masterChromeKind: "footer",
            layer: "foreground",
            locked: true,
            zIndex: 0,
            box: { x: 5, y: 93.5, w: 60, h: 4 },
            content: {
              kind: "text",
              text: spec.name.toUpperCase(),
              paragraphs: [{ text: spec.name.toUpperCase() }],
            },
            designOverrides: {
              textStyle: {
                fontSize: 1.7,
                bold: true,
                italic: false,
                align: "left",
                color: spec.palette.muted,
                fontId: spec.fonts.heading,
              },
            },
          },
          {
            id: "page-number",
            kind: "text",
            role: "pageNumber",
            masterChromeKind: "pageNumber",
            layer: "foreground",
            locked: true,
            zIndex: 0,
            box: { x: 88, y: 93.5, w: 7, h: 4 },
            content: {
              kind: "text",
              text: "{{pageNumber}}",
              paragraphs: [{ text: "{{pageNumber}}" }],
            },
            designOverrides: {
              textStyle: {
                fontSize: 1.7,
                bold: true,
                italic: false,
                align: "right",
                color: spec.palette.muted,
                fontId: spec.fonts.body,
              },
            },
          },
        ],
      },
    ],
    defaultMasterId: `master-${spec.id}`,
    slides,
  };
}

function bg(t: BackgroundTreatment): Record<string, unknown> {
  if (t.type === "solid") return { type: "solid", color: colorRef(t.color) };
  if (t.type === "radialGradient") {
    return {
      type: "radialGradient",
      inner: colorRef(t.inner),
      outer: colorRef(t.outer),
      ...(t.cx !== undefined ? { cx: t.cx } : {}),
      ...(t.cy !== undefined ? { cy: t.cy } : {}),
      ...(t.r !== undefined ? { r: t.r } : {}),
    };
  }
  return {
    type: "gradient",
    from: colorRef(t.from),
    to: colorRef(t.to),
    ...(t.angle !== undefined ? { angle: t.angle } : {}),
  };
}

/** Wraps a list of elements into a slide record (index added later). */
export function slide(
  id: string,
  title: string,
  templateId: string,
  elements: Record<string, unknown>[],
  background?: BackgroundTreatment,
): Record<string, unknown> {
  return {
    id,
    index: 0,
    title,
    notes: "",
    templateId,
    ...(background ? { designOverrides: { background: bg(background) } } : {}),
    elements,
  };
}
