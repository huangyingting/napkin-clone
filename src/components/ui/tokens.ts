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
 * Keyboard focus ring driven by `--ds-focus-ring`. Pair with `focus-visible`
 * so the ring only shows for keyboard users.
 */
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus-ring,#15171a)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-focus-offset,#ffffff)]";

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
  "bg-[var(--ds-surface-base,#ffffff)] text-[var(--ds-text-primary,#15171a)] border-[var(--ds-border-subtle,rgba(0,0,0,0.08))]";

/** Shared form field chrome for inputs, selects, and textareas. */
export const FIELD_CONTROL = cx(
  "border border-ds-border-subtle bg-ds-surface-raised text-sm text-ds-text-primary placeholder:text-ds-text-muted",
  "focus:border-ds-border-strong focus:outline-none focus:ring-2 focus:ring-ds-focus-ring/10",
  RADIUS.md,
);

/** Shared page card/panel shell. */
export const PANEL_CHROME = cx(
  "border border-ds-border-subtle bg-ds-surface-raised text-ds-text-primary",
  RADIUS.lg,
);

/** Shared empty-state shell. */
export const EMPTY_STATE_CHROME = cx(
  "border border-dashed border-ds-border-strong bg-ds-surface-raised text-center",
  RADIUS.lg,
);

/** Shared dropdown/menu shell. */
export const MENU_CHROME = cx(
  "overflow-hidden border border-ds-border-subtle bg-ds-surface-overlay py-1",
  RADIUS.md,
  ELEVATION.popover,
);

/** Shared menu item row. */
export const MENU_ITEM =
  "flex w-full items-center px-3 py-2 text-left text-sm text-ds-text-secondary transition hover:bg-ds-state-hover hover:text-ds-text-primary";

/** Joins truthy class fragments. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
