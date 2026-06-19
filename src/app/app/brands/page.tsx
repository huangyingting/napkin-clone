import type { Metadata } from "next";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { hasEntitlement } from "@/lib/billing/entitlements";
import { listBrands } from "./actions";
import { BrandStudio } from "./brand-studio";

export const metadata: Metadata = {
  title: "Brand Studio — Napkin Clone",
};

export default async function BrandsPage() {
  const user = await requireUser();

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { plan: true },
  });
  const canUseBrandStyles = hasEntitlement(dbUser?.plan, "brandStyles");

  const brands = await listBrands();

  return (
    <main className="flex flex-1 flex-col items-center bg-ghost-wash px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex w-full max-w-4xl flex-col gap-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-ghost-text">
              Brand Studio
            </h1>
            <p className="text-sm text-ghost-secondary">
              Create and manage saved brand styles — colors, fonts, and logos.
            </p>
          </div>
          <Link
            href="/app"
            className="text-sm font-medium text-ghost-secondary underline-offset-4 transition hover:text-ghost-text hover:underline"
          >
            ← Back to documents
          </Link>
        </header>

        {canUseBrandStyles ? (
          <BrandStudio initialBrands={brands} />
        ) : (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-ghost-border bg-ghost-bg p-10 text-center">
            <p className="text-base font-semibold text-ghost-text">
              Brand Styles require Plus or Pro
            </p>
            <p className="text-sm text-ghost-secondary">
              Upgrade your plan to save and apply custom brand styles to your
              visuals.
            </p>
            <Link
              href="/app/settings/billing"
              className="rounded-full bg-ghost-accent px-5 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              Upgrade plan
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
