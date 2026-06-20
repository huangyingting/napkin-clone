"use client";

import { usePathname } from "next/navigation";

/**
 * Hides the global app chrome (the {@link SiteHeader}) on routes that must be
 * embeddable without any header/nav — the public `/embed/[shareId]` and
 * `/present/[shareId]` families. The header is rendered on the server and
 * passed in as `children`; this client wrapper simply decides whether to mount
 * it based on the current path.
 *
 * `usePathname()` resolves during SSR in the App Router, so the header is
 * absent from the very first HTML of these pages (no flash inside an iframe).
 */
export function HeaderGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname?.startsWith("/embed") || pathname?.startsWith("/present")) {
    return null;
  }

  return <>{children}</>;
}
