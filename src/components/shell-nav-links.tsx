import Link from "next/link";

import {
  SHELL_NAV_ITEM_CHROME,
  type ShellChromeVariant,
} from "@/lib/app-shell/chrome";
import type { ShellNavItem } from "@/lib/app-shell/navigation";

function classNameForNavItem(
  item: ShellNavItem,
  variant: ShellChromeVariant,
): string {
  const chrome = SHELL_NAV_ITEM_CHROME[variant];
  return item.emphasis === "primary" ? chrome.primary : chrome.default;
}

export function ShellNavLinks({
  items,
  variant,
}: {
  items: ShellNavItem[];
  variant: ShellChromeVariant;
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
