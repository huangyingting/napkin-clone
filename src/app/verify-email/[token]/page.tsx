import type { Metadata } from "next";
import Link from "next/link";

import { consumeEmailVerificationToken } from "@/lib/auth/email-verification-service";

export const metadata: Metadata = {
  title: "Verify your email — TextIQ",
};

export default async function VerifyEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const outcome = await consumeEmailVerificationToken(
    decodeURIComponent(token),
  );

  const verified = outcome.status === "verified";

  return (
    <main className="flex flex-1 items-center justify-center bg-ds-surface-sunken px-6 py-16">
      <div className="flex w-full max-w-sm flex-col gap-8 rounded-ds-xl border border-ds-border-subtle bg-ds-surface-raised p-8 shadow-ds-overlay">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-ds-text-primary">
            {verified ? "Email verified" : "Verification failed"}
          </h1>
          <p
            className={
              verified
                ? "text-sm text-ds-text-secondary"
                : "text-sm text-ds-danger"
            }
            role={verified ? undefined : "alert"}
          >
            {verified
              ? "Thanks — your email address is now verified."
              : outcome.message}
          </p>
        </div>
        <Link
          href="/app/settings"
          className="flex h-11 items-center justify-center rounded-ds-pill bg-ds-accent px-6 text-sm font-medium text-ds-text-on-accent transition hover:bg-ds-accent-hover"
        >
          Back to settings
        </Link>
      </div>
    </main>
  );
}
