import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cx, FOCUS_RING, RADIUS } from "./tokens";

export type ButtonVariant = "solid" | "subtle" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

/** Variant → class string. All colors resolve to `--ds-*` tokens. */
const VARIANT: Record<ButtonVariant, string> = {
  solid:
    "bg-[var(--ds-accent,#6366f1)] text-[var(--ds-text-on-accent,#ffffff)] hover:bg-[var(--ds-accent-hover,#4f46e5)] active:bg-[var(--ds-accent-active,#4338ca)]",
  subtle:
    "border border-[var(--ds-border,rgba(0,0,0,0.08))] bg-[var(--ds-surface-raised,#f4f4f5)] text-[var(--ds-text,#18181b)] hover:bg-[var(--ds-surface-hover,rgba(0,0,0,0.05))] active:bg-[var(--ds-surface-active,rgba(0,0,0,0.1))]",
  ghost:
    "bg-transparent text-[var(--ds-text-muted,#52525b)] hover:bg-[var(--ds-surface-hover,rgba(0,0,0,0.05))] hover:text-[var(--ds-text,#18181b)] active:bg-[var(--ds-surface-active,rgba(0,0,0,0.1))]",
  danger:
    "bg-[var(--ds-danger,#dc2626)] text-[var(--ds-text-on-accent,#ffffff)] hover:bg-[var(--ds-danger-hover,#b91c1c)] active:bg-[var(--ds-danger-hover,#991b1b)]",
};

/** Size → height + padding + text. `sm` = 28px, `md` = 32px. */
const SIZE: Record<ButtonSize, string> = {
  sm: "h-7 gap-1.5 px-2.5 text-xs",
  md: "h-8 gap-2 px-3 text-sm",
};

const BASE =
  "inline-flex select-none items-center justify-center font-medium transition-colors disabled:pointer-events-none disabled:opacity-50";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon rendered before the label. */
  leadingIcon?: ReactNode;
};

/**
 * The base text button. Variants: `solid | subtle | ghost | danger`; sizes
 * `sm` (28px) and `md` (32px). Always typed `button` unless overridden, with a
 * token-driven focus ring.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "subtle",
      size = "md",
      leadingIcon,
      type,
      className,
      children,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        className={cx(
          BASE,
          VARIANT[variant],
          SIZE[size],
          RADIUS.md,
          FOCUS_RING,
          className,
        )}
        {...rest}
      >
        {leadingIcon}
        {children}
      </button>
    );
  },
);

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Required: icon buttons have no visible text, so they must be labelled. */
  "aria-label": string;
  /** Reflected as `aria-pressed` for toggle buttons. */
  active?: boolean;
};

/** Size → square dimensions. `sm` = 28px, `md` = 32px. */
const ICON_SIZE: Record<ButtonSize, string> = {
  sm: "h-7 w-7",
  md: "h-8 w-8",
};

/**
 * A square icon-only button sharing {@link Button}'s variants and sizes. Pass an
 * `aria-label` (enforced by the type) and optionally `active` for toggles.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      variant = "ghost",
      size = "md",
      active,
      type,
      className,
      children,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        aria-pressed={active}
        className={cx(
          BASE,
          VARIANT[active ? "solid" : variant],
          ICON_SIZE[size],
          RADIUS.md,
          FOCUS_RING,
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
