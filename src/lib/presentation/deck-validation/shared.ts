import { DECK_THEMES, type DeckTheme } from "../deck-core";
import type {
  ElementAlign,
  ShapeKind,
  ConnectorAnchor,
  ConnectorArrow,
  ConnectorRouting,
  TextFitMode,
} from "../deck-elements";
import { SLIDE_LAYOUTS, type SlideLayoutHint } from "../deck-layouts-model";
import { SLIDE_FORMATS, type SlideFormat } from "../slide-format";

export class DeckValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeckValidationError";
  }
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isDeckTheme(value: unknown): value is DeckTheme {
  return typeof value === "string" && DECK_THEMES.includes(value as DeckTheme);
}

export function isSlideLayoutHint(value: unknown): value is SlideLayoutHint {
  return (
    typeof value === "string" &&
    SLIDE_LAYOUTS.includes(value as SlideLayoutHint)
  );
}

export function isSlideFormat(value: unknown): value is SlideFormat {
  return (
    typeof value === "string" && SLIDE_FORMATS.includes(value as SlideFormat)
  );
}

export function validateStringArray(value: unknown, context: string): string[] {
  if (!Array.isArray(value)) {
    throw new DeckValidationError(`${context} must be an array`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "string") {
      throw new DeckValidationError(`${context}[${index}] must be a string`);
    }
    return entry;
  });
}

export const ELEMENT_ALIGNS: readonly ElementAlign[] = [
  "left",
  "center",
  "right",
];
export const VERTICAL_ALIGNS = ["top", "middle", "bottom"] as const;
export type VerticalAlign = (typeof VERTICAL_ALIGNS)[number];
export const SHAPE_KINDS: readonly ShapeKind[] = [
  "rect",
  "ellipse",
  "line",
  "triangle",
];
export const CONNECTOR_ANCHORS: readonly ConnectorAnchor[] = [
  "center",
  "top",
  "bottom",
  "left",
  "right",
];
export const CONNECTOR_ROUTINGS: readonly ConnectorRouting[] = [
  "straight",
  "elbow",
];
export const CONNECTOR_ARROWS: readonly ConnectorArrow[] = [
  "none",
  "arrow",
  "filled",
];
export const TEXT_FIT_MODES: readonly TextFitMode[] = [
  "auto-height",
  "fixed-box",
  "shrink-to-fit",
];

export function validateFiniteNumber(value: unknown, context: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DeckValidationError(`${context} must be a finite number`);
  }
  return value;
}

/** Validates an opacity value, clamping to the `[0, 1]` range. */
export function validateOpacity(value: unknown, context: string): number {
  const n = validateFiniteNumber(value, context);
  return Math.max(0, Math.min(1, n));
}

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value);
}

export function validateUnitFraction(value: unknown, context: string): number {
  const n = validateFiniteNumber(value, context);
  if (n < 0 || n > 1) {
    throw new DeckValidationError(`${context} must be between 0 and 1`);
  }
  return n;
}
