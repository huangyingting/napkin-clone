import type { Metadata } from "next";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { hasEntitlement } from "@/lib/billing/entitlements";
import { listBrands } from "./actions";
import { BrandStudio } from "./brand-studio";
import { BrandStudioTeaser } from "./brand-studio-teaser";

export const metadata: Metadata = {
  title: "Brand Studio — TextIQ",
};

export default async function BrandsPage() {
  const user = await requireUser();

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { plan: true },
  });
  const canUseBrandStyles = hasEntitlement(dbUser?.plan, "brandStyles");
  const canUploadFont = hasEntitlement(dbUser?.plan, "fontUpload");

  const brands = await listBrands();

  return (
    <main className="flex flex-1 flex-col items-center bg-ds-surface-sunken px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex w-full max-w-4xl flex-col gap-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-ds-text-primary">
              Brand Studio
            </h1>
            <p className="text-sm text-ds-text-secondary">
              Create and manage saved brand styles — colors, fonts, and logos.
            </p>
          </div>
          <Link
            href="/app"
            className="text-sm font-medium text-ds-text-secondary underline-offset-4 transition hover:text-ds-text-primary hover:underline"
          >
            ← Back to documents
          </Link>
        </header>

        {canUseBrandStyles ? (
          <BrandStudio initialBrands={brands} canFontUpload={canUploadFont} />
        ) : (
          <BrandStudioTeaser />
        )}
      </div>
    </main>
  );
}
