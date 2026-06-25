/**
 * Delivery seam for email-verification links (#162).
 *
 * Mirrors `reset-email.ts`: this app has no email transport wired up yet, so
 * this module is the single place where one drops in. A real sender implements
 * {@link VerificationMailer} and is selected in {@link getVerificationMailer};
 * until then the dev fallback logs the link so the flow is exercisable
 * end-to-end locally without leaking links in prod.
 *
 * Unlike the password-reset flow there is NO user-enumeration concern here: the
 * recipient is always the logged-in user's own, already-known address.
 */

export {
  buildEmailVerificationUrl,
  deliverVerificationEmail,
  type AuthEmailDeliveryPort as VerificationMailer,
  type VerificationEmail,
} from "@/lib/auth/email";
