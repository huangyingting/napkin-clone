/**
 * Language-switcher runtime flag.
 *
 * Hidden by default because current catalog coverage is intentionally partial.
 * Only the exact value "true" enables the switcher, preserving current behavior.
 */
export const I18N_SWITCHER_ENABLED_ENV = "I18N_SWITCHER_ENABLED";

export function isLanguageSwitcherEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env[I18N_SWITCHER_ENABLED_ENV] === "true";
}
