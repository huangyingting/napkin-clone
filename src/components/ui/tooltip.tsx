"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useId, useRef, useState, type ReactNode } from "react";

import { cx, ELEVATION, RADIUS } from "./tokens";

export type TooltipProps = {
  /** The tooltip text. */
  label: ReactNode;
  /** The trigger element. */
  children: ReactNode;
  /** Placement relative to the trigger. Defaults to `top`. */
  side?: "top" | "bottom";
  /** Delay in ms before showing. Defaults to 350. */
  delay?: number;
};

/**
 * A lightweight, accessible tooltip. The trigger wrapper is described by the
 * tooltip via `aria-describedby`; it appears on hover *and* keyboard focus
 * (focus/blur bubble from the inner control) and hides on blur/Escape. Motion
 * collapses to an instant show under reduced-motion.
 *
 * Note: tooltips supplement, they do not replace, an `aria-label` on icon-only
 * triggers — keep both.
 */
export function Tooltip({
  label,
  children,
  side = "top",
  delay = 350,
}: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduce = useReducedMotion();

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), reduce ? 0 : delay);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  };

  return (
    <span
      className="relative inline-flex"
      aria-describedby={open ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={(event) => {
        if (event.key === "Escape") hide();
      }}
    >
      {children}
      <AnimatePresence>
        {open ? (
          <motion.span
            role="tooltip"
            id={id}
            initial={
              reduce
                ? { opacity: 1 }
                : { opacity: 0, y: side === "top" ? 2 : -2 }
            }
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.12, ease: "easeOut" }}
            className={cx(
              "pointer-events-none absolute left-1/2 z-tooltip -translate-x-1/2 whitespace-nowrap px-2 py-1 text-xs font-medium",
              "bg-[var(--ds-text-primary,#15171a)] text-[var(--ds-surface-base,#ffffff)]",
              RADIUS.sm,
              ELEVATION.overlay,
              side === "top"
                ? "bottom-[calc(100%+6px)]"
                : "top-[calc(100%+6px)]",
            )}
          >
            {label}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
