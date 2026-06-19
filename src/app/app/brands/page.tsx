import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/session";
import { listBrands } from "./actions";
import { BrandStudio } from "./brand-studio";

export const metadata: Metadata = {
  title: "Brand Studio — Napkin Clone",
};

export default async function BrandsPage() {
  await requireUser();
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

        <BrandStudio initialBrands={brands} />
      </div>
    </main>
  );
}
