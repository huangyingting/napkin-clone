"use client";

import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { SlideCanvas } from "@/components/presentation/slide-canvas";
import type { ColorToken } from "@/lib/presentation/presentation-theme";
import {
  THEME_PACKAGES,
  previewDeckForThemePackage,
  resolveThemePackageId,
  slideFromThemePackageTemplate,
  type PresentationThemePackage,
  type ThemePackageId,
} from "@/lib/presentation/theme-packages";
import type { Visual } from "@/lib/visual/schema";
import { cx, FOCUS_RING } from "@/components/ui/tokens";

const PACKAGE_PRESETS = THEME_PACKAGES;
const EMPTY_VISUALS: ReadonlyMap<string, Visual> = new Map<string, Visual>();

const PREVIEW_KEYS: ReadonlyArray<keyof ColorToken> = [
  "slideBg",
  "surface",
  "accent",
  "onBg",
];

function PaletteStrip({ colors }: { colors: ColorToken }) {
  return (
    <span aria-hidden="true" className="flex gap-0.5">
      {PREVIEW_KEYS.map((key) => (
        <span
          key={key}
          className="h-2.5 w-2.5 rounded-sm border border-ds-border-subtle"
          style={{ backgroundColor: colors[key] }}
        />
      ))}
    </span>
  );
}

function ThemeCard({
  name,
  colors,
  preview,
  active,
  onApply,
}: {
  name: string;
  colors: ColorToken;
  preview?: ReactNode;
  active: boolean;
  onApply: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onApply}
      aria-pressed={active}
      className={cx(
        "flex w-full flex-col gap-1.5 rounded-ds-md border bg-ds-surface-raised p-2 text-left transition-shadow",
        active
          ? "border-ds-accent ring-2 ring-ds-accent-surface"
          : "border-ds-border-subtle hover:border-ds-border-strong",
        FOCUS_RING,
      )}
    >
      {preview ?? (
        <span
          aria-hidden="true"
          className="h-9 w-full rounded-ds-sm border border-ds-border-subtle"
          style={{ backgroundColor: colors.slideBg }}
        >
          <span className="flex h-full items-end p-1">
            <PaletteStrip colors={colors} />
          </span>
        </span>
      )}
      <span className="truncate text-[11px] font-semibold text-ds-text-primary">
        {name}
      </span>
    </button>
  );
}

function ThemeCoverPreview({
  themePackage,
}: {
  themePackage: PresentationThemePackage;
}) {
  const template =
    themePackage.templates.find((entry) => entry.id.endsWith(":cover")) ??
    themePackage.templates[0];
  return (
    <span
      aria-hidden="true"
      className="relative block aspect-video w-full overflow-hidden rounded-ds-sm border border-ds-border-subtle bg-ds-surface-base"
    >
      <SlideCanvas
        slide={slideFromThemePackageTemplate(template)}
        deck={previewDeckForThemePackage(themePackage)}
        visuals={EMPTY_VISUALS}
        preview
      />
    </span>
  );
}

function Pager({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-ds-border-subtle pt-1.5">
      <button
        type="button"
        aria-label="Previous theme page"
        disabled={page === 0}
        onClick={() => onPageChange(Math.max(0, page - 1))}
        className={cx(
          "flex h-7 w-7 items-center justify-center rounded-ds-sm text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary disabled:cursor-not-allowed disabled:opacity-35",
          FOCUS_RING,
        )}
      >
        <ChevronLeft size={15} aria-hidden="true" />
      </button>
      <span className="text-[11px] font-medium tabular-nums text-ds-text-muted">
        {page + 1} / {pageCount}
      </span>
      <button
        type="button"
        aria-label="Next theme page"
        disabled={page >= pageCount - 1}
        onClick={() => onPageChange(Math.min(pageCount - 1, page + 1))}
        className={cx(
          "flex h-7 w-7 items-center justify-center rounded-ds-sm text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary disabled:cursor-not-allowed disabled:opacity-35",
          FOCUS_RING,
        )}
      >
        <ChevronRight size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

export function PresentationThemePanel({
  themeId,
  onApplyThemePackage,
}: {
  themeId: string;
  onApplyThemePackage: (themeId: ThemePackageId) => void;
}) {
  const [themePage, setThemePage] = useState(0);
  const themePageSize = 4;
  const themePageCount = Math.max(
    1,
    Math.ceil(PACKAGE_PRESETS.length / themePageSize),
  );
  const safeThemePage = Math.min(themePage, themePageCount - 1);
  const visibleThemes = PACKAGE_PRESETS.slice(
    safeThemePage * themePageSize,
    safeThemePage * themePageSize + themePageSize,
  );

  return (
    <div className="flex w-[300px] flex-col gap-3 p-1">
      <div className="flex items-center justify-center">
        <span className="text-xs font-bold uppercase tracking-wide text-ds-text-muted">
          Theme
        </span>
      </div>

      <div className="flex flex-col gap-2 pr-0.5">
        <div className="grid grid-cols-2 gap-2">
          {visibleThemes.map((themePackage) => (
            <ThemeCard
              key={themePackage.id}
              name={themePackage.name}
              colors={themePackage.tokenSet.colors}
              preview={<ThemeCoverPreview themePackage={themePackage} />}
              active={resolveThemePackageId(themeId) === themePackage.id}
              onApply={() => onApplyThemePackage(themePackage.id)}
            />
          ))}
        </div>
        <Pager
          page={safeThemePage}
          pageCount={themePageCount}
          onPageChange={setThemePage}
        />
      </div>
    </div>
  );
}
