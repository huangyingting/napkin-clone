"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";

import { usePopMotion } from "@/components/motion/reveal";

import { cx, MENU_CHROME } from "./tokens";

export type PopoverProps = {
  /** Controls panel visibility. The caller owns the open/close state. */
  open: boolean;
  /** Called when the popover requests close (Escape or outside-click). */
  onClose: () => void;
  /**
   * The trigger element rendered adjacent to the panel.  Both the trigger and
   * the panel are wrapped in a `relative` container so click-outside detection
   * can treat them as a single unit without relying on `stopPropagation`.
   */
  trigger: ReactNode;
  /** Panel content. */
  children: ReactNode;
  /** Extra classes applied to the panel (e.g. sizing, custom placement). */
  className?: string;
  /** ARIA role for the panel. Defaults to `"dialog"`. */
  role?: string;
  "aria-label"?: string;
};

/**
 * An accessible anchored-popover primitive.
 *
 * - Wraps both the trigger and panel in a `position: relative` container so
 *   click-outside detection uses ref containment (no `stopPropagation`).
 * - Closes on Escape key and pointer-down outside the container.
 * - Reduced-motion-aware enter / exit animation via {@link usePopMotion}.
 * - Default placement: bottom-end (`absolute right-0 top-full mt-2`).  Pass
 *   `className` to override positioning for other placements.
 */
export function Popover({
  open,
  onClose,
  trigger,
  children,
  className,
  role = "dialog",
  "aria-label": ariaLabel,
}: PopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const popMotion = usePopMotion();

  // Escape closes the popover.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Pointer-down outside the container closes the popover.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open, onClose]);

  return (
    <div ref={containerRef} className="relative">
      {trigger}
      <AnimatePresence>
        {open ? (
          <motion.div
            role={role}
            aria-label={ariaLabel}
            initial={popMotion.initial}
            animate={popMotion.animate}
            exit={popMotion.exit}
            transition={popMotion.transition}
            className={cx(
              "absolute right-0 top-full z-dropdown mt-2",
              "w-80 p-4",
              MENU_CHROME,
              className,
            )}
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
