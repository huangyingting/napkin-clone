/**
 * Theme package schema for v7.
 *
 * `ThemePackageV1` is the full package contract that the style resolver and
 * render resolver consume. It must be validated before use.
 */

import type { ThemePackageId, ThemeVersion, AssetId } from "./types";
import type { StyleObject, ThemeTokens, StyleRef } from "./style-schema";
import type {
  DeckChromeConfig,
  LayoutBox,
  SemanticTemplateKind,
} from "./schema";
import type { PresentationDiagnostic } from "./diagnostics";

// ---------------------------------------------------------------------------
// Decoration recipe
// ---------------------------------------------------------------------------

export type TemplateStaticContent =
  | { type: "text"; text: string }
  | { type: "shape"; shape: string }
  | { type: "image"; assetId: AssetId };

export type ThemeDecorationRecipe = {
  id: string;
  component: "shape" | "image" | "text";
  role: "themeDecoration";
  layout: LayoutBox;
  style: StyleObject;
  content?: TemplateStaticContent;
  appliesTo?: {
    templateKinds?: SemanticTemplateKind[];
    layoutIds?: string[];
  };
  visibility?: "subtle" | "default" | "expressive";
  chrome?: "default" | "minimal";
};

// ---------------------------------------------------------------------------
// Package asset manifest
// ---------------------------------------------------------------------------

export type ThemeAssetManifest = {
  images?: Record<AssetId, Omit<import("./schema").ImageAsset, "origin">>;
  fonts?: Record<AssetId, import("./schema").FontAsset>;
};

// ---------------------------------------------------------------------------
// Package itself
// ---------------------------------------------------------------------------

export type ThemePackageV1 = {
  schemaVersion: 1;
  id: ThemePackageId;
  version: ThemeVersion;
  name: string;
  tagline?: string;
  tokens: ThemeTokens;
  styles: Record<StyleRef, Record<string, StyleObject>>;
  decorations?: Record<string, ThemeDecorationRecipe>;
  chrome?: Partial<DeckChromeConfig>;
  assets?: ThemeAssetManifest;
};

// ---------------------------------------------------------------------------
// Package validation
// ---------------------------------------------------------------------------

export type ThemePackageValidationResult =
  | { valid: true; package: ThemePackageV1 }
  | { valid: false; diagnostics: PresentationDiagnostic[] };

import { DiagnosticCollector } from "./diagnostics";
import { STYLE_REFS } from "./style-registry";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function resolveTokenInValue(
  value: unknown,
  tokens: ThemeTokens,
): { resolved: boolean; missing?: string } {
  if (!isPlainObject(value)) return { resolved: true };
  if (typeof value.token === "string") {
    const parts = (value.token as string).split(".");
    let cursor: any = tokens;
    for (const part of parts) {
      if (!isPlainObject(cursor))
        return { resolved: false, missing: value.token as string };
      cursor = cursor[part];
    }
    return cursor !== undefined
      ? { resolved: true }
      : { resolved: false, missing: value.token as string };
  }
  for (const v of Object.values(value)) {
    const r = resolveTokenInValue(v, tokens);
    if (!r.resolved) return r;
  }
  return { resolved: true };
}

const THEME_CHROME_KINDS = [
  "logo",
  "footer",
  "pageNumber",
  "watermark",
  "border",
  "safeArea",
] as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateChromeEnum(
  value: unknown,
  allowed: readonly string[],
  ctx: string,
  errors: string[],
): void {
  if (value !== undefined && !allowed.includes(value as string)) {
    errors.push(`${ctx} must be one of: ${allowed.join(", ")}`);
  }
}

function validateChromeString(
  value: unknown,
  ctx: string,
  errors: string[],
): void {
  if (value !== undefined && typeof value !== "string") {
    errors.push(`${ctx} must be a string`);
  }
}

function validateChromeNumber(
  value: unknown,
  ctx: string,
  errors: string[],
): void {
  if (value !== undefined && !isFiniteNumber(value)) {
    errors.push(`${ctx} must be a finite number`);
  }
}

function validateChromeLayout(
  value: unknown,
  ctx: string,
  errors: string[],
): void {
  if (!isPlainObject(value)) {
    errors.push(`${ctx} must be an object`);
    return;
  }
  if (!isPlainObject(value.frame)) {
    errors.push(`${ctx}.frame must be an object`);
  } else {
    for (const key of ["x", "y", "w", "h"] as const) {
      if (!isFiniteNumber(value.frame[key])) {
        errors.push(`${ctx}.frame.${key} must be a finite number`);
      }
    }
  }
  if (!Number.isInteger(value.zIndex)) {
    errors.push(`${ctx}.zIndex must be an integer`);
  }
}

function validateChromeInsets(
  value: unknown,
  ctx: string,
  errors: string[],
): void {
  if (!isPlainObject(value)) {
    errors.push(`${ctx} must be an object`);
    return;
  }
  for (const key of ["top", "right", "bottom", "left"] as const) {
    if (!isFiniteNumber(value[key])) {
      errors.push(`${ctx}.${key} must be a finite number`);
    }
  }
}

function validateChromeItem(
  input: unknown,
  ctx: string,
  allowedSpecificKeys: readonly string[],
  errors: string[],
): Record<string, unknown> | undefined {
  if (!isPlainObject(input)) {
    errors.push(`${ctx} must be an object`);
    return undefined;
  }
  const allowed = new Set([
    "enabled",
    "layout",
    "style",
    "layer",
    ...allowedSpecificKeys,
  ]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      errors.push(`${ctx}.${key} is not a known chrome field`);
    }
  }
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") {
    errors.push(`${ctx}.enabled must be a boolean`);
  }
  validateChromeEnum(
    input.layer,
    ["background", "foreground"],
    `${ctx}.layer`,
    errors,
  );
  if (input.layout !== undefined) {
    validateChromeLayout(input.layout, `${ctx}.layout`, errors);
  }
  return input;
}

function validateThemeChrome(input: unknown, ctx: string): string[] {
  const errors: string[] = [];
  if (input === undefined) return errors;
  if (!isPlainObject(input)) {
    return [`${ctx} must be an object`];
  }
  for (const key of Object.keys(input)) {
    if (
      !THEME_CHROME_KINDS.includes(key as (typeof THEME_CHROME_KINDS)[number])
    ) {
      errors.push(`${ctx}.${key} is not a known chrome slot`);
    }
  }
  if (input.logo !== undefined) {
    const logo = validateChromeItem(
      input.logo,
      `${ctx}.logo`,
      ["assetId", "alt", "placement", "size"],
      errors,
    );
    if (logo) {
      validateChromeString(logo.assetId, `${ctx}.logo.assetId`, errors);
      validateChromeString(logo.alt, `${ctx}.logo.alt`, errors);
      validateChromeEnum(
        logo.placement,
        ["top-left", "top-right", "bottom-left", "bottom-right"],
        `${ctx}.logo.placement`,
        errors,
      );
      validateChromeEnum(
        logo.size,
        ["small", "medium", "large"],
        `${ctx}.logo.size`,
        errors,
      );
    }
  }

  if (input.footer !== undefined) {
    const footer = validateChromeItem(
      input.footer,
      `${ctx}.footer`,
      ["text", "align"],
      errors,
    );
    if (footer) {
      validateChromeString(footer.text, `${ctx}.footer.text`, errors);
      validateChromeEnum(
        footer.align,
        ["left", "center", "right"],
        `${ctx}.footer.align`,
        errors,
      );
    }
  }

  if (input.pageNumber !== undefined) {
    const pageNumber = validateChromeItem(
      input.pageNumber,
      `${ctx}.pageNumber`,
      ["format", "placement"],
      errors,
    );
    if (pageNumber) {
      validateChromeEnum(
        pageNumber.format,
        ["number", "number-total"],
        `${ctx}.pageNumber.format`,
        errors,
      );
      validateChromeEnum(
        pageNumber.placement,
        ["bottom-left", "bottom-center", "bottom-right"],
        `${ctx}.pageNumber.placement`,
        errors,
      );
    }
  }

  if (input.watermark !== undefined) {
    const watermark = validateChromeItem(
      input.watermark,
      `${ctx}.watermark`,
      ["text", "opacity", "layoutMode", "size"],
      errors,
    );
    if (watermark) {
      validateChromeString(watermark.text, `${ctx}.watermark.text`, errors);
      validateChromeNumber(
        watermark.opacity,
        `${ctx}.watermark.opacity`,
        errors,
      );
      validateChromeEnum(
        watermark.layoutMode,
        ["center", "diagonal"],
        `${ctx}.watermark.layoutMode`,
        errors,
      );
      validateChromeEnum(
        watermark.size,
        ["small", "medium", "large"],
        `${ctx}.watermark.size`,
        errors,
      );
    }
  }

  if (input.border !== undefined) {
    const border = validateChromeItem(
      input.border,
      `${ctx}.border`,
      ["color", "widthPt"],
      errors,
    );
    if (border) {
      validateChromeString(border.color, `${ctx}.border.color`, errors);
      validateChromeNumber(border.widthPt, `${ctx}.border.widthPt`, errors);
    }
  }

  if (input.safeArea !== undefined) {
    const safeArea = validateChromeItem(
      input.safeArea,
      `${ctx}.safeArea`,
      ["insets", "color", "widthPt"],
      errors,
    );
    if (safeArea) {
      validateChromeString(safeArea.color, `${ctx}.safeArea.color`, errors);
      validateChromeNumber(safeArea.widthPt, `${ctx}.safeArea.widthPt`, errors);
      if (safeArea.insets !== undefined) {
        validateChromeInsets(safeArea.insets, `${ctx}.safeArea.insets`, errors);
      }
    }
  }
  return errors;
}

/** Validates a ThemePackageV1 manifest. Returns diagnostics for every issue found. */
export function validateThemePackage(
  input: unknown,
): ThemePackageValidationResult {
  const dc = new DiagnosticCollector();

  if (!isPlainObject(input)) {
    dc.fatal("missing-style-default", "Theme package must be an object");
    return { valid: false, diagnostics: dc.diagnostics };
  }

  if (input.schemaVersion !== 1) {
    dc.fatal(
      "invalid-schema-version",
      `Theme package schemaVersion must be 1 (got ${input.schemaVersion})`,
    );
    return { valid: false, diagnostics: dc.diagnostics };
  }

  if (typeof input.id !== "string" || input.id.length === 0) {
    dc.error("unknown-field", "Theme package id must be a non-empty string");
  }

  if (typeof input.version !== "string" || input.version.length === 0) {
    dc.error(
      "unknown-field",
      "Theme package version must be a non-empty string",
    );
  }

  if (!isPlainObject(input.tokens)) {
    dc.error("missing-token", "Theme package tokens must be an object");
  } else {
    // Check required token sub-structure exists
    const tokens = input.tokens as ThemeTokens;
    if (!isPlainObject(tokens.colors)) {
      dc.error("missing-token", "tokens.colors must be an object");
    }
    if (!isPlainObject(tokens.fonts)) {
      dc.error("missing-token", "tokens.fonts must be an object");
    }
  }

  if (!isPlainObject(input.styles)) {
    dc.error("missing-style-default", "Theme package styles must be an object");
  } else {
    const styles = input.styles as Record<string, unknown>;
    const tokens = (input.tokens ?? {}) as ThemeTokens;

    // Every registered style ref must have a default variant
    for (const ref of STYLE_REFS) {
      if (!isPlainObject(styles[ref])) {
        dc.error(
          "missing-style-default",
          `Theme package is missing style ref "${ref}"`,
          { path: `styles.${ref}` },
        );
        continue;
      }
      const variants = styles[ref] as Record<string, unknown>;
      if (!isPlainObject(variants.default)) {
        dc.error(
          "missing-style-default",
          `Theme package style "${ref}" is missing the "default" variant`,
          { path: `styles.${ref}.default` },
        );
      }
      // Validate token refs within styles
      for (const [variantId, styleObj] of Object.entries(variants)) {
        const r = resolveTokenInValue(styleObj, tokens);
        if (!r.resolved) {
          dc.error(
            "missing-token",
            `Style "${ref}/${variantId}" references unknown token "${r.missing}"`,
            { path: `styles.${ref}.${variantId}` },
          );
        }
      }
    }
  }

  if (input.chrome !== undefined) {
    const chromeErrors = validateThemeChrome(
      input.chrome,
      "ThemePackage.chrome",
    );
    for (const error of chromeErrors) {
      dc.error("unknown-field", error, {
        path: "chrome",
        target: { scope: "theme" },
      });
    }
  }

  if (dc.hasErrors()) {
    return { valid: false, diagnostics: dc.diagnostics };
  }

  return { valid: true, package: input as ThemePackageV1 };
}
