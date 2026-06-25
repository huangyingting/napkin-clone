"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { PanelRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Surface, cx } from "@/components/ui";

import { GenerateVisualSection } from "./mobile-generate-visual-section";
import { TextFormatSection } from "./mobile-text-format-section";
import { VisualContextSection } from "./mobile-visual-context-section";
import { useEditingSurface } from "./use-editing-surface";

/**
 * Renders a floating action button for coarse-pointer viewports that opens a
 * bottom sheet containing contextual text/visual editing sections.
 */
function MobileEditingSheet() {
  const surface = useEditingSurface();
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

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

  const { group } = surface;

  if (surface.mode !== "sheet") return null;

  const fabLabel =
    group === "text-format" ? "Open text formatting" : "Open visual editing";

  const sheetMotion = reduceMotion
    ? {
        initial: { opacity: 1, y: 0 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 0 },
      }
    : { initial: { y: "100%" }, animate: { y: 0 }, exit: { y: "100%" } };
  const backdropMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      };

  return (
    <>
      <button
        type="button"
        aria-label={fabLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={cx(
          "fixed bottom-6 right-6 z-dropdown",
          "flex h-12 w-12 items-center justify-center rounded-full",
          "bg-[var(--ds-accent,#6366f1)] text-[var(--ds-text-on-accent,#ffffff)]",
          "shadow-[var(--ds-shadow-overlay,0_8px_24px_rgba(0,0,0,0.18))]",
          "transition hover:bg-[var(--ds-accent-hover,#4f46e5)] active:scale-95",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus-ring,#6366f1)] focus-visible:ring-offset-2",
        )}
      >
        <PanelRight aria-hidden="true" className="h-5 w-5" />
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <>
                <motion.div
                  key="mobile-sheet-backdrop"
                  aria-hidden="true"
                  initial={backdropMotion.initial}
                  animate={backdropMotion.animate}
                  exit={backdropMotion.exit}
                  transition={{ duration: 0.18 }}
                  onClick={() => setOpen(false)}
                  className="fixed inset-0 z-overlay bg-ds-backdrop"
                />

                <motion.div
                  key="mobile-sheet"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Editing panel"
                  initial={sheetMotion.initial}
                  animate={sheetMotion.animate}
                  exit={sheetMotion.exit}
                  transition={{ duration: 0.24, ease: "easeOut" }}
                  className="fixed bottom-0 left-0 right-0 z-panel flex max-h-[85dvh] flex-col overflow-hidden rounded-t-2xl border-t border-[var(--ds-border-subtle,rgba(0,0,0,0.08))] bg-[var(--ds-surface-base,#ffffff)] shadow-[var(--ds-shadow-popover,0_12px_32px_rgba(0,0,0,0.18))]"
                >
                  <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-3">
                    <div
                      aria-hidden="true"
                      className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-[var(--ds-border-subtle,rgba(0,0,0,0.12))]"
                    />
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ds-text-muted,#6f7d83)]">
                      {group === "text-format" ? "Text format" : "Visual"}
                    </p>
                    <button
                      type="button"
                      aria-label="Close editing panel"
                      onClick={() => setOpen(false)}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--ds-text-muted,#52525b)] transition hover:bg-[var(--ds-state-hover,rgba(0,0,0,0.05))]"
                    >
                      <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto">
                    {group === "text-format" && (
                      <Surface elevation="flat" radius="sm" bordered={false}>
                        <GenerateVisualSection />
                        <TextFormatSection />
                      </Surface>
                    )}
                    {group === "visual-edit" && (
                      <Surface elevation="flat" radius="sm" bordered={false}>
                        <VisualContextSection />
                      </Surface>
                    )}
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

export function MobileEditingSheetHost({
  editable = true,
}: {
  editable?: boolean;
}) {
  if (!editable) {
    return null;
  }

  return <MobileEditingSheet />;
}
