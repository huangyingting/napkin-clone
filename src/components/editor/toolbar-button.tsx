"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { FOCUS_RING } from "@/components/motion/control-styles";
import { Tooltip, cx } from "@/components/ui";

export function EditorToolbarGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex min-w-0 flex-wrap items-center gap-1"
    >
      {children}
    </div>
  );
}

export function EditorToolbarDivider() {
  return (
    <div
      aria-hidden="true"
      className="hidden h-7 w-px shrink-0 bg-ds-border-subtle md:block"
    />
  );
}

export function editorToolbarButtonClass({
  active = false,
  iconOnly = false,
  className,
}: {
  active?: boolean;
  iconOnly?: boolean;
  className?: string;
} = {}) {
  return cx(
    "inline-flex h-8 items-center justify-center gap-1.5 rounded-ds-md border border-ds-border-subtle bg-ds-surface-raised text-sm font-medium text-ds-text-primary shadow-ds-raised transition-colors hover:bg-ds-state-hover active:bg-ds-state-active disabled:cursor-not-allowed disabled:opacity-50",
    iconOnly ? "w-8 px-0" : "px-3",
    active &&
      "border-ds-accent-border bg-ds-accent-surface text-ds-accent-text",
    FOCUS_RING,
    className,
  );
}

export type EditorToolbarButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "title"
> & {
  label: string;
  icon?: ReactNode;
  iconOnly?: boolean;
  active?: boolean;
  tooltip?: ReactNode;
  tooltipSide?: "top" | "bottom";
};

export const EditorToolbarButton = forwardRef<
  HTMLButtonElement,
  EditorToolbarButtonProps
>(function EditorToolbarButton(
  {
    label,
    icon,
    iconOnly = false,
    active = false,
    tooltip = label,
    tooltipSide = "bottom",
    className,
    children,
    type,
    "aria-label": ariaLabel,
    ...props
  },
  ref,
) {
  const button = (
    <button
      ref={ref}
      type={type ?? "button"}
      aria-label={ariaLabel ?? label}
      className={editorToolbarButtonClass({ active, iconOnly, className })}
      {...props}
    >
      {children ?? (
        <>
          {icon}
          <span className={iconOnly ? "sr-only" : undefined}>{label}</span>
        </>
      )}
    </button>
  );

  return (
    <Tooltip label={tooltip} side={tooltipSide}>
      {button}
    </Tooltip>
  );
});
