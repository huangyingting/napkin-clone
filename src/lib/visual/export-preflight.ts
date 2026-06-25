/**
 * Export preflight diagnostics for Slides (Epic #379, issue #416).
 *
 * Runs a pure, synchronous inspection of a {@link Deck} before a PPTX or
 * image export and returns a structured list of {@link PreflightDiagnostic}
 * items.  The caller is responsible for deciding whether to block the export
 * (check {@link PreflightResult.hasFatal}) or surface fidelity warnings.
 *
 * Design goals:
 *  - Pure and headless — no DOM, no browser APIs, no Prisma.  Safe to run in
 *    server actions, API routes, and unit tests.
 *  - Distinguishes FATAL errors (the exported file will be broken or missing
 *    essential content) from fidelity WARNINGs (the file will open but will
 *    look different from the editor preview).
 *  - Each diagnostic carries a stable `code` string so UI components can
 *    localise messages without parsing the `message` field.
 */

import type { Deck, ImageElement, SlideElement } from "@/lib/presentation/deck";
import { getFidelity } from "@/lib/visual/export-fidelity";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Blocking export error vs non-blocking fidelity degradation. */
export type PreflightSeverity = "fatal" | "warning";

/**
 * Stable diagnostic codes produced by the preflight check.
 *
 * - `missing-asset`           — an image element has no resolvable source
 *                               (no `src`, no `assetId`, empty URL).
 * - `missing-font`            — a text/bullets element references a custom
 *                               font that is not embedded in the PPTX format.
 * - `unsupported-pptx-feature`— a feature used in the deck has "partial" or
 *                               "unsupported" fidelity in the PPTX target.
 * - `raster-fallback`         — an image element will be rasterised rather
 *                               than embedded as a vector in PPTX.
 * - `remote-image-failure`    — an image element references a remote URL that
 *                               could fail at export time.
 * - `oversized-deck`          — the deck exceeds the recommended slide count
 *                               threshold, risking large file size or OOM.
 */
export type PreflightCode =
  | "missing-asset"
  | "missing-font"
  | "unsupported-pptx-feature"
  | "raster-fallback"
  | "remote-image-failure"
  | "oversized-deck";

/** A single preflight finding. */
export interface PreflightDiagnostic {
  /** Error (blocks export) vs warning (degrades fidelity). */
  severity: PreflightSeverity;
  /** Stable machine-readable code. */
  code: PreflightCode;
  /** Human-readable description (English). */
  message: string;
  /** Zero-based index of the affected slide, when applicable. */
  slideIndex?: number;
  /** Element id on the affected slide, when applicable. */
  elementId?: string;
  /** Additional context (feature name, URL prefix, etc.). */
  detail?: string;
}

/** Aggregated result returned by {@link runExportPreflight}. */
export interface PreflightResult {
  /** All diagnostics found during the preflight scan. */
  diagnostics: PreflightDiagnostic[];
  /** True when at least one FATAL diagnostic is present. */
  hasFatal: boolean;
  /** True when at least one WARNING diagnostic is present. */
  hasWarnings: boolean;
  /**
   * Convenience flag — `true` when the export is safe to proceed (no fatal
   * errors).  The caller should still surface any warnings.
   */
  canExport: boolean;
}

/** Which export format is being preflight-checked. */
export type PreflightTarget = "pptx" | "image";

/** Options accepted by {@link runExportPreflight}. */
export interface PreflightOptions {
  /** Target export format — affects which feature checks apply. */
  target: PreflightTarget;
  /**
   * Maximum number of slides before an `oversized-deck` warning is emitted.
   * Defaults to {@link DEFAULT_MAX_SLIDES}.
   */
  maxSlides?: number;
  /**
   * Custom font families used in the deck (e.g. from the applied brand).
   * When provided, any element whose `fontFamily` matches one of these is
   * reported as `missing-font` for PPTX (fonts are not embedded).
   */
  customFontFamilies?: ReadonlySet<string>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Slide count above which an `oversized-deck` warning is emitted. */
export const DEFAULT_MAX_SLIDES = 50;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true when the image element will require a raster fallback in PPTX. */
function imageNeedsRasterFallback(el: ImageElement): boolean {
  if (el.fitMode === "none") return true;
  if (el.maskShape && el.maskShape !== "none") return true;
  if (el.crop) return true;
  return false;
}

/** Returns true when the string looks like a remote (http/https) URL. */
function isRemoteUrl(src: string): boolean {
  return src.startsWith("http://") || src.startsWith("https://");
}

/** Extracts the first font-family name from a CSS font stack. */
function primaryFontFamily(fontFamily: string): string {
  return fontFamily
    .split(",")[0]
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .trim();
}

// ---------------------------------------------------------------------------
// Core preflight checks
// ---------------------------------------------------------------------------

function checkImageElement(
  el: ImageElement,
  slideIndex: number,
  target: PreflightTarget,
  diagnostics: PreflightDiagnostic[],
): void {
  const hasSrc = el.src && el.src.trim() !== "";
  const hasAssetId = Boolean(el.assetId);

  // Missing-asset check (fatal for both targets).
  if (!hasSrc && !hasAssetId) {
    diagnostics.push({
      severity: "fatal",
      code: "missing-asset",
      message: `Slide ${slideIndex + 1}: image element has no source — it will appear broken in the export.`,
      slideIndex,
      elementId: el.id,
    });
    return; // no further checks for this element
  }

  if (target === "pptx") {
    // Raster-fallback warning.
    if (imageNeedsRasterFallback(el)) {
      diagnostics.push({
        severity: "warning",
        code: "raster-fallback",
        message: `Slide ${slideIndex + 1}: image element will be rasterised in PPTX (fitMode/mask/crop).`,
        slideIndex,
        elementId: el.id,
        detail: el.fitMode ?? el.maskShape ?? "crop",
      });
    }

    // Remote-image warning.
    if (hasSrc && isRemoteUrl(el.src)) {
      diagnostics.push({
        severity: "warning",
        code: "remote-image-failure",
        message: `Slide ${slideIndex + 1}: image references a remote URL that could fail at export time.`,
        slideIndex,
        elementId: el.id,
        detail: el.src.slice(0, 80),
      });
    }
  }
}

function checkFontUsage(
  el: SlideElement,
  slideIndex: number,
  customFontFamilies: ReadonlySet<string>,
  diagnostics: PreflightDiagnostic[],
): void {
  if (el.kind !== "text" && el.kind !== "bullets" && el.kind !== "shape") {
    return;
  }
  const fontFamily =
    el.kind === "text" || el.kind === "bullets"
      ? el.style?.fontFamily
      : el.textStyle?.fontFamily;
  if (!fontFamily) return;

  const primary = primaryFontFamily(fontFamily);
  if (customFontFamilies.has(primary)) {
    diagnostics.push({
      severity: "warning",
      code: "missing-font",
      message: `Slide ${slideIndex + 1}: custom font "${primary}" is not embedded in PPTX — Office will substitute a system font.`,
      slideIndex,
      elementId: el.id,
      detail: primary,
    });
  }
}

/**
 * Deck-level check (#617): warns when an applied custom deck template (e.g. a
 * brand-derived `customTokenSet`) declares typography fonts that PPTX cannot
 * embed. Resolved template fonts may never appear on an element's own
 * `style.fontFamily`, so the per-element {@link checkFontUsage} would miss
 * them. Gated on the same caller-provided `customFontFamilies` set so behaviour
 * stays predictable and opt-in.
 */
function checkCustomTemplateFonts(
  deck: Deck,
  customFontFamilies: ReadonlySet<string>,
  diagnostics: PreflightDiagnostic[],
): void {
  const typography = deck.customTokenSet?.typography;
  if (!typography) return;

  const candidates: string[] = [typography.fontFamily];
  if (typography.headingFontFamily) {
    candidates.push(typography.headingFontFamily);
  }
  if (typography.roles) {
    for (const token of Object.values(typography.roles)) {
      if (token?.fontFamily) candidates.push(token.fontFamily);
    }
  }

  const seen = new Set<string>();
  for (const stack of candidates) {
    const primary = primaryFontFamily(stack);
    if (seen.has(primary)) continue;
    seen.add(primary);
    if (customFontFamilies.has(primary)) {
      diagnostics.push({
        severity: "warning",
        code: "missing-font",
        message: `Deck template uses custom font "${primary}" which is not embedded in PPTX — Office will substitute a system font.`,
        detail: primary,
      });
    }
  }
}

function checkPptxFidelityFeatures(
  slide: Deck["slides"][number],
  slideIndex: number,
  elements: SlideElement[],
  diagnostics: PreflightDiagnostic[],
): void {
  // Connector routing — check for elbow connectors.
  for (const el of elements) {
    if (el.kind === "connector" && el.routing === "elbow") {
      const fidelity = getFidelity("connector-elbow", "pptx");
      if (fidelity === "partial" || fidelity === "degraded") {
        diagnostics.push({
          severity: "warning",
          code: "unsupported-pptx-feature",
          message: `Slide ${slideIndex + 1}: elbow connectors export as straight lines in PPTX.`,
          slideIndex,
          elementId: el.id,
          detail: "connector-elbow",
        });
      }
    }
  }

  // Background gradient.
  if (slide.backgroundGradient !== undefined) {
    diagnostics.push({
      severity: "warning",
      code: "unsupported-pptx-feature",
      message: `Slide ${slideIndex + 1}: gradient background is approximated as a flat colour in PPTX.`,
      slideIndex,
      detail: "background-gradient",
    });
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Runs a synchronous, pure preflight check on a {@link Deck} before export.
 *
 * Returns a {@link PreflightResult} containing all found diagnostics.
 * The caller should:
 *  1. If `result.hasFatal` — block the export and surface the fatal errors.
 *  2. If `result.hasWarnings` — surface warnings in the export dialog.
 *  3. Otherwise — proceed with export.
 *
 * This function is safe to call in any environment (Node, browser, tests).
 */
export function runExportPreflight(
  deck: Deck,
  options: PreflightOptions,
): PreflightResult {
  const {
    target,
    maxSlides = DEFAULT_MAX_SLIDES,
    customFontFamilies = new Set<string>(),
  } = options;

  const diagnostics: PreflightDiagnostic[] = [];

  // Oversized-deck check.
  if (deck.slides.length > maxSlides) {
    diagnostics.push({
      severity: "warning",
      code: "oversized-deck",
      message: `Deck has ${deck.slides.length} slides (recommended maximum: ${maxSlides}). Export file may be very large.`,
      detail: String(deck.slides.length),
    });
  }

  // Deck-level custom template font check (#617).
  if (target === "pptx" && customFontFamilies.size > 0) {
    checkCustomTemplateFonts(deck, customFontFamilies, diagnostics);
  }

  // Per-slide element checks.
  for (let i = 0; i < deck.slides.length; i++) {
    const slide = deck.slides[i];
    const elements = [...(slide.elements ?? [])].filter((el) => !el.hidden);

    for (const el of elements) {
      if (el.kind === "image") {
        checkImageElement(el, i, target, diagnostics);
      }

      if (target === "pptx" && customFontFamilies.size > 0) {
        checkFontUsage(el, i, customFontFamilies, diagnostics);
      }
    }

    if (target === "pptx") {
      checkPptxFidelityFeatures(slide, i, elements, diagnostics);
    }
  }

  // Note: per-element checks above handle connector-elbow, image-*, and
  // background-gradient. Deck-level fidelity warnings (shadow, theme-typography)
  // are only meaningful when those features are actually present in the deck,
  // so we skip generic unconditional emission here to avoid false positives.

  const hasFatal = diagnostics.some((d) => d.severity === "fatal");
  const hasWarnings = diagnostics.some((d) => d.severity === "warning");

  return {
    diagnostics,
    hasFatal,
    hasWarnings,
    canExport: !hasFatal,
  };
}

// ---------------------------------------------------------------------------
// Convenience helpers for the export menu / dialog
// ---------------------------------------------------------------------------

/** Returns only the fatal diagnostics from a preflight result. */
export function fatalDiagnostics(
  result: PreflightResult,
): PreflightDiagnostic[] {
  return result.diagnostics.filter((d) => d.severity === "fatal");
}

/** Returns only the warning diagnostics from a preflight result. */
export function warningDiagnostics(
  result: PreflightResult,
): PreflightDiagnostic[] {
  return result.diagnostics.filter((d) => d.severity === "warning");
}
