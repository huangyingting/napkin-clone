"use client";

import { Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { DrawerSurface } from "@/components/ui";

/**
 * Hamburger button + right-side slide-in drawer for mobile navigation.
 *
 * Intended for use in `<SiteHeader>` below the `md:` breakpoint. On md+ the
 * trigger (and the portal drawer) are hidden via `md:hidden`.
 *
 * Children are the nav links and secondary actions that should appear inside
 * the drawer; the server component renders them as pre-serialized JSX and the
 * client component decides when to mount them.
 */
export function MobileNavMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Hamburger trigger — hidden on md+ */}
      <button
        type="button"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary md:hidden"
      >
        {open ? (
          <X aria-hidden="true" className="h-5 w-5" />
        ) : (
          <Menu aria-hidden="true" className="h-5 w-5" />
        )}
      </button>

      <DrawerSurface
        open={open}
        onClose={() => setOpen(false)}
        aria-label="Navigation menu"
      >
        {/* Drawer header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-ds-border-strong px-4">
          <span className="text-sm font-semibold text-ds-text-primary">
            Menu
          </span>
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setOpen(false)}
            className="tiq-touch-target flex h-8 w-8 items-center justify-center rounded-full text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        {/* Drawer content — nav links & secondary actions */}
        <div
          className="flex flex-col gap-0.5 p-3"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          {children}
        </div>
      </DrawerSurface>
    </>
  );
}

/**
 * Wrapper for drawer items that should NOT close the drawer when clicked
 * (e.g. dropdown toggles). Stops the click from reaching the drawer's
 * click-to-close handler. Exported so server components can compose it.
 */
export function MobileNavNonClosing({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={className}
      onClick={(event) => event.stopPropagation()}
      role="presentation"
    >
      {children}
    </div>
  );
}
