import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found — TextIQ",
};

/**
 * App Router not-found UI. Rendered for unmatched routes and whenever a route
 * segment calls `notFound()`. It's a Server Component (no interactivity needed)
 * styled to match the app's zinc theme with light/dark variants. The root
 * {@link SiteHeader} from the layout stays visible above it.
 */
export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-2xl border border-black/[.06] bg-white p-8 text-center shadow-sm dark:border-white/[.08] dark:bg-zinc-950">
        <span className="text-5xl font-semibold tracking-tight text-zinc-300 dark:text-zinc-700">
          404
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Page not found
          </h1>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            The page you’re looking for doesn’t exist or may have been moved.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="flex h-12 items-center justify-center rounded-full bg-zinc-900 px-6 text-base font-medium text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Go home
          </Link>
          <Link
            href="/app"
            className="flex h-12 items-center justify-center rounded-full border border-black/10 px-6 text-base font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-white/15 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
