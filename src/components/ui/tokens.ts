/**
 * Shared class-string tokens for the `src/components/ui/` primitives. These map
 * the agreed `--ds-*` design tokens (owned by Mouse, landing in `globals.css`)
 * onto Tailwind arbitrary-value utilities so every primitive picks up the same
 * focus ring, radii, and elevation.
 *
 * Conservative fallbacks are included inside each `var(--ds-*, …)` so the
 * primitives still render legibly if a token is momentarily absent (CSS custom
 * properties resolve at runtime). Once Mouse's tokens are present the fallbacks
 * are ignored.
 */

/**
 * Keyboard focus ring driven by `--ds-focus`. Pair with `focus-visible` so the
 * ring only shows for keyboard users.
 */
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus,#6366f1)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface,#ffffff)]";

/** Radii scale (`--ds-radius-*`). */
export const RADIUS = {
  sm: "rounded-[var(--ds-radius-sm,8px)]",
  md: "rounded-[var(--ds-radius-md,10px)]",
  lg: "rounded-[var(--ds-radius-lg,14px)]",
  xl: "rounded-[var(--ds-radius-xl,18px)]",
  pill: "rounded-[var(--ds-radius-pill,9999px)]",
} as const;

export type Radius = keyof typeof RADIUS;

/** Elevation scale (`--ds-shadow-*`). */
export const ELEVATION = {
  flat: "shadow-[var(--ds-shadow-flat,none)]",
  raised: "shadow-[var(--ds-shadow-raised,0_1px_2px_rgba(0,0,0,0.08))]",
  overlay: "shadow-[var(--ds-shadow-overlay,0_8px_24px_rgba(0,0,0,0.12))]",
  popover: "shadow-[var(--ds-shadow-popover,0_12px_32px_rgba(0,0,0,0.18))]",
} as const;

export type Elevation = keyof typeof ELEVATION;

/** Base surface fill, border color, and text color. */
export const SURFACE_BASE =
  "bg-[var(--ds-surface,#ffffff)] text-[var(--ds-text,#18181b)] border-[var(--ds-border,rgba(0,0,0,0.08))]";

/** Joins truthy class fragments. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
