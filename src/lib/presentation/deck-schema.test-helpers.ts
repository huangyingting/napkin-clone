import { CURRENT_DECK_SCHEMA_VERSION } from "./deck";

type RawObject = Record<string, unknown>;

const textRoleMap: Record<string, string> = {
  h1: "title",
  h2: "sectionTitle",
  h3: "body",
  subtitle: "subtitle",
  body: "body",
  bullet: "bullet",
  caption: "caption",
  footer: "footer",
  shapeLabel: "label",
};

export function currentDeck(): unknown {
  return {
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    canvas: { format: "16:9" },
    design: { themeId: "default" },
    masters: [{ id: "master-default", name: "Default", elements: [] }],
    defaultMasterId: "master-default",
    slides: [
      {
        id: "sl-current",
        index: 0,
        title: "Current",
        elements: [
          toV6Element({
            id: "txt-1",
            kind: "text",
            text: "Current",
            textRole: "h1",
            zIndex: 0,
            box: { x: 6, y: 6, w: 88, h: 16 },
            style: { fontSize: 6, bold: true, italic: false, align: "left" },
          }),
        ],
      },
    ],
  };
}

export function slideFixture(
  overrides: RawObject = {},
): RawObject {
  return {
    id: "sl-fixture",
    index: 0,
    title: "",
    elements: [],
    ...overrides,
  };
}

export function elementDeck(elements: unknown[]): unknown {
  return {
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    canvas: { format: "16:9" },
    design: { themeId: "indigo" },
    masters: [{ id: "master-default", name: "Default", elements: [] }],
    defaultMasterId: "master-default",
    slides: [
      slideFixture({
        id: "sl-element",
        designOverrides: {
          background: { type: "solid", color: { value: "#101010" } },
          accent: { value: "#abcdef" },
        },
        elements: elements.map((element) => toV6Element(element)),
      }),
    ],
  };
}

function toV6Element(input: unknown): RawObject {
  if (!isRecord(input)) return input as RawObject;
  const kind = typeof input.kind === "string" ? input.kind : undefined;
  const role =
    typeof input.role === "string"
      ? input.role
      : typeof input.textRole === "string"
        ? textRoleMap[input.textRole] ?? input.textRole
        : kind === "image" || kind === "visual"
          ? kind
          : undefined;
  const element: RawObject = {
    id: input.id,
    kind,
    ...(role !== undefined ? { role } : {}),
    box: input.box,
    zIndex: input.zIndex,
    ...(input.locked !== undefined ? { locked: input.locked } : {}),
    ...(input.hidden !== undefined ? { hidden: input.hidden } : {}),
    ...(input.source !== undefined
      ? { source: input.source }
      : input.sourceRef !== undefined
        ? { source: input.sourceRef }
        : {}),
  };
  const designOverrides = toDesignOverrides(input);
  if (designOverrides !== undefined) element.designOverrides = designOverrides;
  element.content = toContent(input, kind);
  return element;
}

function toContent(input: RawObject, kind: string | undefined): RawObject {
  if (isRecord(input.content)) return input.content;
  switch (kind) {
    case "text":
      return {
        kind,
        text: typeof input.text === "string" ? input.text : "",
        ...(input.paragraphs !== undefined ? { paragraphs: input.paragraphs } : {}),
        ...(input.runs !== undefined ? { runs: input.runs } : {}),
        ...(input.fitMode !== undefined ? { fitMode: input.fitMode } : {}),
        ...(input.bulletGap !== undefined ? { bulletGap: input.bulletGap } : {}),
        ...(input.bulletIndent !== undefined
          ? { bulletIndent: input.bulletIndent }
          : {}),
      };
    case "visual":
      return {
        kind,
        visualId: input.visualId,
        ...(input.alt !== undefined ? { alt: input.alt } : {}),
        ...(input.styleThemeId !== undefined
          ? { styleThemeId: input.styleThemeId }
          : {}),
      };
    case "image":
      return {
        kind,
        ...(input.src !== undefined ? { src: input.src } : {}),
        ...(input.assetId !== undefined ? { assetId: input.assetId } : {}),
        ...(input.alt !== undefined ? { alt: input.alt } : {}),
        ...(input.crop !== undefined ? { crop: input.crop } : {}),
      };
    case "shape":
      return {
        kind,
        shape: input.shape,
        ...(input.text !== undefined ? { text: input.text } : {}),
        ...(input.textRuns !== undefined ? { textRuns: input.textRuns } : {}),
      };
    case "connector":
      return {
        kind,
        start: input.start,
        end: input.end,
        ...(input.routing !== undefined ? { routing: input.routing } : {}),
      };
    default:
      return { kind };
  }
}

function toDesignOverrides(input: RawObject): RawObject | undefined {
  const designOverrides: RawObject = isRecord(input.designOverrides)
    ? { ...input.designOverrides }
    : {};
  if (input.style !== undefined) designOverrides.textStyle = input.style;
  if (input.styleOverride !== undefined) {
    designOverrides.textStyle = {
      ...(isRecord(designOverrides.textStyle) ? designOverrides.textStyle : {}),
      ...(isRecord(input.styleOverride) ? input.styleOverride : {}),
    };
  }
  if (input.textStyle !== undefined) designOverrides.textStyle = input.textStyle;
  if (input.textStyleOverride !== undefined) {
    designOverrides.textStyle = {
      ...(isRecord(designOverrides.textStyle) ? designOverrides.textStyle : {}),
      ...(isRecord(input.textStyleOverride) ? input.textStyleOverride : {}),
    };
  }
  if (typeof input.color === "string") {
    designOverrides.fill = { value: input.color };
  }
  if (input.stroke !== undefined) designOverrides.stroke = input.stroke;
  if (input.radius !== undefined) designOverrides.radius = input.radius;
  if (input.fitMode !== undefined && input.kind === "image") {
    designOverrides.fitMode = input.fitMode;
  }
  if (input.maskShape !== undefined) designOverrides.maskShape = input.maskShape;
  if (input.shadow !== undefined) designOverrides.shadow = input.shadow;
  if (input.arrowStart !== undefined) designOverrides.arrowStart = input.arrowStart;
  if (input.arrowEnd !== undefined) designOverrides.arrowEnd = input.arrowEnd;
  if (input.dash !== undefined) designOverrides.dash = input.dash;
  if (input.opacity !== undefined) designOverrides.opacity = input.opacity;

  return Object.keys(designOverrides).length > 0 ? designOverrides : undefined;
}

function isRecord(value: unknown): value is RawObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
