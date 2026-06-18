"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * App Router error boundary. Wraps every route segment below the root layout in
 * a React error boundary and renders this fallback when a runtime error is
 * thrown. Must be a Client Component.
 *
 * `reset()` clears the error state and re-renders the segment's children, which
 * is the "Try again" recovery action. The root {@link SiteHeader} is part of the
 * root layout (above this boundary), so it stays visible around the fallback.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-2xl border border-black/[.06] bg-white p-8 text-center shadow-sm dark:border-white/[.08] dark:bg-zinc-950">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-2xl dark:bg-zinc-900"
        >
          ⚠️
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Something went wrong
          </h1>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            An unexpected error occurred. You can try again, or head back to the
            home page.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="flex h-12 cursor-pointer items-center justify-center rounded-full bg-zinc-900 px-6 text-base font-medium text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Try again
          </button>
          <Link
            href="/"
            className="flex h-12 items-center justify-center rounded-full border border-black/10 px-6 text-base font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-white/15 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Go home
          </Link>
        </div>
        {error.digest ? (
          <p className="font-mono text-xs text-zinc-400 dark:text-zinc-600">
            Error ID: {error.digest}
          </p>
        ) : null}
      </div>
    </main>
  );
}
