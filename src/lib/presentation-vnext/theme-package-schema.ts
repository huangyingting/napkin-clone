/**
 * Theme package schema for v7.
 *
 * `ThemePackageV1` is the full package contract that the style resolver and
 * render resolver consume. It must be validated before use.
 */

import type { ThemePackageId, ThemeVersion, AssetId } from "./types";
import type { StyleObject, ThemeTokens, StyleRef } from "./style-schema";
import type { LayoutBox } from "./schema";
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

  if (dc.hasErrors()) {
    return { valid: false, diagnostics: dc.diagnostics };
  }

  return { valid: true, package: input as ThemePackageV1 };
}
