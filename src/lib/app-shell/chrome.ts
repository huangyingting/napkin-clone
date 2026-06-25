import type { ReactNode } from "react";

import type { ShellNavItem } from "./navigation";

export type ShellChromeVariant = "desktop" | "mobileDrawer" | "mobileInline";

export type ShellAction = {
  id: string;
  slot: ReactNode;
  auth: "authenticated" | "guest" | "all";
  closeDrawerOnClick?: boolean;
};

export type ShellNavGroup = {
  id: string;
  items: ShellNavItem[];
  variant: ShellChromeVariant;
};

export const SHELL_NAV_ITEM_CHROME: Record<
  ShellChromeVariant,
  { default: string; primary: string }
> = {
  desktop: {
    default:
      "flex h-9 items-center justify-center rounded-ds-pill px-4 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary",
    primary:
      "flex h-9 items-center justify-center rounded-ds-pill bg-ds-accent px-4 text-sm font-medium text-ds-text-on-accent transition hover:opacity-90",
  },
  mobileDrawer: {
    default:
      "flex h-10 items-center rounded-ds-md px-3 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary",
    primary:
      "flex h-10 items-center rounded-ds-md px-3 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary",
  },
  mobileInline: {
    default:
      "flex h-9 items-center justify-center rounded-ds-pill px-3 text-sm font-medium text-ds-text-secondary transition hover:bg-ds-surface-sunken hover:text-ds-text-primary",
    primary:
      "flex h-9 items-center justify-center rounded-ds-pill bg-ds-accent px-3 text-sm font-medium text-ds-text-on-accent transition hover:opacity-90",
  },
};
