"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

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

  // Close drawer on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Lock body scroll while drawer is open.
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Hamburger trigger — hidden on md+ */}
      <button
        type="button"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-ghost-secondary transition hover:bg-ghost-wash hover:text-ghost-text md:hidden"
      >
        {open ? (
          <X aria-hidden="true" className="h-5 w-5" />
        ) : (
          <Menu aria-hidden="true" className="h-5 w-5" />
        )}
      </button>

      {/* Portal drawer + backdrop — guarded against SSR (no `document` on server) */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <>
                {/* Semi-transparent backdrop */}
                <motion.div
                  key="mobile-nav-backdrop"
                  aria-hidden="true"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  onClick={() => setOpen(false)}
                  className="fixed inset-0 z-overlay bg-black/30 md:hidden"
                />

                {/* Slide-in drawer */}
                <motion.div
                  key="mobile-nav-drawer"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Navigation menu"
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  className="fixed right-0 top-0 z-panel flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto border-l border-ghost-border bg-ghost-bg shadow-xl md:hidden"
                >
                  {/* Drawer header */}
                  <div className="flex h-14 shrink-0 items-center justify-between border-b border-ghost-border px-4">
                    <span className="text-sm font-semibold text-ghost-text">
                      Menu
                    </span>
                    <button
                      type="button"
                      aria-label="Close navigation menu"
                      onClick={() => setOpen(false)}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-ghost-secondary transition hover:bg-ghost-wash hover:text-ghost-text"
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
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}
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
