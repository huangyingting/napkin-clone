"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { usePopMotion } from "@/components/motion/reveal";

import { getTabbableElements, nextFocusIndex } from "./focus-helpers";
import { cx, ELEVATION, RADIUS, SURFACE_BASE } from "./tokens";

export type DialogProps = {
  /** Controls visibility. The caller owns the open/close state. */
  open: boolean;
  /** Called when the dialog requests close (Escape or backdrop click). */
  onClose: () => void;
  /**
   * `id` of the heading element that labels this dialog.  Forwarded as
   * `aria-labelledby` on the dialog panel.
   */
  "aria-labelledby"?: string;
  /**
   * Reflects whether the dialog's content is busy (e.g. an in-flight async
   * action). Forwarded to the panel as `aria-busy` so assistive tech can
   * announce the busy state while a generation/regeneration is running.
   */
  "aria-busy"?: boolean;
  children: ReactNode;
  /** Extra classes applied to the dialog panel (e.g. `max-w-sm`). */
  className?: string;
};

/**
 * An accessible modal dialog primitive.
 *
 * - Portals to `document.body`.
 * - Traps Tab / Shift+Tab focus within the panel.
 * - Sets initial focus to the first tabbable descendant (or the panel itself).
 * - Restores focus to the element that was active when the dialog opened.
 * - Closes on Escape key and backdrop click.
 * - Marks the panel with `role="dialog"`, `aria-modal="true"`, and optionally
 *   `aria-labelledby`.
 * - Reduced-motion-aware enter / exit animation via {@link usePopMotion}.
 */
export function Dialog({
  open,
  onClose,
  "aria-labelledby": labelledBy,
  "aria-busy": busy,
  children,
  className,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const popMotion = usePopMotion();

  // Save the trigger's focus, then move focus into the dialog on open.
  // Restore the trigger's focus when the dialog closes.
  useEffect(() => {
    if (open) {
      lastFocusRef.current = document.activeElement as HTMLElement;
      const panel = panelRef.current;
      if (panel) {
        const focusable = getTabbableElements(panel);
        if (focusable.length > 0) {
          focusable[0].focus();
        } else {
          panel.focus();
        }
      }
    } else {
      lastFocusRef.current?.focus();
    }
  }, [open]);

  // Escape closes; Tab/Shift+Tab are trapped within the dialog.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) return;
        const focusable = getTabbableElements(panel);
        if (focusable.length === 0) {
          event.preventDefault();
          return;
        }
        const currentIdx = focusable.indexOf(
          document.activeElement as HTMLElement,
        );
        const nextIdx = nextFocusIndex(
          focusable.length,
          currentIdx,
          event.shiftKey,
        );
        event.preventDefault();
        focusable[nextIdx].focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div
          data-floating-panel="true"
          className="fixed inset-0 z-modal flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-ds-backdrop"
            aria-hidden="true"
            onClick={onClose}
          />
          {/* Panel */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            aria-busy={busy}
            // tabIndex allows focus() fallback when no tabbable child is found
            tabIndex={-1}
            initial={popMotion.initial}
            animate={popMotion.animate}
            exit={popMotion.exit}
            transition={popMotion.transition}
            className={cx(
              "relative z-raised w-full max-w-lg",
              "border p-6",
              SURFACE_BASE,
              RADIUS.lg,
              ELEVATION.popover,
              "outline-none",
              className,
            )}
          >
            {children}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
