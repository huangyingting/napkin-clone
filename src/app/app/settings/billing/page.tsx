import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  getEntitlements,
  PLAN_NAMES,
  isPlan,
  UNLIMITED_CREDITS,
} from "@/lib/billing/entitlements";

import { BillingActions } from "./billing-actions";

export const metadata: Metadata = {
  title: "Billing & Plan — TextIQ",
};

export default async function BillingPage() {
  const sessionUser = await requireUser();

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      plan: true,
      creditBalance: true,
      creditPeriodStart: true,
      subscription: {
        select: {
          status: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
        },
      },
    },
  });

  if (!user) {
    redirect("/login");
  }

  const plan = isPlan(user.plan) ? user.plan : "free";
  const entitlements = getEntitlements(plan);

  // Compute period end from creditPeriodStart or subscription row
  let periodEnd: Date | null = null;
  if (user.creditPeriodStart) {
    periodEnd = new Date(
      user.creditPeriodStart.getTime() +
        entitlements.periodDays * 24 * 60 * 60 * 1000,
    );
  }
  if (user.subscription?.currentPeriodEnd) {
    periodEnd = user.subscription.currentPeriodEnd;
  }

  const creditsUsed = Math.max(
    0,
    entitlements.creditsPerPeriod - user.creditBalance,
  );

  const usagePct =
    entitlements.creditsPerPeriod > 0
      ? Math.min(
          100,
          Math.round((creditsUsed / entitlements.creditsPerPeriod) * 100),
        )
      : 0;

  return (
    <main className="flex flex-1 flex-col items-center bg-ds-surface-sunken px-6 py-12">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ds-text-primary">
            Billing &amp; Plan
          </h1>
          <p className="text-sm text-ds-text-secondary">
            Manage your subscription and AI credits.
          </p>
        </header>

        {/* Current plan */}
        <section className="flex flex-col gap-4 rounded-2xl border border-ds-border-strong bg-ds-surface-base p-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-ds-text-primary">
                Current Plan
              </h2>
              <p className="text-sm text-ds-text-secondary">
                You are on the{" "}
                <span className="font-medium text-ds-text-primary">
                  {PLAN_NAMES[plan]}
                </span>{" "}
                plan.
              </p>
            </div>
            <span className="rounded-full bg-ds-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ds-accent">
              {PLAN_NAMES[plan]}
            </span>
          </div>

          {/* Subscription status */}
          {user.subscription?.cancelAtPeriodEnd && (
            <p className="rounded-lg bg-ds-warning-surface px-4 py-2 text-sm text-ds-warning-text">
              Your subscription will be cancelled at the end of the current
              billing period
              {periodEnd ? ` (${periodEnd.toLocaleDateString()}).` : "."}
            </p>
          )}

          {periodEnd && !user.subscription?.cancelAtPeriodEnd && (
            <p className="text-sm text-ds-text-secondary">
              Renews on{" "}
              <span className="font-medium">
                {periodEnd.toLocaleDateString()}
              </span>
            </p>
          )}
        </section>

        {/* Credit usage */}
        <section className="flex flex-col gap-4 rounded-2xl border border-ds-border-strong bg-ds-surface-base p-6">
          <h2 className="text-base font-semibold text-ds-text-primary">
            AI Credits
          </h2>

          <div className="flex items-end justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-3xl font-bold tabular-nums text-ds-text-primary">
                {UNLIMITED_CREDITS
                  ? "Unlimited"
                  : user.creditBalance.toLocaleString()}
              </span>
              <span className="text-sm text-ds-text-secondary">
                {UNLIMITED_CREDITS
                  ? "AI credits"
                  : `of ${entitlements.creditsPerPeriod.toLocaleString()} remaining`}
              </span>
            </div>
            <div className="text-right text-sm text-ds-text-secondary">
              {UNLIMITED_CREDITS ? (
                "No usage limits"
              ) : (
                <>
                  {creditsUsed.toLocaleString()} used
                  {periodEnd && (
                    <>
                      {" · resets "}
                      <span className="font-medium text-ds-text-primary">
                        {periodEnd.toLocaleDateString()}
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-ds-border-strong">
            <div
              className="h-full rounded-full bg-ds-accent transition-all"
              style={{ width: `${UNLIMITED_CREDITS ? 100 : usagePct}%` }}
            />
          </div>

          <p className="text-xs text-ds-text-secondary">
            {UNLIMITED_CREDITS
              ? "Unlimited AI generations — no per-word metering."
              : `~1 credit per word selected for generation · ${
                  entitlements.periodDays === 7
                    ? "resets weekly"
                    : "resets monthly"
                }`}
          </p>
        </section>

        {/* Plan features */}
        <section className="flex flex-col gap-4 rounded-2xl border border-ds-border-strong bg-ds-surface-base p-6">
          <h2 className="text-base font-semibold text-ds-text-primary">
            Your Plan Includes
          </h2>
          <ul className="flex flex-col gap-2 text-sm">
            <FeatureRow
              enabled={true}
              label={
                UNLIMITED_CREDITS
                  ? "Unlimited AI credits"
                  : `${entitlements.creditsPerPeriod.toLocaleString()} AI credits / ${entitlements.periodDays === 7 ? "week" : "month"}`
              }
            />
            <FeatureRow enabled={true} label="PNG &amp; PDF export" />
            <FeatureRow enabled={entitlements.svgExport} label="SVG export" />
            <FeatureRow enabled={entitlements.pptxExport} label="PPTX export" />
            <FeatureRow
              enabled={entitlements.brandStyles}
              label="Brand Styles"
            />
            <FeatureRow
              enabled={entitlements.removeWatermark}
              label="Remove export watermark"
            />
            <FeatureRow
              enabled={entitlements.fontUpload}
              label="Custom font upload"
            />
            <FeatureRow enabled={entitlements.topUps} label="Credit top-ups" />
          </ul>
        </section>

        {/* Plan management actions */}
        <section className="flex flex-col gap-4 rounded-2xl border border-ds-border-strong bg-ds-surface-base p-6">
          <h2 className="text-base font-semibold text-ds-text-primary">
            Change Plan
          </h2>
          <BillingActions
            currentPlan={plan}
            cancelAtPeriodEnd={user.subscription?.cancelAtPeriodEnd ?? false}
          />
        </section>

        <Link
          href="/app/settings"
          className="text-sm font-medium text-ds-text-secondary underline-offset-4 transition hover:text-ds-text-primary hover:underline"
        >
          ← Back to settings
        </Link>
      </div>
    </main>
  );
}

function FeatureRow({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`text-base ${enabled ? "text-ds-success-text" : "text-ds-text-secondary/40"}`}
        aria-hidden="true"
      >
        {enabled ? "✓" : "✗"}
      </span>
      <span
        className={
          enabled ? "text-ds-text-primary" : "text-ds-text-secondary/60"
        }
        dangerouslySetInnerHTML={{ __html: label }}
      />
    </li>
  );
}
