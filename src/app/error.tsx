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
    <main className="flex flex-1 items-center justify-center bg-ds-surface-sunken px-6 py-16">
      <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-2xl border border-ds-border-subtle bg-ds-surface-raised p-8 text-center shadow-sm">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-ds-surface-sunken text-2xl"
        >
          ⚠️
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-ds-text-primary">
            Something went wrong
          </h1>
          <p className="text-sm leading-6 text-ds-text-secondary">
            An unexpected error occurred. You can try again, or head back to the
            home page.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="flex h-12 cursor-pointer items-center justify-center rounded-full bg-ds-control px-6 text-base font-medium text-ds-control-text transition hover:bg-ds-control-hover"
          >
            Try again
          </button>
          <Link
            href="/"
            className="flex h-12 items-center justify-center rounded-full border border-ds-border-subtle px-6 text-base font-medium text-ds-text-secondary transition hover:bg-ds-state-hover hover:text-ds-text-primary"
          >
            Go home
          </Link>
        </div>
        {error.digest ? (
          <p className="font-mono text-xs text-ds-text-muted">
            Error ID: {error.digest}
          </p>
        ) : null}
      </div>
    </main>
  );
}
