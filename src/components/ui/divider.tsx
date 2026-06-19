import { cx } from "./tokens";

export type DividerProps = {
  /** Orientation of the rule. Defaults to `vertical` (toolbar separator). */
  orientation?: "vertical" | "horizontal";
  className?: string;
};

/**
 * A 1px separator drawn with `--ds-border`. Vertical by default (for toolbars);
 * horizontal for stacked panel sections. Decorative — hidden from a11y tree.
 */
export function Divider({ orientation = "vertical", className }: DividerProps) {
  return (
    <span
      aria-hidden="true"
      role="separator"
      aria-orientation={orientation}
      className={cx(
        "shrink-0 bg-[var(--ds-border,rgba(0,0,0,0.08))]",
        orientation === "vertical" ? "mx-0.5 h-5 w-px" : "my-1 h-px w-full",
        className,
      )}
    />
  );
}
