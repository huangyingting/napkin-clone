/**
 * Slide Editor View Model — pure selector functions / computed view state.
 *
 * Each function takes raw state and returns a derived value. No JSX, no React
 * hooks, no side-effects — plain data transformations that are independently
 * unit-testable. Components and context wrappers call these instead of
 * inlining the derivation logic.
 */

import { assertNever } from "@/lib/assert-never";
import type { Slide, SlideElement } from "@/lib/presentation/deck";
import type { SlideThemeColors } from "@/lib/presentation/style-cascade";
import {
  slideBackgroundGradientValue,
  slideSolidBackgroundValue,
} from "@/components/presentation/v6-deck-ui";

// ── Slide selection ────────────────────────────────────────────────────────

/**
 * Clamps `selectedIndex` to a valid index within `slides`.
 * Ensures the selection never points past the end of the deck when slides are
 * removed.
 */
export function selectSafeSelectedIndex(
  slides: readonly Slide[],
  selectedIndex: number,
): number {
  return Math.min(selectedIndex, slides.length - 1);
}

/**
 * Whether any slide can be deleted. A deck must always retain at least one
 * slide, so deletion is only permitted when there are two or more.
 */
export function selectCanDeleteSlide(slides: readonly Slide[]): boolean {
  return slides.length > 1;
}

// ── Element selection ──────────────────────────────────────────────────────

/**
 * Returns the `SlideElement` whose `id` matches `effectiveSelectedElementId`,
 * or `null` when nothing is selected or the id is not found in the slide.
 */
export function selectSelectedElement(
  selectedSlide: Slide | undefined,
  effectiveSelectedElementId: string | null,
): SlideElement | null {
  return (
    selectedSlide?.elements?.find(
      (el) => el.id === effectiveSelectedElementId,
    ) ?? null
  );
}

/**
 * Human-readable type label for a slide element, used in live-region
 * announcements ("Text selected", "Image selected", etc.).
 */
export function selectElementTypeLabel(element: SlideElement): string {
  switch (element.kind) {
    case "text":
      return (element as { role?: string }).role === "title" ? "Title" : "Text";
    case "image":
      return "Image";
    case "shape":
      return "Shape";
    case "visual":
      return "Visual";
    case "connector":
      return "Connector";
    default:
      return assertNever(element);
  }
}

/**
 * Returns a concise, human-readable description of the current element
 * selection. Rendered in the top-toolbar status area and used as the
 * live-region announcement.
 *
 * - Multi-selection: "N elements selected"
 * - Single selection: "&lt;Type&gt; selected" (e.g. "Text selected")
 * - No selection: "No element selected"
 */
export function selectSelectionSummary(state: {
  effectiveSelectedElementId: string | null;
  effectiveSelectedElementIds: ReadonlySet<string>;
  selectedSlide: Slide | undefined;
}): string {
  const {
    effectiveSelectedElementId,
    effectiveSelectedElementIds,
    selectedSlide,
  } = state;
  if (effectiveSelectedElementIds.size > 1) {
    return `${effectiveSelectedElementIds.size} elements selected`;
  }
  if (!effectiveSelectedElementId || !selectedSlide?.elements) {
    return "No element selected";
  }
  const element = selectedSlide.elements.find(
    (candidate) => candidate.id === effectiveSelectedElementId,
  );
  return element
    ? `${selectElementTypeLabel(element)} selected`
    : "No element selected";
}

// ── Background preview ─────────────────────────────────────────────────────

/**
 * Returns the CSS inline-style object for the deck background preview swatch
 * rendered in the top toolbar.
 *
 * Priority: per-slide gradient > per-slide solid color > theme bg color.
 */
export function selectBackgroundPreviewStyle(
  selectedSlide: Slide | undefined,
  selectedTheme: SlideThemeColors,
): { background: string } | { backgroundColor: string } {
  const gradient = selectedSlide
    ? slideBackgroundGradientValue(selectedSlide)
    : undefined;
  if (gradient) {
    const angle = gradient.angle ?? 135;
    return {
      background: `linear-gradient(${angle}deg, ${gradient.from}, ${gradient.to})`,
    };
  }
  return {
    backgroundColor: selectedSlide
      ? (slideSolidBackgroundValue(selectedSlide) ?? selectedTheme.bgColor)
      : selectedTheme.bgColor,
  };
}
