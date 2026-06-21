import { logError } from "@/lib/log";

/**
 * Delivery seam for password-reset links (#140).
 *
 * This app has no email transport wired up yet, so this module is the single
 * place where one drops in. A real sender (Resend / SES / SMTP / Nodemailer)
 * implements {@link PasswordResetMailer} and is selected in
 * {@link getPasswordResetMailer}; until then the dev fallback logs the link so
 * the flow is exercisable end-to-end locally without leaking links in prod.
 *
 * Callers (the forgot-password action) MUST stay agnostic of which sender ran:
 * the response is always the same "if an account exists, we sent a link" so the
 * endpoint never reveals whether an email is registered.
 */

export interface PasswordResetEmail {
  /** Recipient address (a real, matched user — never echoed back to clients). */
  to: string;
  /** Absolute, ready-to-click reset URL containing the raw token. */
  resetUrl: string;
}

export interface PasswordResetMailer {
  /** Delivers the reset link. Resolves on success; rejects on transport error. */
  send(email: PasswordResetEmail): Promise<void>;
}

/**
 * Dev fallback used when no real transport is configured. It logs the reset URL
 * to the server console so a developer can complete the flow locally. It is
 * guarded to non-production so a misconfigured prod deploy can never print a
 * live reset link to the logs.
 */
const devConsoleMailer: PasswordResetMailer = {
  async send({ to, resetUrl }) {
    if (process.env.NODE_ENV === "production") {
      // Never print a live reset link in production logs. A real transport must
      // be configured for prod; surface a clear error instead of leaking.
      logError(
        "password-reset",
        new Error("No password-reset email transport is configured"),
      );
      return;
    }
    console.info(
      `[password-reset] DEV ONLY — reset link for ${to}: ${resetUrl}`,
    );
  },
};

/**
 * Selects the active mailer. Returns the dev console fallback today; swap in a
 * real {@link PasswordResetMailer} here (e.g. behind an env check for an API
 * key) and the rest of the flow is unchanged.
 */
export function getPasswordResetMailer(): PasswordResetMailer {
  // When a real transport is added, construct and return it here, e.g.:
  //   if (process.env.RESEND_API_KEY) return createResendMailer(...);
  return devConsoleMailer;
}

/**
 * Sends a reset link via the active mailer. Failures are logged but swallowed so
 * the forgot-password endpoint always returns the same generic response and
 * never reveals — via timing, an error, or a different message — whether the
 * address was registered.
 */
export async function deliverPasswordResetEmail(
  email: PasswordResetEmail,
): Promise<void> {
  try {
    await getPasswordResetMailer().send(email);
  } catch (error) {
    logError("password-reset", error);
  }
}
