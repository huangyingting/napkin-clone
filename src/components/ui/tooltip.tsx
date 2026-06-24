"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { cx, ELEVATION, RADIUS } from "./tokens";

const TOOLTIP_GAP = 6;
const VIEWPORT_INSET = 8;

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
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [coords, setCoords] = useState({ top: -1000, left: -1000 });
  const reduce = useReducedMotion();

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;
    const triggerRect = trigger.getBoundingClientRect();
    const tooltipWidth = tooltip.offsetWidth;
    const tooltipHeight = tooltip.offsetHeight;
    const maxLeft = Math.max(
      VIEWPORT_INSET,
      window.innerWidth - tooltipWidth - VIEWPORT_INSET,
    );
    const left = Math.min(
      Math.max(
        triggerRect.left + triggerRect.width / 2 - tooltipWidth / 2,
        VIEWPORT_INSET,
      ),
      maxLeft,
    );
    const top =
      side === "top"
        ? Math.max(
            VIEWPORT_INSET,
            triggerRect.top - tooltipHeight - TOOLTIP_GAP,
          )
        : Math.min(
            window.innerHeight - tooltipHeight - VIEWPORT_INSET,
            triggerRect.bottom + TOOLTIP_GAP,
          );
    setCoords({ top, left });
  }, [side]);

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), reduce ? 0 : delay);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  };

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

  const tooltip = (
    <AnimatePresence>
      {open ? (
        <motion.span
          ref={tooltipRef}
          role="tooltip"
          id={id}
          initial={
            reduce ? { opacity: 1 } : { opacity: 0, y: side === "top" ? 2 : -2 }
          }
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.12, ease: "easeOut" }}
          style={{ top: coords.top, left: coords.left }}
          className={cx(
            "pointer-events-none fixed z-tooltip whitespace-nowrap border px-2 py-1 text-xs font-medium",
            "border-ds-border-subtle bg-ds-surface-overlay text-ds-text-primary",
            RADIUS.sm,
            ELEVATION.popover,
          )}
        >
          {label}
        </motion.span>
      ) : null}
    </AnimatePresence>
  );

  return (
    <span
      ref={triggerRef}
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
      {typeof document !== "undefined"
        ? createPortal(tooltip, document.body)
        : null}
    </span>
  );
}
