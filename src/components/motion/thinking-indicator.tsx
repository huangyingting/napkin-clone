"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Animated "thinking" indicator shown while a generation request is in flight
 * (US-016). Three dots pulse/bob in sequence to communicate ongoing work. The
 * animation is driven by framer-motion and collapses to a static, no-motion
 * state when the user prefers reduced motion — the dots and the label still
 * render so the busy state stays legible without any movement.
 *
 * Renders its own `role="status"` live region, so callers should not wrap it in
 * another one.
 */
export function ThinkingIndicator({
  label = "Thinking…",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 ${className}`}
    >
      <span aria-hidden="true" className="inline-flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="block h-1.5 w-1.5 rounded-full bg-current"
            animate={
              reduce
                ? { opacity: 0.6 }
                : { opacity: [0.3, 1, 0.3], y: [0, -2, 0] }
            }
            transition={
              reduce
                ? { duration: 0 }
                : {
                    duration: 0.9,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: i * 0.15,
                  }
            }
          />
        ))}
      </span>
      <span>{label}</span>
    </span>
  );
}
