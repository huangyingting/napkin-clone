"use client";

import type { ReactNode } from "react";

import { cx, FOCUS_RING } from "./tokens";

export type TabOption<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
};

export type TabsProps<T extends string> = {
  options: ReadonlyArray<TabOption<T>>;
  value: T;
  onChange: (value: T) => void;
  "aria-label": string;
  className?: string;
  size?: "sm" | "md";
};

const SIZE = {
  sm: "px-2 py-1.5 text-xs",
  md: "px-2 py-2 text-xs",
} as const;

export function Tabs<T extends string>({
  options,
  value,
  onChange,
  className,
  size = "md",
  ...rest
}: TabsProps<T>) {
  return (
    <div
      role="tablist"
      className={cx(
        "grid gap-0 border-b border-ds-border-subtle",
        options.length === 2 && "grid-cols-2",
        options.length === 3 && "grid-cols-3",
        options.length === 4 && "grid-cols-4",
        options.length > 4 && "grid-flow-col auto-cols-fr overflow-x-auto",
        className,
      )}
      {...rest}
    >
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={option.disabled}
            onClick={() => !option.disabled && onChange(option.value)}
            className={cx(
              "relative -mb-px flex min-w-0 items-center justify-center gap-1 rounded-t-ds-md font-bold transition-colors after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full disabled:pointer-events-none disabled:opacity-45",
              SIZE[size],
              active
                ? "bg-ds-surface-raised/60 text-ds-accent-text after:bg-ds-accent"
                : "text-ds-text-muted after:bg-transparent hover:bg-ds-state-hover hover:text-ds-text-primary",
              FOCUS_RING,
            )}
          >
            {option.icon}
            <span className="min-w-0 truncate">{option.label}</span>
            {option.badge ? (
              <span className="shrink-0">{option.badge}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
