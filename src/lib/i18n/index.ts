/**
 * Core i18n utilities: locale validation, normalisation, and typed `t()` accessor.
 *
 * This module is pure (no React, no Next.js) so it can be used in both RSC and
 * client components, as well as in unit tests.
 */

import {
  catalog,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type Locale,
  type Messages,
} from "./messages";

export type { Locale, Messages };
export { DEFAULT_LOCALE, SUPPORTED_LOCALES };

/**
 * Returns `true` when `value` is one of the supported locale codes.
 */
export function isSupportedLocale(value: unknown): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

/**
 * Normalises an arbitrary string to a known `Locale`.
 *
 * Matching is case-insensitive and tolerates BCP-47 region suffixes
 * (e.g. `"en-US"` → `"en"`, `"es-419"` → `"es"`).
 * Falls back to `DEFAULT_LOCALE` when no match is found.
 */
export function normaliseLocale(raw: string | null | undefined): Locale {
  if (!raw) return DEFAULT_LOCALE;

  // Exact match first (fast path).
  if (isSupportedLocale(raw)) return raw;

  // Strip region suffix and retry (e.g. "en-US" → "en").
  const base = raw.split(/[-_]/)[0]?.toLowerCase();
  if (base && isSupportedLocale(base)) return base as Locale;

  return DEFAULT_LOCALE;
}

/**
 * Returns the messages object for the given locale, falling back to the default
 * locale when the requested locale is not in the catalog.
 */
export function getMessages(locale: Locale): Messages {
  return catalog[locale] ?? catalog[DEFAULT_LOCALE];
}

/**
 * Creates a typed `t()` translator bound to a specific locale.
 *
 * For string keys the return type is `string`.
 * For function keys the return type mirrors the function signature so callers
 * get type-checked arguments.
 *
 * Missing keys fall back to the default locale's value so partial translations
 * never produce blank UI.
 */
export function createTranslator(locale: Locale) {
  const primary = getMessages(locale);
  const fallback = getMessages(DEFAULT_LOCALE);

  function t<K extends keyof Messages>(
    key: K,
    ...args: Messages[K] extends (...a: infer A) => string ? A : []
  ): string {
    const value = primary[key] ?? fallback[key];
    if (typeof value === "function") {
      return (value as (...a: unknown[]) => string)(...(args as unknown[]));
    }
    return value as string;
  }

  return t;
}

/**
 * Convenience `t()` that always uses the default locale.
 * Useful during incremental migration of existing components.
 */
export const t = createTranslator(DEFAULT_LOCALE);

/**
 * Returns `true` only when the `I18N_SWITCHER_ENABLED` environment variable is
 * explicitly set to `"true"`.
 *
 * The language switcher is hidden by default because the current message
 * catalog covers less than 5 % of the app (header, dashboard, template-picker,
 * and the switcher itself). Surfacing a locale toggle that leaves most of the
 * UI in English is a worse experience than offering no switcher at all.
 *
 * Set `I18N_SWITCHER_ENABLED=true` once catalog coverage reaches a meaningful
 * threshold across the core authenticated surfaces (editor chrome, settings,
 * billing, workspaces, sharing, error/empty states).
 *
 * The underlying i18n infrastructure (messages.ts, LocaleProvider, hooks,
 * server utilities) remains fully intact and ready for that expansion.
 */
export function isLanguageSwitcherEnabled(): boolean {
  return process.env.I18N_SWITCHER_ENABLED === "true";
}
