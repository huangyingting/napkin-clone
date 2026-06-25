/**
 * Delivery seam for password-reset links (#140).
 *
 * This app has no email transport wired up yet, so this module is the single
 * place where one drops in. A real sender implements {@link PasswordResetMailer}
 * and is selected in {@link getPasswordResetMailer}; until then the dev fallback
 * logs the link so the flow is exercisable end-to-end locally without leaking
 * links in prod.
 *
 * Callers (the forgot-password action) MUST stay agnostic of which sender ran:
 * the response is always the same "if an account exists, we sent a link" so the
 * endpoint never reveals whether an email is registered.
 */

export {
  buildPasswordResetUrl,
  deliverPasswordResetEmail,
  type AuthEmailDeliveryPort as PasswordResetMailer,
  type PasswordResetEmail,
} from "@/lib/auth/email";
