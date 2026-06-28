"use client";

import { Monitor, Moon, Palette, Sun } from "lucide-react";

import { useThemeMode } from "@/components/theme-provider";
import { SelectMenu, cx } from "@/components/ui";
import type { SelectMenuOption } from "@/components/ui";
import type { ShellChromeVariant } from "@/lib/app-shell/chrome";
import { isAppThemeMode, type AppThemeMode } from "@/lib/app-shell/theme";

const MODE_LABEL: Record<AppThemeMode, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
  ocean: "Ocean",
  mint: "Mint",
  rose: "Rose",
  amber: "Amber",
};

const MODE_ICON: Record<AppThemeMode, typeof Monitor> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
  ocean: Palette,
  mint: Palette,
  rose: Palette,
  amber: Palette,
};

const MODE_SWATCH: Partial<Record<AppThemeMode, string>> = {
  ocean: "#0891b2",
  mint: "#059669",
  rose: "#e11d48",
  amber: "#d97706",
};

function themeIcon(mode: AppThemeMode) {
  const Icon = MODE_ICON[mode];
  const swatch = MODE_SWATCH[mode];

  return (
    <span className="relative flex h-4 w-4 items-center justify-center">
      {swatch ? (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 rounded-full border border-ds-border-subtle shadow-ds-flat"
          style={{ backgroundColor: swatch }}
        />
      ) : (
        <Icon aria-hidden="true" className="h-4 w-4" />
      )}
    </span>
  );
}

const THEME_OPTIONS: readonly SelectMenuOption[] = (
  Object.keys(MODE_LABEL) as AppThemeMode[]
).map((mode) => ({
  value: mode,
  label: MODE_LABEL[mode],
  icon: themeIcon(mode),
}));

export function ThemeModeButton({
  variant = "desktop",
}: {
  variant?: ShellChromeVariant;
}) {
  const { mode, resolvedMode, setMode } = useThemeMode();
  const currentLabel =
    mode === "system"
      ? `${MODE_LABEL[mode]} (${MODE_LABEL[resolvedMode]})`
      : MODE_LABEL[mode];
  const showSelectedLabel = variant === "mobileDrawer";
  const buttonClassName = cx(
    variant === "mobileDrawer"
      ? "tiq-touch-target h-10 w-full max-w-none justify-start rounded-ds-md px-3 text-sm"
      : "h-9 max-w-none rounded-ds-pill px-2.5",
    "text-ds-text-secondary hover:bg-ds-surface-sunken hover:text-ds-text-primary",
  );

  return (
    <SelectMenu
      value={mode}
      options={THEME_OPTIONS}
      onChange={(value) => {
        if (isAppThemeMode(value)) setMode(value);
      }}
      aria-label={`Theme: ${currentLabel}`}
      align={variant === "mobileDrawer" ? "start" : "end"}
      buttonClassName={buttonClassName}
      menuClassName="w-40"
      placeholder="Theme"
      scrollable={false}
      showSelectedLabel={showSelectedLabel}
      showChevron
      textSize="sm"
      triggerIcon={showSelectedLabel ? undefined : themeIcon(mode)}
      tooltipLabel={
        variant === "mobileDrawer" ? undefined : `Theme: ${currentLabel}`
      }
    />
  );
}
