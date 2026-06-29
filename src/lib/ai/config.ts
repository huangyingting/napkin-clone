import { parseBooleanFlag } from "@/lib/config/flags";

/**
 * Server-side feature flag for AI deck generation.
 *
 * Defaults to disabled, so the cost-bearing route stays unavailable unless an
 * operator explicitly enables it.
 */
export const AI_DECK_GEN_ENABLED_ENV = "AI_DECK_GEN_ENABLED";

export function isAiDeckGenEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return parseBooleanFlag(env[AI_DECK_GEN_ENABLED_ENV]);
}
