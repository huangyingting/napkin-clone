import { GENERATED_DECK_MAX_SLIDES } from "@/lib/limits";
import {
  CURRENT_DECK_SCHEMA_VERSION,
  type Deck,
  type ElementAlign,
  type ElementBox,
  type SlideElement,
  type TableElement,
  type TableElementStyle,
  type TableCell,
  type TableColumn,
  type TableRow,
  type TextElementStyle,
} from "@/lib/presentation/deck";
import {
  normalizeGeneratedDeck,
  type VisualInventory,
} from "@/lib/presentation/deck-layout-assign";
import type { PresentationThemeId } from "@/lib/presentation/deck";

export const REPAIRED_DECK_MAX_SLIDES = GENERATED_DECK_MAX_SLIDES;

const DEFAULT_THEME = "indigo";
/* @preserve node:coverage ignore next 8 -- Template literal tuple is asserted through repairSlide; tsx maps tuple rows as uncovered. */
const SLIDE_TEMPLATE_IDS = [
  "title",
  "section",
  "content",
  "media",
  "two-column",
  "blank",
] as const;
type SlideTemplateId = (typeof SLIDE_TEMPLATE_IDS)[number];
const DEFAULT_TEMPLATE: SlideTemplateId = "blank";
const ELEMENT_ALIGNS: readonly ElementAlign[] = ["left", "center", "right"];
const GENERATED_TABLE_MIN_COLUMNS = 2;
const GENERATED_TABLE_MAX_COLUMNS = 4;
const GENERATED_TABLE_MIN_ROWS = 2;
const GENERATED_TABLE_MAX_ROWS = 6;
const GENERATED_TABLE_CELL_MAX_CHARS = 80;
const GENERATED_PRESENTATION_ROLES = [
  "title",
  "sectionTitle",
  "body",
  "bullet",
] as const;
type GeneratedPresentationRole = (typeof GENERATED_PRESENTATION_ROLES)[number];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value);
}

function fallbackElementId(
  zIndex: number,
  usedIds: ReadonlySet<string>,
): string {
  let suffix = zIndex + 1;
  let id = `el-${suffix}`;
  while (usedIds.has(id)) {
    suffix += 1;
    id = `el-${suffix}`;
  }
  return id;
}

function isGeneratedPresentationRole(
  value: unknown,
): value is GeneratedPresentationRole {
  return (
    typeof value === "string" &&
    (GENERATED_PRESENTATION_ROLES as readonly string[]).includes(value)
  );
}

/** Coerces an arbitrary box-ish value into a finite, in-range {@link ElementBox}. */
export function repairBox(input: unknown): ElementBox {
  const box = isPlainObject(input) ? input : {};
  const coord = (value: unknown, fallback: number): number =>
    clamp(isFiniteNumber(value) ? value : fallback, 0, 100);
  return {
    x: coord(box.x, 10),
    y: coord(box.y, 10),
    w: coord(box.w, 80),
    h: coord(box.h, 20),
  };
}

export function repairTextStyle(input: unknown): TextElementStyle {
  const style = isPlainObject(input) ? input : {};
  const align: ElementAlign = ELEMENT_ALIGNS.includes(
    style.align as ElementAlign,
  )
    ? (style.align as ElementAlign)
    : "left";
  return {
    fontSize: isFiniteNumber(style.fontSize) ? style.fontSize : 4.5,
    bold: Boolean(style.bold),
    italic: Boolean(style.italic),
    align,
    ...(isHexColor(style.color) ? { color: style.color } : {}),
  };
}

function textFromUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (isPlainObject(value) && typeof value.text === "string") return value.text;
  return "";
}

function tableColumnLabel(value: unknown): string {
  if (typeof value === "string") return value;
  if (isPlainObject(value) && typeof value.label === "string")
    return value.label;
  return "";
}

function repairTableStyle(input: unknown): TableElementStyle | undefined {
  if (!isPlainObject(input)) return undefined;
  const style: TableElementStyle = {};
  for (const key of ["headerFill", "rowFill", "alternateRowFill"] as const) {
    const ref = input[key];
    if (
      isPlainObject(ref) &&
      typeof ref.value === "string" &&
      isHexColor(ref.value)
    ) {
      style[key] = { value: ref.value };
    } else if (isPlainObject(ref) && typeof ref.token === "string") {
      style[key] = { token: ref.token };
    }
  }
  if (isHexColor(input.borderColor)) style.borderColor = input.borderColor;
  if (isFiniteNumber(input.borderWidth)) {
    style.borderWidth = Math.max(0, input.borderWidth);
  }
  if (isPlainObject(input.textStyle))
    style.textStyle = repairTextStyle(input.textStyle);
  if (isPlainObject(input.headerTextStyle)) {
    style.headerTextStyle = repairTextStyle(input.headerTextStyle);
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

function truncateCellText(
  text: string,
  overflow: string[],
  context: string,
): string {
  if (text.length <= GENERATED_TABLE_CELL_MAX_CHARS) return text;
  overflow.push(`${context}: ${text}`);
  return `${text.slice(0, GENERATED_TABLE_CELL_MAX_CHARS - 1)}…`;
}

function bulletsFromInvalidTable(
  base: { id: string; box: ElementBox; zIndex: number },
  caption: string | undefined,
  rows: string[][],
): SlideElement | undefined {
  const items = rows
    .map((row) =>
      row
        .filter((cell) => cell.trim().length > 0)
        .join(" — ")
        .trim(),
    )
    .filter((row) => row.length > 0);
  if (items.length === 0) return undefined;
  const text = items.join("\n");
  return {
    ...base,
    kind: "text",
    role: "bullet",
    content: {
      kind: "text",
      text: caption ? `${caption}\n${text}` : text,
      paragraphs: [
        ...(caption ? [{ text: caption }] : []),
        ...items.map((item) => ({ text: item, listType: "bullet" as const })),
      ],
    },
    designOverrides: { textStyle: repairTextStyle({ fontSize: 3.8 }) },
  } as unknown as SlideElement;
}

function repairTableElement(
  base: { id: string; box: ElementBox; zIndex: number },
  content: Record<string, unknown>,
  designOverrides: Record<string, unknown>,
): { element?: SlideElement; overflowNotes: string[] } {
  const overflowNotes: string[] = [];
  const caption =
    typeof content.caption === "string" ? content.caption : undefined;
  const rawColumns = Array.isArray(content.columns) ? content.columns : [];
  const columns = rawColumns.map(tableColumnLabel);
  const rawRows = Array.isArray(content.rows) ? content.rows : [];
  const rows = rawRows
    .map((row) => {
      if (Array.isArray(row)) return row.map(textFromUnknown);
      if (isPlainObject(row) && Array.isArray(row.cells)) {
        return row.cells.map(textFromUnknown);
      }
      return [];
    })
    .filter((row) => row.some((cell) => cell.trim().length > 0));

  if (
    columns.length < GENERATED_TABLE_MIN_COLUMNS ||
    rows.length < GENERATED_TABLE_MIN_ROWS
  ) {
    return {
      element: bulletsFromInvalidTable(base, caption, rows),
      overflowNotes,
    };
  }

  const keptColumns = columns.slice(0, GENERATED_TABLE_MAX_COLUMNS);
  if (columns.length > GENERATED_TABLE_MAX_COLUMNS) {
    overflowNotes.push(
      `Table omitted columns: ${columns.slice(GENERATED_TABLE_MAX_COLUMNS).join(", ")}`,
    );
  }
  const keptRows = rows.slice(0, GENERATED_TABLE_MAX_ROWS);
  if (rows.length > GENERATED_TABLE_MAX_ROWS) {
    overflowNotes.push(
      `Table omitted rows: ${rows
        .slice(GENERATED_TABLE_MAX_ROWS)
        .map((row) => row.join(" | "))
        .join("; ")}`,
    );
  }

  const tableColumns: TableColumn[] = keptColumns.map((label, index) => ({
    id: `col-${index + 1}`,
    label,
  }));
  const tableRows: TableRow[] = keptRows.map((row, rowIndex) => ({
    id: `row-${rowIndex + 1}`,
    cells: tableColumns.map((column, columnIndex): TableCell => {
      const text = row[columnIndex] ?? "";
      if (row.length > tableColumns.length) {
        const overflow = row.slice(tableColumns.length).join(" | ");
        if (overflow) {
          overflowNotes.push(
            `Table row ${rowIndex + 1} omitted cells: ${overflow}`,
          );
        }
      }
      return {
        text: truncateCellText(
          text,
          overflowNotes,
          `Table row ${rowIndex + 1}, column ${column.label || columnIndex + 1}`,
        ),
      };
    }),
  }));

  const tableStyle = repairTableStyle(designOverrides.tableStyle);
  return {
    element: {
      ...base,
      kind: "table",
      role: "table",
      content: {
        kind: "table",
        columns: tableColumns,
        rows: tableRows,
        ...(content.header !== undefined
          ? { header: Boolean(content.header) }
          : {}),
        ...(caption && caption.length > 0 ? { caption } : {}),
      },
      ...(tableStyle
        ? { designOverrides: { ...designOverrides, tableStyle } }
        : {}),
    } as unknown as TableElement,
    overflowNotes,
  };
}

function repairElementWithOverflow(
  input: unknown,
  zIndex: number,
  usedIds: ReadonlySet<string> = new Set<string>(),
): { element?: SlideElement; overflowNotes: string[] } {
  if (!isPlainObject(input)) {
    return { overflowNotes: [] };
  }

  let id =
    typeof input.id === "string" && input.id.length > 0
      ? input.id
      : fallbackElementId(zIndex, usedIds);
  if (usedIds.has(id)) {
    id = fallbackElementId(zIndex, usedIds);
  }

  const base = { id, box: repairBox(input.box), zIndex };
  const content = isPlainObject(input.content) ? input.content : {};
  const designOverrides = isPlainObject(input.designOverrides)
    ? input.designOverrides
    : {};

  if (input.kind === "table") {
    return repairTableElement(base, content, designOverrides);
  }

  return {
    element: repairElement(input, zIndex, usedIds),
    overflowNotes: [],
  };
}

/**
 * Normalizes one raw element into a schema-shaped element, regenerating its id
 * and clamping its box. Returns `undefined` for kinds we do not support or for a
 * `visual` element missing a usable `visualId` (those are dropped).
 */
export function repairElement(
  input: unknown,
  zIndex: number,
  usedIds: ReadonlySet<string> = new Set<string>(),
): SlideElement | undefined {
  if (!isPlainObject(input)) {
    return undefined;
  }

  let id =
    typeof input.id === "string" && input.id.length > 0
      ? input.id
      : fallbackElementId(zIndex, usedIds);
  if (usedIds.has(id)) {
    id = fallbackElementId(zIndex, usedIds);
  }

  const base = { id, box: repairBox(input.box), zIndex };
  const content = isPlainObject(input.content) ? input.content : {};
  const designOverrides = isPlainObject(input.designOverrides)
    ? input.designOverrides
    : {};

  switch (input.kind) {
    case "text": {
      const role: GeneratedPresentationRole = isGeneratedPresentationRole(
        input.role,
      )
        ? input.role
        : "body";
      const text = typeof content.text === "string" ? content.text : "";
      return {
        ...base,
        kind: "text",
        role,
        content: {
          kind: "text",
          text,
          paragraphs: Array.isArray(content.paragraphs)
            ? content.paragraphs
            : [{ text }],
          ...(Array.isArray(content.runs) ? { runs: content.runs } : {}),
        },
        designOverrides: {
          ...designOverrides,
          textStyle: repairTextStyle(
            isPlainObject(designOverrides.textStyle)
              ? designOverrides.textStyle
              : {},
          ),
        },
      } as unknown as SlideElement;
    }
    case "visual": {
      const visualId =
        typeof content.visualId === "string" ? content.visualId : "";
      if (visualId.length === 0) {
        return undefined;
      }
      const styleThemeId =
        typeof designOverrides.styleThemeId === "string"
          ? designOverrides.styleThemeId
          : typeof content.styleThemeId === "string"
            ? content.styleThemeId
            : undefined;
      return {
        ...base,
        kind: "visual",
        role: "visual",
        content: {
          kind: "visual",
          visualId,
          ...(styleThemeId && styleThemeId.length > 0 ? { styleThemeId } : {}),
          ...(typeof content.alt === "string" && content.alt.length > 0
            ? { alt: content.alt }
            : {}),
        },
      } as unknown as SlideElement;
    }
    case "table":
      return repairTableElement(base, content, designOverrides).element;
    default:
      return undefined;
  }
}

export interface RepairedSlide {
  id: string;
  index: number;
  title: string;
  templateId?: SlideTemplateId;
  notes: string;
  elements?: SlideElement[];
}

export function repairSlide(input: unknown, index: number): RepairedSlide {
  const slide = isPlainObject(input) ? input : {};

  const templateId = SLIDE_TEMPLATE_IDS.includes(
    slide.templateId as SlideTemplateId,
  )
    ? (slide.templateId as SlideTemplateId)
    : DEFAULT_TEMPLATE;

  const normalized: RepairedSlide = {
    /* node:coverage disable */
    /* Fallback slide id is asserted; tsx maps the multiline ternary as uncovered. */
    id:
      typeof slide.id === "string" && slide.id.length > 0
        ? slide.id
        : `sl-${index + 1}`,
    /* node:coverage enable */
    index,
    title: typeof slide.title === "string" ? slide.title : "",
    ...(templateId !== "blank" ? { templateId } : {}),
    notes: typeof slide.notes === "string" ? slide.notes : "",
  };

  if (Array.isArray(slide.elements)) {
    const usedIds = new Set<string>();
    const elements: SlideElement[] = [];
    const overflowNotes: string[] = [];
    for (const raw of slide.elements) {
      const { element, overflowNotes: elementOverflowNotes } =
        repairElementWithOverflow(raw, elements.length, usedIds);
      if (element) {
        usedIds.add(element.id);
        elements.push(element);
      }
      overflowNotes.push(...elementOverflowNotes);
    }
    normalized.elements = elements;
    if (overflowNotes.length > 0) {
      normalized.notes = [normalized.notes, "Table overflow:", ...overflowNotes]
        .filter((part) => part.length > 0)
        .join("\n");
    }
  }

  return normalized;
}

/**
 * Turns the raw parsed model payload into a repaired deck candidate: resolves
 * the presentation theme id, regenerates missing ids, repairs v6 elements, and caps the
 * slide count.
 */
export function repairDeck(
  parsed: unknown,
  inventory?: VisualInventory,
  preferredTheme?: PresentationThemeId,
): Deck | undefined {
  const candidate = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!isPlainObject(candidate) || !Array.isArray(candidate.slides)) {
    return undefined;
  }

  // Preserve any non-empty design.themeId from the model so the downstream
  // normalizer (normalizeGeneratedDeck) can apply the generic resolver
  // fallback — including substituting preferredTheme when the value is
  // unrecognised. Fall back to DEFAULT_THEME only when design.themeId is absent.
  const candidateDesign = isPlainObject(candidate.design)
    ? candidate.design
    : {};
  const rawThemeId =
    typeof candidateDesign.themeId === "string"
      ? candidateDesign.themeId.trim()
      : "";
  const themeId: string = rawThemeId.length > 0 ? rawThemeId : DEFAULT_THEME;

  const slides = candidate.slides
    .slice(0, REPAIRED_DECK_MAX_SLIDES)
    .map((slide, index) => repairSlide(slide, index));

  return normalizeGeneratedDeck(
    {
      slides,
      design: { themeId },
      schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    } as unknown as Deck,
    inventory,
    preferredTheme,
  );
}
