"use client";

import { useCallback, useId, useRef, type ReactNode } from "react";

import { cx, FOCUS_RING, RADIUS } from "./tokens";
import type { ButtonSize } from "./button";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
  /** Hide the text label (icon-only); `label` is still used for a11y. */
  iconOnly?: boolean;
  disabled?: boolean;
};

export type SegmentedControlProps<T extends string> = {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Accessible group name. */
  "aria-label": string;
  size?: ButtonSize;
  className?: string;
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-7 gap-1 px-2.5 text-xs",
  md: "h-8 gap-1.5 px-3 text-sm",
  lg: "h-10 gap-2 px-4 text-sm",
};

/**
 * A single-select segmented control (`radiogroup`) replacing the bespoke
 * type-pills / theme-chips. Roving arrow-key navigation moves and selects; the
 * active segment uses the accent token. Token-driven focus ring and surfaces.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
  ...rest
}: SegmentedControlProps<T>) {
  const groupId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusIndex = useCallback((index: number) => {
    const button = refs.current[index];
    button?.focus();
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      const last = options.length - 1;
      let next = index;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        next = index === last ? 0 : index + 1;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        next = index === 0 ? last : index - 1;
      } else if (event.key === "Home") {
        next = 0;
      } else if (event.key === "End") {
        next = last;
      } else {
        return;
      }
      event.preventDefault();
      const option = options[next];
      if (option && !option.disabled) {
        onChange(option.value);
      }
      focusIndex(next);
    },
    [options, onChange, focusIndex],
  );

  return (
    <div
      role="radiogroup"
      className={cx(
        "inline-flex items-center gap-0.5 border border-[var(--ds-border-subtle,rgba(0,0,0,0.08))] bg-[var(--ds-segment-track,#f4f8fb)] p-0.5",
        RADIUS.lg,
        className,
      )}
      {...rest}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.iconOnly ? option.label : undefined}
            disabled={option.disabled}
            // Roving tabindex: only the active segment is tabbable.
            tabIndex={active ? 0 : -1}
            id={`${groupId}-${option.value}`}
            onClick={() => !option.disabled && onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cx(
              "inline-flex select-none items-center justify-center font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
              SIZE[size],
              RADIUS.md,
              active
                ? "bg-[var(--ds-accent,#6366f1)] text-[var(--ds-text-on-accent,#ffffff)]"
                : "text-[var(--ds-text-muted,#6f7d83)] hover:bg-[var(--ds-state-hover,rgba(0,0,0,0.06))] hover:text-[var(--ds-text-primary,#15171a)]",
              FOCUS_RING,
            )}
          >
            {option.icon}
            {option.iconOnly ? null : option.label}
          </button>
        );
      })}
    </div>
  );
}
