import {
  CURRENT_DECK_SCHEMA_VERSION,
  type ConnectorElement,
  type Deck,
  type ElementBox,
  type ImageElement,
  type LayoutPlaceholder,
  type Paragraph,
  type ShapeElement,
  type Slide,
  type SlideElement,
  type SourceRef,
  type TextElement,
  type TextElementStyle,
  type TextRun,
  type VisualElement,
  type SlideFormat,
} from "@/lib/presentation/deck";

export function buildElementBox(
  overrides: Partial<ElementBox> = {},
): ElementBox {
  return {
    x: overrides.x ?? 8,
    y: overrides.y ?? 8,
    w: overrides.w ?? 84,
    h: overrides.h ?? 16,
  };
}

export function buildTextStyle(
  overrides: Partial<TextElementStyle> = {},
): TextElementStyle {
  return {
    fontSize: overrides.fontSize ?? 4,
    bold: overrides.bold ?? false,
    italic: overrides.italic ?? false,
    align: overrides.align ?? "left",
    ...(overrides.underline !== undefined
      ? { underline: overrides.underline }
      : {}),
    ...(overrides.verticalAlign !== undefined
      ? { verticalAlign: overrides.verticalAlign }
      : {}),
    ...(overrides.lineHeight !== undefined
      ? { lineHeight: overrides.lineHeight }
      : {}),
    ...(overrides.paragraphSpacing !== undefined
      ? { paragraphSpacing: overrides.paragraphSpacing }
      : {}),
    ...(overrides.color !== undefined ? { color: overrides.color } : {}),
    ...(overrides.fontId !== undefined ? { fontId: overrides.fontId } : {}),
  };
}

export function buildSourceRef(overrides: Partial<SourceRef> = {}): SourceRef {
  return {
    documentId: overrides.documentId ?? "doc-fixture",
    blockId: overrides.blockId ?? "block-fixture",
    blockKind: overrides.blockKind ?? "text",
    linkedAt: overrides.linkedAt ?? "2026-06-22T17:49:04.676Z",
    ...("contentHash" in overrides
      ? overrides.contentHash !== undefined
        ? { contentHash: overrides.contentHash }
        : {}
      : { contentHash: "hash-fixture" }),
    ...(overrides.unlinked !== undefined
      ? { unlinked: overrides.unlinked }
      : {}),
  };
}

export function buildTextElement(
  overrides: Partial<TextElement> = {},
): TextElement {
  const text = overrides.text ?? "Fixture text";
  return {
    id: overrides.id ?? "text-fixture",
    kind: "text",
    text,
    paragraphs: overrides.paragraphs ?? [
      {
        text,
        ...(overrides.runs !== undefined && overrides.runs.length > 0
          ? { runs: overrides.runs }
          : {}),
      },
    ],
    zIndex: overrides.zIndex ?? 0,
    box: buildElementBox(overrides.box),
    style: buildTextStyle(overrides.style),
    ...(overrides.runs !== undefined ? { runs: overrides.runs } : {}),
    ...(overrides.textRole !== undefined
      ? { textRole: overrides.textRole }
      : {}),
    ...(overrides.styleOverride !== undefined
      ? { styleOverride: overrides.styleOverride }
      : {}),
    ...(overrides.fitMode !== undefined ? { fitMode: overrides.fitMode } : {}),
    ...(overrides.source !== undefined ? { source: overrides.source } : {}),
    ...(overrides.opacity !== undefined ? { opacity: overrides.opacity } : {}),
    ...(overrides.rotation !== undefined
      ? { rotation: overrides.rotation }
      : {}),
    ...(overrides.shadow !== undefined ? { shadow: overrides.shadow } : {}),
    ...(overrides.locked !== undefined ? { locked: overrides.locked } : {}),
    ...(overrides.hidden !== undefined ? { hidden: overrides.hidden } : {}),
    ...(overrides.name !== undefined ? { name: overrides.name } : {}),
    ...(overrides.groupId !== undefined ? { groupId: overrides.groupId } : {}),
    ...(overrides.bulletGap !== undefined
      ? { bulletGap: overrides.bulletGap }
      : {}),
    ...(overrides.bulletIndent !== undefined
      ? { bulletIndent: overrides.bulletIndent }
      : {}),
  };
}

type TextListOverrides = Partial<TextElement> & {
  bullets?: string[];
  bulletRuns?: TextRun[][];
  items?: Paragraph[];
};

export function buildBulletsElement(
  overrides: TextListOverrides = {},
): TextElement {
  const bullets = overrides.bullets ?? ["First point", "Second point"];
  const paragraphs = (
    overrides.paragraphs ??
    overrides.items ??
    bullets.map((text: string, index: number) => ({
      text,
      ...(overrides.bulletRuns?.[index] &&
      overrides.bulletRuns[index].length > 0
        ? { runs: overrides.bulletRuns[index] }
        : {}),
      listType: "bullet" as const,
    }))
  ).map((paragraph) => ({
    ...paragraph,
    listType: paragraph.listType ?? ("bullet" as const),
  }));
  return {
    id: overrides.id ?? "bullets-fixture",
    kind: "text",
    text: paragraphs.map((paragraph) => paragraph.text).join("\n"),
    paragraphs,
    zIndex: overrides.zIndex ?? 1,
    box: buildElementBox(overrides.box ?? { y: 28, h: 48 }),
    style: buildTextStyle(overrides.style),
    textRole: overrides.textRole ?? "bullet",
    ...(overrides.styleOverride !== undefined
      ? { styleOverride: overrides.styleOverride }
      : {}),
    ...(overrides.fitMode !== undefined ? { fitMode: overrides.fitMode } : {}),
    ...(overrides.bulletGap !== undefined
      ? { bulletGap: overrides.bulletGap }
      : {}),
    ...(overrides.bulletIndent !== undefined
      ? { bulletIndent: overrides.bulletIndent }
      : {}),
    ...(overrides.source !== undefined ? { source: overrides.source } : {}),
    ...(overrides.opacity !== undefined ? { opacity: overrides.opacity } : {}),
    ...(overrides.rotation !== undefined
      ? { rotation: overrides.rotation }
      : {}),
    ...(overrides.locked !== undefined ? { locked: overrides.locked } : {}),
    ...(overrides.hidden !== undefined ? { hidden: overrides.hidden } : {}),
    ...(overrides.name !== undefined ? { name: overrides.name } : {}),
    ...(overrides.groupId !== undefined ? { groupId: overrides.groupId } : {}),
  };
}

export function buildVisualElement(
  overrides: Partial<VisualElement> = {},
): VisualElement {
  return {
    id: overrides.id ?? "visual-element-fixture",
    kind: "visual",
    visualId: overrides.visualId ?? "visual-fixture",
    zIndex: overrides.zIndex ?? 2,
    box: buildElementBox(overrides.box ?? { x: 20, y: 22, w: 60, h: 56 }),
    ...(overrides.styleThemeId !== undefined
      ? { styleThemeId: overrides.styleThemeId }
      : {}),
    ...(overrides.alt !== undefined ? { alt: overrides.alt } : {}),
    ...(overrides.source !== undefined ? { source: overrides.source } : {}),
    ...(overrides.opacity !== undefined ? { opacity: overrides.opacity } : {}),
    ...(overrides.rotation !== undefined
      ? { rotation: overrides.rotation }
      : {}),
    ...(overrides.locked !== undefined ? { locked: overrides.locked } : {}),
    ...(overrides.hidden !== undefined ? { hidden: overrides.hidden } : {}),
    ...(overrides.name !== undefined ? { name: overrides.name } : {}),
    ...(overrides.groupId !== undefined ? { groupId: overrides.groupId } : {}),
  };
}

export function buildImageElement(
  overrides: Partial<ImageElement> = {},
): ImageElement {
  return {
    id: overrides.id ?? "image-fixture",
    kind: "image",
    src: overrides.src ?? "https://example.test/fixture.png",
    zIndex: overrides.zIndex ?? 2,
    box: buildElementBox(overrides.box ?? { x: 60, y: 30, w: 30, h: 30 }),
    ...(overrides.alt !== undefined ? { alt: overrides.alt } : {}),
    ...(overrides.radius !== undefined ? { radius: overrides.radius } : {}),
    ...(overrides.fitMode !== undefined ? { fitMode: overrides.fitMode } : {}),
    ...(overrides.maskShape !== undefined
      ? { maskShape: overrides.maskShape }
      : {}),
    ...(overrides.crop !== undefined ? { crop: overrides.crop } : {}),
    ...(overrides.assetId !== undefined ? { assetId: overrides.assetId } : {}),
    ...(overrides.source !== undefined ? { source: overrides.source } : {}),
    ...(overrides.opacity !== undefined ? { opacity: overrides.opacity } : {}),
    ...(overrides.rotation !== undefined
      ? { rotation: overrides.rotation }
      : {}),
    ...(overrides.shadow !== undefined ? { shadow: overrides.shadow } : {}),
    ...(overrides.locked !== undefined ? { locked: overrides.locked } : {}),
    ...(overrides.hidden !== undefined ? { hidden: overrides.hidden } : {}),
    ...(overrides.name !== undefined ? { name: overrides.name } : {}),
    ...(overrides.groupId !== undefined ? { groupId: overrides.groupId } : {}),
  };
}

export function buildShapeElement(
  overrides: Partial<ShapeElement> = {},
): ShapeElement {
  return {
    id: overrides.id ?? "shape-fixture",
    kind: "shape",
    shape: overrides.shape ?? "rect",
    color: overrides.color ?? "#123456",
    zIndex: overrides.zIndex ?? 3,
    box: buildElementBox(overrides.box ?? { x: 20, y: 20, w: 20, h: 20 }),
    ...(overrides.text !== undefined ? { text: overrides.text } : {}),
    ...(overrides.textRuns !== undefined
      ? { textRuns: overrides.textRuns }
      : {}),
    ...(overrides.textStyle !== undefined
      ? { textStyle: buildTextStyle(overrides.textStyle) }
      : {}),
    ...(overrides.textRole !== undefined
      ? { textRole: overrides.textRole }
      : {}),
    ...(overrides.textStyleOverride !== undefined
      ? { textStyleOverride: overrides.textStyleOverride }
      : {}),
    ...(overrides.stroke !== undefined ? { stroke: overrides.stroke } : {}),
    ...(overrides.radius !== undefined ? { radius: overrides.radius } : {}),
    ...(overrides.source !== undefined ? { source: overrides.source } : {}),
    ...(overrides.opacity !== undefined ? { opacity: overrides.opacity } : {}),
    ...(overrides.rotation !== undefined
      ? { rotation: overrides.rotation }
      : {}),
    ...(overrides.shadow !== undefined ? { shadow: overrides.shadow } : {}),
    ...(overrides.locked !== undefined ? { locked: overrides.locked } : {}),
    ...(overrides.hidden !== undefined ? { hidden: overrides.hidden } : {}),
    ...(overrides.name !== undefined ? { name: overrides.name } : {}),
    ...(overrides.groupId !== undefined ? { groupId: overrides.groupId } : {}),
  };
}

export function buildConnectorElement(
  overrides: Partial<ConnectorElement> = {},
): ConnectorElement {
  return {
    id: overrides.id ?? "connector-fixture",
    kind: "connector",
    zIndex: overrides.zIndex ?? 4,
    box: buildElementBox(overrides.box ?? { x: 0, y: 0, w: 100, h: 100 }),
    content: {
      kind: "connector",
      start: overrides.start ?? { x: 10, y: 20 },
      end: overrides.end ?? { x: 80, y: 70 },
      ...(overrides.routing !== undefined
        ? { routing: overrides.routing }
        : {}),
    },
    designOverrides: {
      ...(overrides.stroke !== undefined ? { stroke: overrides.stroke } : {}),
      ...(overrides.arrowStart !== undefined
        ? { arrowStart: overrides.arrowStart }
        : {}),
      ...(overrides.arrowEnd !== undefined
        ? { arrowEnd: overrides.arrowEnd }
        : {}),
      ...(overrides.dash !== undefined ? { dash: overrides.dash } : {}),
    },
    ...(overrides.opacity !== undefined ? { opacity: overrides.opacity } : {}),
    ...(overrides.source !== undefined ? { source: overrides.source } : {}),
  } as unknown as ConnectorElement;
}

export function buildPlaceholderElement(
  overrides: Partial<LayoutPlaceholder> = {},
): LayoutPlaceholder {
  return {
    id: overrides.id ?? "placeholder-fixture",
    placeholderType: overrides.placeholderType ?? "title",
    zIndex: overrides.zIndex ?? 0,
    box: buildElementBox(overrides.box),
    ...(overrides.label !== undefined ? { label: overrides.label } : {}),
  };
}

type SlideBuilderOverrides = Partial<Slide> & {
  titleRuns?: TextRun[];
  bullets?: string[];
  bulletRuns?: TextRun[][];
  visualIds?: string[];
  layout?: string;
  elementsDerived?: boolean;
  sourceSectionId?: string;
  background?: string;
  backgroundGradient?: { from: string; to: string; angle?: number };
  backgroundImage?: string;
  backgroundAssetId?: string;
  accent?: string;
  masterRef?: string;
};

type DeckBuilderOverrides = Partial<
  Omit<Deck, "schemaVersion" | "masters" | "slides">
> & {
  schemaVersion?: number;
  themeId?: string;
  slideFormat?: SlideFormat;
  customTokenSet?: unknown;
  masters?: unknown[];
  slides?: Array<Slide | SlideBuilderOverrides>;
};

export function buildSlide(overrides: SlideBuilderOverrides = {}): Slide {
  const title = overrides.title ?? "Fixture slide";
  return toV6Slide({
    id: overrides.id ?? "slide-fixture",
    index: overrides.index ?? 0,
    title,
    bullets: overrides.bullets ?? ["First point", "Second point"],
    visualIds: overrides.visualIds ?? [],
    layout: overrides.layout ?? "content",
    notes: overrides.notes ?? "",
    elements: overrides.elements ?? [
      buildTextElement({
        id: "slide-title",
        textRole: "title",
        text: title,
        style: { fontSize: 6, bold: true, italic: false, align: "left" },
      }),
      buildBulletsElement({ id: "slide-bullets" }),
    ],
    ...(overrides.titleRuns !== undefined
      ? { titleRuns: overrides.titleRuns }
      : {}),
    ...(overrides.bulletRuns !== undefined
      ? { bulletRuns: overrides.bulletRuns }
      : {}),
    ...(overrides.elementsDerived !== undefined
      ? { elementsDerived: overrides.elementsDerived }
      : {}),
    ...(overrides.sourceSectionId !== undefined
      ? { sourceSectionId: overrides.sourceSectionId }
      : {}),
    ...(overrides.background !== undefined
      ? { background: overrides.background }
      : {}),
    ...(overrides.backgroundGradient !== undefined
      ? { backgroundGradient: overrides.backgroundGradient }
      : {}),
    ...(overrides.backgroundImage !== undefined
      ? { backgroundImage: overrides.backgroundImage }
      : {}),
    ...(overrides.backgroundAssetId !== undefined
      ? { backgroundAssetId: overrides.backgroundAssetId }
      : {}),
    ...(overrides.accent !== undefined ? { accent: overrides.accent } : {}),
    ...(overrides.masterRef !== undefined
      ? { masterRef: overrides.masterRef }
      : {}),
  });
}

export function buildDeck(overrides: DeckBuilderOverrides = {}): Deck {
  const rawOverrides = overrides as any;
  const themeId =
    rawOverrides.design?.themeId ?? overrides.themeId ?? "default";
  const themeOverrides = {
    ...(rawOverrides.design?.themeOverrides ?? {}),
    ...(overrides.customTokenSet !== undefined
      ? { tokenSet: overrides.customTokenSet }
      : {}),
  };
  const slides = overrides.slides ?? [buildSlide()];
  return {
    schemaVersion: overrides.schemaVersion ?? CURRENT_DECK_SCHEMA_VERSION,
    canvas: {
      format: overrides.slideFormat ?? rawOverrides.canvas?.format ?? "16:9",
    },
    design: {
      themeId,
      ...(Object.keys(themeOverrides).length > 0 ? { themeOverrides } : {}),
    },
    masters: (overrides as any).masters ?? [
      { id: "master-default", name: "Default", elements: [] },
    ],
    defaultMasterId: (overrides as any).defaultMasterId ?? "master-default",
    slides: slides.map((slide) => toV6Slide(slide)) as Deck["slides"],
    ...(overrides.deckContentHash !== undefined
      ? { deckContentHash: overrides.deckContentHash }
      : {}),
  } as unknown as Deck;
}

function toV6Slide(slide: Slide | SlideBuilderOverrides): Slide {
  const raw = slide as any;
  const designOverrides: Record<string, unknown> = {
    ...(raw.designOverrides ?? {}),
  };
  if (raw.background !== undefined) {
    designOverrides.background = {
      type: "solid",
      color: { value: raw.background },
    };
  }
  if (raw.backgroundGradient !== undefined) {
    designOverrides.background = {
      type: "gradient",
      from: { value: raw.backgroundGradient.from },
      to: { value: raw.backgroundGradient.to },
      ...(raw.backgroundGradient.angle !== undefined
        ? { angle: raw.backgroundGradient.angle }
        : {}),
    };
  }
  if (raw.backgroundImage !== undefined) {
    designOverrides.background = {
      type: "image",
      url: raw.backgroundImage,
      ...(raw.backgroundAssetId !== undefined
        ? { assetId: raw.backgroundAssetId }
        : {}),
    };
  }
  if (raw.accent !== undefined) {
    designOverrides.accent = { value: raw.accent };
  }
  return {
    id: slide.id,
    index: slide.index,
    title: slide.title,
    ...(slide.notes !== undefined ? { notes: slide.notes } : {}),
    ...(raw.masterId !== undefined
      ? { masterId: raw.masterId }
      : raw.masterRef !== undefined
        ? { masterId: raw.masterRef }
        : {}),
    ...(raw.templateId !== undefined
      ? { templateId: raw.templateId }
      : raw.layout !== undefined && raw.layout !== "blank"
        ? { templateId: raw.layout }
        : {}),
    ...(Object.keys(designOverrides).length > 0 ? { designOverrides } : {}),
    ...(raw.source !== undefined
      ? { source: raw.source }
      : raw.sourceSectionId !== undefined
        ? { source: { sectionId: raw.sourceSectionId } }
        : {}),
    elements: (slide.elements ?? []).map((element) => toV6Element(element)),
  } as unknown as Slide;
}

function toV6Element(element: SlideElement): SlideElement {
  const raw = element as any;
  if (raw.content !== undefined) return element;
  const base = {
    id: raw.id,
    kind: raw.kind,
    role: raw.role ?? textRoleToPresentationRole(raw.textRole, raw.kind),
    box: raw.box,
    zIndex: raw.zIndex,
    ...(raw.locked !== undefined ? { locked: raw.locked } : {}),
    ...(raw.hidden !== undefined ? { hidden: raw.hidden } : {}),
    ...(raw.opacity !== undefined ? { opacity: raw.opacity } : {}),
    ...(raw.rotation !== undefined ? { rotation: raw.rotation } : {}),
    ...(raw.shadow !== undefined ? { shadow: raw.shadow } : {}),
    ...(raw.name !== undefined ? { name: raw.name } : {}),
    ...(raw.groupId !== undefined ? { groupId: raw.groupId } : {}),
    ...(raw.source !== undefined
      ? { source: raw.source }
      : raw.source !== undefined
        ? { source: raw.source }
        : {}),
  };
  if (raw.kind === "text") {
    return {
      ...base,
      content: {
        kind: "text",
        text: raw.text ?? "",
        paragraphs: raw.paragraphs ?? [{ text: raw.text ?? "" }],
        ...(raw.runs !== undefined ? { runs: raw.runs } : {}),
        ...(raw.fitMode !== undefined ? { fitMode: raw.fitMode } : {}),
        ...(raw.bulletGap !== undefined ? { bulletGap: raw.bulletGap } : {}),
        ...(raw.bulletIndent !== undefined
          ? { bulletIndent: raw.bulletIndent }
          : {}),
      },
      designOverrides: {
        textStyle: raw.style ?? raw.designOverrides?.textStyle,
      },
    } as unknown as SlideElement;
  }
  if (raw.kind === "visual") {
    return {
      ...base,
      role: "visual",
      content: {
        kind: "visual",
        visualId: raw.visualId,
        ...(raw.styleThemeId !== undefined
          ? { styleThemeId: raw.styleThemeId }
          : {}),
        ...(raw.alt !== undefined ? { alt: raw.alt } : {}),
      },
    } as unknown as SlideElement;
  }
  if (raw.kind === "image") {
    return {
      ...base,
      role: "image",
      content: {
        kind: "image",
        src: raw.src,
        ...(raw.assetId !== undefined ? { assetId: raw.assetId } : {}),
        ...(raw.alt !== undefined ? { alt: raw.alt } : {}),
        ...(raw.crop !== undefined ? { crop: raw.crop } : {}),
      },
      designOverrides: {
        ...(raw.fitMode !== undefined ? { fitMode: raw.fitMode } : {}),
        ...(raw.maskShape !== undefined ? { maskShape: raw.maskShape } : {}),
        ...(raw.radius !== undefined ? { radius: raw.radius } : {}),
      },
    } as unknown as SlideElement;
  }
  if (raw.kind === "shape") {
    return {
      ...base,
      role: raw.role ?? textRoleToPresentationRole(raw.textRole, raw.kind),
      content: {
        kind: "shape",
        shape: raw.shape,
        ...(raw.text !== undefined ? { text: raw.text } : {}),
        ...(raw.textRuns !== undefined ? { textRuns: raw.textRuns } : {}),
      },
      designOverrides: {
        fill: { value: raw.color },
        ...(raw.textStyle !== undefined ? { textStyle: raw.textStyle } : {}),
        ...(raw.textStyleOverride !== undefined
          ? { textStyle: raw.textStyleOverride }
          : {}),
        ...(raw.stroke !== undefined ? { stroke: raw.stroke } : {}),
        ...(raw.radius !== undefined ? { radius: raw.radius } : {}),
      },
    } as unknown as SlideElement;
  }
  if (raw.kind === "connector") {
    return {
      ...base,
      content: {
        kind: "connector",
        start: raw.start,
        end: raw.end,
        ...(raw.routing !== undefined ? { routing: raw.routing } : {}),
      },
      designOverrides: {
        ...(raw.stroke !== undefined ? { stroke: raw.stroke } : {}),
        ...(raw.dash !== undefined ? { dash: raw.dash } : {}),
        ...(raw.arrowStart !== undefined ? { arrowStart: raw.arrowStart } : {}),
        ...(raw.arrowEnd !== undefined ? { arrowEnd: raw.arrowEnd } : {}),
      },
    } as unknown as SlideElement;
  }
  return element;
}

function textRoleToPresentationRole(
  role: unknown,
  kind: unknown,
): string | undefined {
  if (kind === "visual") return "visual";
  if (kind === "image") return "image";
  switch (role) {
    case "h1":
      return "title";
    case "h2":
      return "sectionTitle";
    case "shapeLabel":
      return "label";
    default:
      return typeof role === "string" ? role : undefined;
  }
}

export function buildDeckWithElements(elements: SlideElement[]): Deck {
  return buildDeck({
    themeId: "indigo",
    slides: [
      buildSlide({
        id: "slide-elements",
        background: "#101010",
        accent: "#abcdef",
        elements,
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Lightweight factories — for tests that need a minimal Slide or Deck shape
// without the full element defaults from buildSlide/buildDeck.
// ---------------------------------------------------------------------------

/** Minimal slide with text elements identified only by their IDs. */
export function makeSlideWithElementIds(
  id: string,
  elementIds: string[] = [],
): Slide {
  return {
    id,
    index: 0,
    title: "",
    bullets: [],
    visualIds: [],
    layout: "content" as const,
    notes: "",
    elements: elementIds.map((eid) => ({
      id: eid,
      kind: "text" as const,
      role: "body" as const,
      text: "",
      zIndex: 0,
      box: { x: 0, y: 0, w: 100, h: 10 },
      style: {
        fontSize: 4.5,
        bold: false,
        italic: false,
        align: "left" as const,
      },
    })) as SlideElement[],
  } as unknown as Slide;
}

/** Minimal slide with explicit id/index/title and no elements. */
export function makeMinimalSlide(
  id: string,
  index: number,
  title: string,
): Slide {
  return {
    id,
    index,
    title,
    notes: "",
    elements: [],
  };
}

/** Minimal deck wrapping an array of slides (themeId "default"). */
export function makeMinimalDeck(slides: Slide[]): Deck {
  return buildDeck({ slides });
}

/**
 * Minimal deck built from an array of slide IDs.
 * Each slide gets a sequential index and a generic title.
 */
export function makeDeckFromIds(slideIds: string[]): Deck {
  return buildDeck({
    slides: slideIds.map((id, index) =>
      buildSlide({
        id,
        index,
        title: `Slide ${index + 1}`,
        layout: "blank",
        notes: "",
      }),
    ),
  });
}
