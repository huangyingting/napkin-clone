/**
 * Returns true when the Google OAuth provider is fully configured.
 *
 * Mirrors the exact guard used in src/auth.ts so both places share a single
 * source of truth rather than duplicating the env-var check.
 */
export function isGoogleAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
}
