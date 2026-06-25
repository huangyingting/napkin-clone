import Link from "next/link";

import type { ShellNavItem } from "@/lib/app-shell/navigation";

type ShellNavLinksVariant = "desktop" | "mobileDrawer" | "mobileInline";

const desktopDefaultClass =
  "flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary";
const desktopPrimaryClass =
  "flex h-9 items-center justify-center rounded-full bg-ds-accent px-4 text-sm font-medium text-ds-text-on-accent transition hover:opacity-90";
const mobileDrawerClass =
  "flex h-10 items-center rounded-lg px-3 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary";
const mobileInlineDefaultClass =
  "flex h-9 items-center justify-center rounded-full px-3 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary";
const mobileInlinePrimaryClass =
  "flex h-9 items-center justify-center rounded-full bg-ds-accent px-3 text-sm font-medium text-ds-text-on-accent transition hover:opacity-90";

function classNameForNavItem(
  item: ShellNavItem,
  variant: ShellNavLinksVariant,
): string {
  if (variant === "mobileDrawer") {
    return mobileDrawerClass;
  }
  if (variant === "mobileInline") {
    return item.emphasis === "primary"
      ? mobileInlinePrimaryClass
      : mobileInlineDefaultClass;
  }
  return item.emphasis === "primary"
    ? desktopPrimaryClass
    : desktopDefaultClass;
}

export function ShellNavLinks({
  items,
  variant,
}: {
  items: ShellNavItem[];
  variant: ShellNavLinksVariant;
}) {
  return (
    <>
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className={classNameForNavItem(item, variant)}
        >
          {item.label}
        </Link>
      ))}
    </>
  );
}
