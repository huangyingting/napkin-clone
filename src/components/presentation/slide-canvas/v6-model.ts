import type {
  ConnectorElement,
  ConnectorPoint,
  ConnectorRouting,
  ElementAlign,
  ImageCrop,
  ImageElement,
  ImageFitMode,
  ImageMaskShape,
  Paragraph,
  ShapeElement,
  ShapeKind,
  Slide,
  SlideElement,
  TextElement,
  TextElementStyle,
  TextFitMode,
  TextRun,
  VisualElement,
} from "@/lib/presentation/deck";
import type {
  DeckTextRole,
  DeckThemeTokenSet,
} from "@/lib/presentation/deck-theme-tokens";

type V6Record = Record<string, unknown>;

function record(value: unknown): V6Record {
  return value && typeof value === "object" ? (value as V6Record) : {};
}

export function elementContent(element: SlideElement): V6Record {
  return record((element as { content?: unknown }).content);
}

export function elementDesignOverrides(element: SlideElement): V6Record {
  return record((element as { designOverrides?: unknown }).designOverrides);
}

export function slideDesignOverrides(slide: Slide): V6Record {
  return record((slide as { designOverrides?: unknown }).designOverrides);
}

export function colorRefValue(
  input: unknown,
  tokenSet: DeckThemeTokenSet,
): string | undefined {
  if (typeof input === "string") return input;
  const ref = record(input);
  if (typeof ref.value === "string") return ref.value;
  if (typeof ref.token === "string") {
    return tokenSet.colors[ref.token as keyof DeckThemeTokenSet["colors"]];
  }
  return undefined;
}

export function presentationRoleToDeckTextRole(
  role: unknown,
  fallback: DeckTextRole,
): DeckTextRole {
  switch (role) {
    case "title":
      return "h1";
    case "sectionTitle":
      return "h2";
    case "label":
      return "shapeLabel";
    case "subtitle":
    case "body":
    case "bullet":
    case "caption":
    case "footer":
    case "h1":
    case "h2":
    case "h3":
    case "shapeLabel":
      return role;
    default:
      return fallback;
  }
}

export function textContent(element: TextElement): {
  text: string;
  paragraphs: Paragraph[];
  runs?: TextRun[];
  fitMode?: TextFitMode;
  bulletGap?: number;
  bulletIndent?: number;
} {
  const content = elementContent(element);
  const text = typeof content.text === "string" ? content.text : "";
  const paragraphs = Array.isArray(content.paragraphs)
    ? (content.paragraphs as Paragraph[])
    : [{ text }];
  return {
    text,
    paragraphs,
    ...(Array.isArray(content.runs) ? { runs: content.runs as TextRun[] } : {}),
    ...(typeof content.fitMode === "string"
      ? { fitMode: content.fitMode as TextFitMode }
      : {}),
    ...(typeof content.bulletGap === "number"
      ? { bulletGap: content.bulletGap }
      : {}),
    ...(typeof content.bulletIndent === "number"
      ? { bulletIndent: content.bulletIndent }
      : {}),
  };
}

export function textDesign(element: TextElement): Partial<TextElementStyle> {
  return record(
    elementDesignOverrides(element).textStyle,
  ) as Partial<TextElementStyle>;
}

export function shapeContent(element: ShapeElement): {
  shape: ShapeKind;
  text?: string;
  textRuns?: TextRun[];
} {
  const content = elementContent(element);
  return {
    shape: content.shape as ShapeKind,
    ...(typeof content.text === "string" ? { text: content.text } : {}),
    ...(Array.isArray(content.textRuns)
      ? { textRuns: content.textRuns as TextRun[] }
      : {}),
  };
}

export function shapeTextDesign(
  element: ShapeElement,
): Partial<TextElementStyle> {
  return record(
    elementDesignOverrides(element).textStyle,
  ) as Partial<TextElementStyle>;
}

export function imageContent(element: ImageElement): {
  src?: string;
  alt?: string;
  crop?: ImageCrop;
} {
  const content = elementContent(element);
  return {
    ...(typeof content.src === "string" ? { src: content.src } : {}),
    ...(typeof content.alt === "string" ? { alt: content.alt } : {}),
    ...(content.crop !== undefined ? { crop: content.crop as ImageCrop } : {}),
  };
}

export function imageDesign(element: ImageElement): {
  fitMode?: ImageFitMode;
  maskShape?: ImageMaskShape;
  radius?: number;
} {
  const design = elementDesignOverrides(element);
  return {
    ...(typeof design.fitMode === "string"
      ? { fitMode: design.fitMode as ImageFitMode }
      : {}),
    ...(typeof design.maskShape === "string"
      ? { maskShape: design.maskShape as ImageMaskShape }
      : {}),
    ...(typeof design.radius === "number" ? { radius: design.radius } : {}),
  };
}

export function visualContent(element: VisualElement): {
  visualId: string;
  alt?: string;
  styleThemeId?: string;
} {
  const content = elementContent(element);
  const design = elementDesignOverrides(element);
  return {
    visualId: typeof content.visualId === "string" ? content.visualId : "",
    ...(typeof content.alt === "string" ? { alt: content.alt } : {}),
    ...(typeof design.styleThemeId === "string"
      ? { styleThemeId: design.styleThemeId }
      : typeof content.styleThemeId === "string"
        ? { styleThemeId: content.styleThemeId }
        : {}),
  };
}

export function connectorContent(element: ConnectorElement): {
  start: ConnectorPoint;
  end: ConnectorPoint;
  routing?: ConnectorRouting;
} {
  const content = elementContent(element);
  return {
    start: content.start as ConnectorPoint,
    end: content.end as ConnectorPoint,
    ...(typeof content.routing === "string"
      ? { routing: content.routing as ConnectorRouting }
      : {}),
  };
}

export function connectorDesign(element: ConnectorElement): {
  stroke?: { color: string; width: number };
  dash?: boolean;
  arrowStart?: ConnectorElement["arrowStart"];
  arrowEnd?: ConnectorElement["arrowEnd"];
} {
  const design = elementDesignOverrides(element);
  const stroke = record(design.stroke);
  return {
    ...(typeof stroke.color === "string" && typeof stroke.width === "number"
      ? { stroke: { color: stroke.color, width: stroke.width } }
      : {}),
    ...(typeof design.dash === "boolean" ? { dash: design.dash } : {}),
    ...(typeof design.arrowStart === "string"
      ? { arrowStart: design.arrowStart as ConnectorElement["arrowStart"] }
      : {}),
    ...(typeof design.arrowEnd === "string"
      ? { arrowEnd: design.arrowEnd as ConnectorElement["arrowEnd"] }
      : {}),
  };
}

export function textAlignOrDefault(
  value: ElementAlign | undefined,
  fallback: ElementAlign,
): ElementAlign {
  return value ?? fallback;
}
