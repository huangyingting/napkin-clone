import { logError } from "@/lib/log";

/**
 * Delivery seam for email-verification links (#162).
 *
 * Mirrors `reset-email.ts`: this app has no email transport wired up yet, so
 * this module is the single place where one drops in. A real sender
 * (Resend / SES / SMTP / Nodemailer) implements {@link VerificationMailer} and
 * is selected in {@link getVerificationMailer}; until then the dev fallback logs
 * the link so the flow is exercisable end-to-end locally without leaking links
 * in prod.
 *
 * Unlike the password-reset flow there is NO user-enumeration concern here: the
 * recipient is always the logged-in user's own, already-known address.
 */

export interface VerificationEmail {
  /** Recipient address (the logged-in user's own email). */
  to: string;
  /** Absolute, ready-to-click verification URL containing the raw token. */
  verifyUrl: string;
}

export interface VerificationMailer {
  /** Delivers the verification link. Resolves on success; rejects on error. */
  send(email: VerificationEmail): Promise<void>;
}

/**
 * Dev fallback used when no real transport is configured. It logs the verify URL
 * to the server console so a developer can complete the flow locally. It is
 * guarded to non-production so a misconfigured prod deploy can never print a live
 * verification link to the logs.
 */
const devConsoleMailer: VerificationMailer = {
  async send({ to, verifyUrl }) {
    if (process.env.NODE_ENV === "production") {
      logError(
        "email-verification",
        new Error("No email-verification transport is configured"),
      );
      return;
    }
    console.info(
      `[email-verification] DEV ONLY — verify link for ${to}: ${verifyUrl}`,
    );
  },
};

/**
 * Selects the active mailer. Returns the dev console fallback today; swap in a
 * real {@link VerificationMailer} here (e.g. behind an env check for an API key)
 * and the rest of the flow is unchanged.
 */
export function getVerificationMailer(): VerificationMailer {
  // When a real transport is added, construct and return it here, e.g.:
  //   if (process.env.RESEND_API_KEY) return createResendMailer(...);
  return devConsoleMailer;
}

/**
 * Sends a verification link via the active mailer. Failures are logged but
 * swallowed so the settings action can report a single generic outcome.
 */
export async function deliverVerificationEmail(
  email: VerificationEmail,
): Promise<void> {
  try {
    await getVerificationMailer().send(email);
  } catch (error) {
    logError("email-verification", error);
  }
}
