"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { usePopMotion } from "@/components/motion/reveal";

import { cx, MENU_CHROME } from "./tokens";

// Gap (px) between the trigger's bottom edge and the panel — matches the old
// `mt-2` spacing.
const PANEL_GAP = 8;

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
 * - The panel is **`position: fixed`**, positioned from the trigger's bounding
 *   box. Fixed positioning lets the panel escape any `overflow` ancestor (e.g.
 *   a horizontally-scrollable toolbar) that would otherwise clip it —
 *   `overflow-x: auto` forces `overflow-y` to compute as `auto`, which used to
 *   clip dropdowns rendered below the row. It stays a DOM child of the trigger,
 *   so it keeps the surrounding stacking context (the `z-dropdown` panel paints
 *   above a `z-modal` editor as before).
 * - Repositions on scroll / resize so it stays pinned to the trigger.
 * - Closes on Escape key and pointer-down outside the container.
 * - Reduced-motion-aware enter / exit animation via {@link usePopMotion}.
 * - Default placement: bottom-end (right edge aligned to the trigger's right
 *   edge, just below it). Pass `className` to override sizing/appearance.
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
  // Fixed-viewport coordinates: pin the panel's top to the trigger's bottom and
  // its right edge to the trigger's right edge (replicates the old
  // `right-0 top-full` placement).
  const [coords, setCoords] = useState<{ top: number; right: number }>({
    top: -1000,
    right: -1000,
  });

  const reposition = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({
      top: rect.bottom + PANEL_GAP,
      right: Math.max(0, window.innerWidth - rect.right),
    });
  }, []);

  // Measure the trigger on open and keep the panel pinned while the user
  // scrolls or resizes.
  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, reposition]);

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
            style={{ top: coords.top, right: coords.right }}
            className={cx(
              "fixed z-dropdown",
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
