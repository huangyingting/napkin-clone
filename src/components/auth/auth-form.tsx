import type { ComponentProps, ReactNode } from "react";

const fieldClass =
  "h-11 rounded-ds-md border border-ds-border-strong bg-ds-surface-base px-3 text-sm text-ds-text-primary outline-none transition placeholder:text-ds-text-muted focus:border-ds-accent focus:ring-2 focus:ring-ds-accent/30";

const labelClass = "text-sm font-medium text-ds-text-primary";

const submitClass =
  "flex h-11 items-center justify-center rounded-ds-pill bg-ds-accent px-6 text-sm font-medium text-ds-text-on-accent transition hover:bg-ds-accent-hover disabled:opacity-60";

export function AuthField({
  label,
  labelAccessory,
  hint,
  inputClassName = "",
  ...props
}: ComponentProps<"input"> & {
  label: ReactNode;
  labelAccessory?: ReactNode;
  hint?: ReactNode;
  inputClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={props.id} className={labelClass}>
          {label}
        </label>
        {labelAccessory}
      </div>
      <input {...props} className={`${fieldClass} ${inputClassName}`.trim()} />
      {hint ? <p className="text-xs text-ds-text-secondary">{hint}</p> : null}
    </div>
  );
}

export function AuthMessage({
  children,
  kind,
}: {
  children: ReactNode;
  kind: "error" | "success" | "status";
}) {
  const className =
    kind === "error"
      ? "text-sm text-ds-danger"
      : kind === "success"
        ? "text-sm text-ds-success"
        : "rounded-ds-md border border-ds-border-subtle bg-ds-surface-base px-3 py-3 text-sm text-ds-text-secondary";

  return (
    <p role={kind === "error" ? "alert" : "status"} className={className}>
      {children}
    </p>
  );
}

export function AuthSubmitButton({
  children,
  isPending,
  pendingLabel,
  className = "",
}: {
  children: ReactNode;
  isPending: boolean;
  pendingLabel: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="submit"
      disabled={isPending}
      className={`${submitClass} ${className}`.trim()}
    >
      {isPending ? pendingLabel : children}
    </button>
  );
}
