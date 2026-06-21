import { google } from "@/lib/env";

/**
 * Returns true when the Google OAuth provider is fully configured.
 *
 * Delegates to the centralized env module (`@/lib/env`) so the "is Google
 * configured?" check has a single source of truth shared with src/auth.ts.
 */
export function isGoogleAuthConfigured(): boolean {
  return google.isConfigured();
}
