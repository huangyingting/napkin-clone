import { REPAIRED_DECK_MAX_SLIDES } from "@/lib/ai/deck-repair";
import type { DeckVisualInventoryItem } from "@/lib/ai/deck-prompt";
import {
  THEME_PACKAGE_TEMPLATE_KINDS,
  resolveThemePackageTemplateKind,
  type ThemePackageTemplateKind,
} from "@/lib/presentation/theme-packages";

export interface GeneratedTableSlot {
  columns: string[];
  rows: string[][];
  caption?: string;
  emphasisColumn?: number;
}

export interface GeneratedSlideSlots {
  kicker?: string;
  title: string;
  subtitle?: string;
  body?: string;
  bullets?: string[];
  leftTitle?: string;
  leftBody?: string;
  leftBullets?: string[];
  rightTitle?: string;
  rightBody?: string;
  rightBullets?: string[];
  cards?: Array<{ title: string; body?: string; bullets?: string[] }>;
  steps?: Array<{ title: string; body?: string }>;
  quote?: string;
  attribution?: string;
  stat?: string;
  statLabel?: string;
  metrics?: Array<{ label: string; value: string; note?: string }>;
  table?: GeneratedTableSlot;
  visualId?: string;
  imagePrompt?: string;
  caption?: string;
}

export interface GeneratedPackageSlidePlan {
  title: string;
  templateKind: ThemePackageTemplateKind;
  selectionReason?: string;
  slots: GeneratedSlideSlots;
  notes?: string;
}

export interface GeneratedPackageDeckPlan {
  schemaVersion: 1;
  language: string;
  slides: GeneratedPackageSlidePlan[];
}

export interface RepairedPackageDeckPlan extends GeneratedPackageDeckPlan {
  selectedKindCounts: Record<string, number>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function stringArray(value: unknown, limit = 8): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .map((item) => stringValue(item))
    .filter((item) => item.length > 0)
    .slice(0, limit);
  return out.length > 0 ? out : undefined;
}

function normalizeTableSlot(
  value: unknown,
  notes: string[],
): GeneratedTableSlot | undefined {
  if (!isPlainObject(value)) return undefined;
  const rawColumns = stringArray(value.columns, 12) ?? [];
  const rawRows = Array.isArray(value.rows) ? value.rows : [];
  if (rawColumns.length < 2 || rawRows.length < 2) return undefined;

  const columns = rawColumns.slice(0, 4);
  if (rawColumns.length > 4) {
    notes.push(`Table omitted columns: ${rawColumns.slice(4).join(", ")}`);
  }

  const rows: string[][] = [];
  for (const rawRow of rawRows.slice(0, 6)) {
    const rawCells = Array.isArray(rawRow) ? rawRow : [];
    const cells = columns.map((_, index) => stringValue(rawCells[index]));
    if (rawCells.length > columns.length) {
      const overflow = rawCells
        .slice(columns.length)
        .map((cell) => stringValue(cell))
        .filter(Boolean)
        .join(" | ");
      if (overflow) notes.push(`Table omitted cells: ${overflow}`);
    }
    rows.push(
      cells.map((cell) => (cell.length > 80 ? `${cell.slice(0, 79)}…` : cell)),
    );
  }
  if (rawRows.length > 6) {
    notes.push(
      `Table omitted rows: ${rawRows
        .slice(6)
        .map((row) =>
          Array.isArray(row)
            ? row.map((cell) => stringValue(cell)).join(" | ")
            : "",
        )
        .filter(Boolean)
        .join("; ")}`,
    );
  }

  return {
    columns,
    rows,
    ...(stringValue(value.caption).length > 0
      ? { caption: stringValue(value.caption) }
      : {}),
    ...(typeof value.emphasisColumn === "number"
      ? { emphasisColumn: value.emphasisColumn }
      : {}),
  };
}

function normalizeSlots(
  value: unknown,
  fallbackTitle: string,
  visualIds: ReadonlySet<string>,
  notes: string[],
): GeneratedSlideSlots {
  const input = isPlainObject(value) ? value : {};
  const visualId = stringValue(input.visualId);
  const table = normalizeTableSlot(input.table, notes);
  return {
    title:
      stringValue(input.title, fallbackTitle) || fallbackTitle || "Untitled",
    ...(stringValue(input.kicker) ? { kicker: stringValue(input.kicker) } : {}),
    ...(stringValue(input.subtitle)
      ? { subtitle: stringValue(input.subtitle) }
      : {}),
    ...(stringValue(input.body) ? { body: stringValue(input.body) } : {}),
    ...(stringArray(input.bullets, 8)
      ? { bullets: stringArray(input.bullets, 8) }
      : {}),
    ...(stringValue(input.leftTitle)
      ? { leftTitle: stringValue(input.leftTitle) }
      : {}),
    ...(stringValue(input.leftBody)
      ? { leftBody: stringValue(input.leftBody) }
      : {}),
    ...(stringArray(input.leftBullets, 6)
      ? { leftBullets: stringArray(input.leftBullets, 6) }
      : {}),
    ...(stringValue(input.rightTitle)
      ? { rightTitle: stringValue(input.rightTitle) }
      : {}),
    ...(stringValue(input.rightBody)
      ? { rightBody: stringValue(input.rightBody) }
      : {}),
    ...(stringArray(input.rightBullets, 6)
      ? { rightBullets: stringArray(input.rightBullets, 6) }
      : {}),
    ...(stringValue(input.quote) ? { quote: stringValue(input.quote) } : {}),
    ...(stringValue(input.attribution)
      ? { attribution: stringValue(input.attribution) }
      : {}),
    ...(stringValue(input.stat) ? { stat: stringValue(input.stat) } : {}),
    ...(stringValue(input.statLabel)
      ? { statLabel: stringValue(input.statLabel) }
      : {}),
    ...(table ? { table } : {}),
    ...(visualIds.has(visualId) ? { visualId } : {}),
    ...(stringValue(input.imagePrompt)
      ? { imagePrompt: stringValue(input.imagePrompt) }
      : {}),
    ...(stringValue(input.caption)
      ? { caption: stringValue(input.caption) }
      : {}),
  };
}

export function repairPackageDeckPlan(
  parsed: unknown,
  visualInventory: ReadonlyArray<DeckVisualInventoryItem>,
): RepairedPackageDeckPlan | null {
  if (!isPlainObject(parsed) || !Array.isArray(parsed.slides)) return null;
  const visualIds = new Set(visualInventory.map((item) => item.id));
  const slides: GeneratedPackageSlidePlan[] = [];
  const selectedKindCounts: Record<string, number> = {};

  for (const rawSlide of parsed.slides.slice(0, REPAIRED_DECK_MAX_SLIDES)) {
    if (!isPlainObject(rawSlide)) continue;
    const title = stringValue(rawSlide.title) || "Untitled";
    const templateKind =
      resolveThemePackageTemplateKind(rawSlide.templateKind) ??
      (THEME_PACKAGE_TEMPLATE_KINDS.includes("content")
        ? "content"
        : THEME_PACKAGE_TEMPLATE_KINDS[0]);
    const overflowNotes: string[] = [];
    const slots = normalizeSlots(
      rawSlide.slots,
      title,
      visualIds,
      overflowNotes,
    );
    const notes = [stringValue(rawSlide.notes), ...overflowNotes]
      .filter((part) => part.length > 0)
      .join("\n");
    selectedKindCounts[templateKind] =
      (selectedKindCounts[templateKind] ?? 0) + 1;
    slides.push({
      title,
      templateKind,
      ...(stringValue(rawSlide.selectionReason)
        ? { selectionReason: stringValue(rawSlide.selectionReason) }
        : {}),
      slots,
      ...(notes ? { notes } : {}),
    });
  }

  if (slides.length === 0) return null;
  return {
    schemaVersion: 1,
    language: stringValue(parsed.language, "und"),
    slides,
    selectedKindCounts,
  };
}
