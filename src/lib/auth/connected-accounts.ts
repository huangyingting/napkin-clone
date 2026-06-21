/**
 * Pure, framework-free derivation of a user's connected sign-in methods (#162).
 *
 * This app uses Auth.js with the JWT session strategy and NO database adapter,
 * so there is no `Account` table to read linked providers from. Instead we
 * derive what we can from the durable signals already stored on the `User` row:
 *
 *  - Email + password: connected whenever the user has a `passwordHash`.
 *  - Google: the Google sign-in callback (src/auth.ts) links by email and copies
 *    the Google-hosted avatar onto `User.image`. A Google-hosted avatar URL is
 *    therefore a reliable, durable marker that the account is linked to Google.
 *
 * Everything here is I/O-free (no Prisma, no Next.js, no React) so it is the
 * single source of truth for the derivation and can be unit-tested DOM-free.
 */

/** Hostnames Google serves user avatars from (covers the lhN.* shards). */
const GOOGLE_AVATAR_HOST = /(^|\.)googleusercontent\.com$/i;

/**
 * Returns true when `image` is a Google-hosted avatar URL — the durable marker
 * left on `User.image` after a Google sign-in links the account. Anything that
 * is not a parseable absolute URL on a Google avatar host is treated as "not
 * Google" (e.g. a null image, a custom upload, or a Gravatar).
 */
export function isGoogleLinkedImage(image: string | null | undefined): boolean {
  if (!image) {
    return false;
  }
  try {
    return GOOGLE_AVATAR_HOST.test(new URL(image).hostname);
  } catch {
    return false;
  }
}

/** A sign-in method we can surface in settings. */
type ConnectedAccountProvider = "password" | "google";

export interface ConnectedAccount {
  provider: ConnectedAccountProvider;
  /** Human-readable provider name. */
  label: string;
  /** Whether this method is currently linked to the account. */
  connected: boolean;
  /**
   * Whether this method is available to connect at all. Google is only
   * available when OAuth is configured on the server; password is always
   * available.
   */
  available: boolean;
}

/**
 * Derives the user's connected sign-in methods from durable User-row signals.
 *
 * `password` is connected when the user has a stored password hash. `google` is
 * connected when the user's avatar is Google-hosted (see
 * {@link isGoogleLinkedImage}); it is only marked available when the server has
 * Google OAuth configured, so we never advertise a provider the deployment can't
 * actually use. The order (password first, then google) is stable for the UI.
 */
export function deriveConnectedAccounts(input: {
  hasPassword: boolean;
  image: string | null | undefined;
  googleConfigured: boolean;
}): ConnectedAccount[] {
  const { hasPassword, image, googleConfigured } = input;
  const googleConnected = isGoogleLinkedImage(image);

  return [
    {
      provider: "password",
      label: "Email & password",
      connected: hasPassword,
      available: true,
    },
    {
      provider: "google",
      label: "Google",
      connected: googleConnected,
      // A linked Google account stays visible even if OAuth is later turned off,
      // so the user can always see what is connected.
      available: googleConfigured || googleConnected,
    },
  ];
}
