/**
 * Client-readable mirror of the server-only `AI_DECK_GEN_ENABLED` flag (#268).
 *
 * The server route (`POST /api/generate-deck`) is gated by
 * `isAiDeckGenEnabled` reading `AI_DECK_GEN_ENABLED` — a server-only var
 * that is NOT exposed to the client bundle. To gate the slide-editor AI entry
 * point in the browser we read a public mirror, `NEXT_PUBLIC_AI_DECK_GEN_ENABLED`.
 *
 * The public env read lives in `@/lib/client-config`; keep it as a literal
 * `process.env.NEXT_PUBLIC_AI_DECK_GEN_ENABLED` read there so Next inlines its
 * value into the client bundle at build time.
 *
 * This only hides the UI affordance; the server flag remains the security
 * boundary, and the open path always falls back to the deterministic derive
 * when generation is unavailable.
 */

import { isPublicAiDeckGenEnabled } from "@/lib/client-config";

/** Whether the client-side AI deck-generation entry point should be shown. */
export function isAiDeckGenClientEnabled(): boolean {
  return isPublicAiDeckGenEnabled();
}
