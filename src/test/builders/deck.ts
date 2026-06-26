import {
  CURRENT_DECK_SCHEMA_VERSION,
  type BulletsElement,
  type ConnectorElement,
  type Deck,
  type ElementBox,
  type ImageElement,
  type PlaceholderElement,
  type ShapeElement,
  type Slide,
  type SlideElement,
  type SourceRef,
  type TextElement,
  type TextElementStyle,
  type VisualElement,
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
  return {
    id: overrides.id ?? "text-fixture",
    kind: "text",
    role: overrides.role ?? "body",
    text: overrides.text ?? "Fixture text",
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
    ...(overrides.sourceRef !== undefined
      ? { sourceRef: overrides.sourceRef }
      : {}),
    ...(overrides.opacity !== undefined ? { opacity: overrides.opacity } : {}),
    ...(overrides.rotation !== undefined
      ? { rotation: overrides.rotation }
      : {}),
    ...(overrides.shadow !== undefined ? { shadow: overrides.shadow } : {}),
    ...(overrides.locked !== undefined ? { locked: overrides.locked } : {}),
    ...(overrides.hidden !== undefined ? { hidden: overrides.hidden } : {}),
    ...(overrides.name !== undefined ? { name: overrides.name } : {}),
    ...(overrides.groupId !== undefined ? { groupId: overrides.groupId } : {}),
    ...(overrides.layoutSlot !== undefined
      ? { layoutSlot: overrides.layoutSlot }
      : {}),
  };
}

export function buildBulletsElement(
  overrides: Partial<BulletsElement> = {},
): BulletsElement {
  const bullets = overrides.bullets ?? ["First point", "Second point"];
  return {
    id: overrides.id ?? "bullets-fixture",
    kind: "bullets",
    bullets,
    items: overrides.items ?? bullets.map((text) => ({ text })),
    zIndex: overrides.zIndex ?? 1,
    box: buildElementBox(overrides.box ?? { y: 28, h: 48 }),
    style: buildTextStyle(overrides.style),
    ...(overrides.bulletRuns !== undefined
      ? { bulletRuns: overrides.bulletRuns }
      : {}),
    ...(overrides.textRole !== undefined
      ? { textRole: overrides.textRole }
      : {}),
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
    ...(overrides.sourceRef !== undefined
      ? { sourceRef: overrides.sourceRef }
      : {}),
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
    ...(overrides.sourceRef !== undefined
      ? { sourceRef: overrides.sourceRef }
      : {}),
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
    ...(overrides.sourceRef !== undefined
      ? { sourceRef: overrides.sourceRef }
      : {}),
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
    ...(overrides.sourceRef !== undefined
      ? { sourceRef: overrides.sourceRef }
      : {}),
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
    start: overrides.start ?? { x: 10, y: 20 },
    end: overrides.end ?? { x: 80, y: 70 },
    ...(overrides.stroke !== undefined ? { stroke: overrides.stroke } : {}),
    ...(overrides.arrowStart !== undefined
      ? { arrowStart: overrides.arrowStart }
      : {}),
    ...(overrides.arrowEnd !== undefined
      ? { arrowEnd: overrides.arrowEnd }
      : {}),
    ...(overrides.dash !== undefined ? { dash: overrides.dash } : {}),
    ...(overrides.routing !== undefined ? { routing: overrides.routing } : {}),
    ...(overrides.opacity !== undefined ? { opacity: overrides.opacity } : {}),
    ...(overrides.sourceRef !== undefined
      ? { sourceRef: overrides.sourceRef }
      : {}),
  };
}

export function buildPlaceholderElement(
  overrides: Partial<PlaceholderElement> = {},
): PlaceholderElement {
  return {
    id: overrides.id ?? "placeholder-fixture",
    kind: "placeholder",
    placeholderType: overrides.placeholderType ?? "title",
    zIndex: overrides.zIndex ?? 0,
    box: buildElementBox(overrides.box),
    ...(overrides.label !== undefined ? { label: overrides.label } : {}),
    ...(overrides.sourceRef !== undefined
      ? { sourceRef: overrides.sourceRef }
      : {}),
  };
}

export function buildSlide(overrides: Partial<Slide> = {}): Slide {
  const title = overrides.title ?? "Fixture slide";
  return {
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
        role: "title",
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
  };
}

export function buildDeck(overrides: Partial<Deck> = {}): Deck {
  const themeId = overrides.themeId ?? "default";
  return {
    themeId,
    slideFormat: overrides.slideFormat ?? "16:9",
    schemaVersion: overrides.schemaVersion ?? CURRENT_DECK_SCHEMA_VERSION,
    slides: overrides.slides ?? [buildSlide()],
    ...(overrides.layouts !== undefined ? { layouts: overrides.layouts } : {}),
    ...(overrides.deckContentHash !== undefined
      ? { deckContentHash: overrides.deckContentHash }
      : {}),
    ...(overrides.masters !== undefined ? { masters: overrides.masters } : {}),
    ...(overrides.customTokenSet !== undefined
      ? { customTokenSet: overrides.customTokenSet }
      : {}),
  };
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
