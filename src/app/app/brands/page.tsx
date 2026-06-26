import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";

import { loadBrandStudioViewModel } from "@/lib/brand-studio/loader";
import { requireUser } from "@/lib/session";
import { BrandStudio } from "./brand-studio";
import { BrandStudioTeaser } from "./brand-studio-teaser";

export const metadata: Metadata = {
  title: "Brand Studio — TextIQ",
};

export default async function BrandsPage() {
  const user = await requireUser(redirect);
  const viewModel = await loadBrandStudioViewModel(user.id);

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

        {viewModel.canUseBrandStyles ? (
          <BrandStudio
            initialBrands={viewModel.brands}
            canFontUpload={viewModel.canUploadFont}
          />
        ) : (
          <BrandStudioTeaser />
        )}
      </div>
    </main>
  );
}
