import { getI18nActivationStatus, type I18nActivationStatus } from "./coverage";

export const I18N_SWITCHER_ENABLED_ENV = "I18N_SWITCHER_ENABLED";

/**
 * Post-threshold runtime gate for exposing locale selection.
 *
 * The environment flag alone does not activate user-facing i18n. The switcher
 * stays hidden until the required translated surface is complete.
 */
export function isLanguageSwitcherEnabled(
  env: Record<string, string | undefined> = process.env,
  activationStatus: I18nActivationStatus = getI18nActivationStatus(),
): boolean {
  return (
    env[I18N_SWITCHER_ENABLED_ENV] === "true" &&
    activationStatus.userActivationReady
  );
}
