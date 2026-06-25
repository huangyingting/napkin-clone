import { parseBooleanFlag } from "@/lib/config/flags";

export const DEFAULT_PUBLIC_APP_URL = "http://localhost:4000";
export const DEFAULT_PUBLIC_COLLAB_WS_PORT = "4000";

/**
 * Typed helpers for public client configuration.
 *
 * Next.js statically inlines only literal `process.env.NEXT_PUBLIC_*` reads.
 * Keep those reads direct in this module; do not switch to computed keys or a
 * generic env accessor. Values are fixed at build time in browser bundles.
 */

export function publicAppUrl(
  fallback: string = DEFAULT_PUBLIC_APP_URL,
): string {
  return process.env.NEXT_PUBLIC_APP_URL || fallback;
}

export function publicCollabWsUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_COLLAB_WS_URL || undefined;
}

export function publicCollabWsPort(
  fallback: string = DEFAULT_PUBLIC_COLLAB_WS_PORT,
): string {
  return process.env.NEXT_PUBLIC_COLLAB_WS_PORT || fallback;
}

export function isPublicAiDeckGenEnabled(): boolean {
  return parseBooleanFlag(process.env.NEXT_PUBLIC_AI_DECK_GEN_ENABLED);
}
