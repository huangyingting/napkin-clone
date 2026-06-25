"use client";

/**
 * Read-only Brand Studio teaser shown to free users (issue #163).
 *
 * Renders a sample brand card + a branded preview visual so users see what
 * the feature does before upgrading.  All controls are disabled/inert —
 * no mutations are possible from this path.
 */

import Link from "next/link";
import { Lock, Palette } from "lucide-react";

import { VisualRenderer } from "@/components/visual/visual-renderer";
import {
  SAMPLE_BRAND,
  buildSampleBrandedVisual,
} from "@/lib/brand/sample-visual";
import { brandPreviewStyle } from "@/lib/brand/transforms";

const SAMPLE_VISUAL = buildSampleBrandedVisual(SAMPLE_BRAND);
const PREVIEW_STYLE = brandPreviewStyle(SAMPLE_BRAND);

export function BrandStudioTeaser() {
  return (
    <div className="flex flex-col gap-6">
      {/* Upgrade banner */}
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-ds-border-strong bg-ds-surface-base p-6 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--ds-accent-subtle,#eef2ff)]">
          <Lock className="h-5 w-5 text-[var(--ds-accent,#6366f1)]" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold text-ds-text-primary">
            Brand Styles require Plus or Pro
          </p>
          <p className="text-sm text-ds-text-secondary">
            Upgrade your plan to save and apply custom brand styles — colors,
            fonts, and logos — to your visuals.
          </p>
        </div>
        <Link
          href="/app/settings/billing"
          className="rounded-full bg-ds-accent px-5 py-2 text-sm font-medium text-ds-text-on-accent transition hover:opacity-90"
        >
          Upgrade plan
        </Link>
      </div>

      {/* Read-only sample brand card */}
      <div className="relative flex flex-col gap-4 rounded-2xl border border-[var(--ds-border-subtle)] bg-ds-surface-base p-5 shadow-[var(--ds-shadow-raised)]">
        {/* Disabled overlay — intercepts all pointer events */}
        <div
          className="absolute inset-0 z-raised cursor-not-allowed rounded-2xl bg-[var(--ds-surface-base,#fff)]/60"
          aria-hidden="true"
        />

        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--ds-radius-sm)] border border-[var(--ds-border-subtle)]"
            style={{ backgroundColor: PREVIEW_STYLE.background }}
          >
            <Palette className="h-4 w-4 text-[var(--ds-text-muted)]" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-sm font-semibold text-ds-text-primary"
              style={{ fontFamily: PREVIEW_STYLE.fontFamily }}
            >
              {SAMPLE_BRAND.name}
            </p>
            {/* Palette strip */}
            <div className="mt-1 flex gap-0.5">
              {PREVIEW_STYLE.palette.slice(0, 6).map((color, i) => (
                <span
                  key={i}
                  className="h-2 w-4 rounded-sm"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Color swatches row (disabled) */}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {(
            [
              ["Background", PREVIEW_STYLE.background],
              ["Node fill", PREVIEW_STYLE.nodeFill],
              ["Node stroke", PREVIEW_STYLE.nodeStroke],
              ["Node text", PREVIEW_STYLE.nodeText],
              ["Edge", PREVIEW_STYLE.edgeColor],
            ] as [string, string][]
          ).map(([label, color]) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <span
                className="h-7 w-7 rounded-full border border-[var(--ds-border-subtle)]"
                style={{ backgroundColor: color }}
              />
              <span className="text-[10px] text-[var(--ds-text-muted)]">
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Sample visual preview */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--ds-text-muted,#6f7d83)]">
            Applied to a sample visual
          </span>
          <div className="overflow-hidden rounded-[var(--ds-radius-md,10px)] border border-[var(--ds-border-subtle)]">
            <VisualRenderer
              visual={SAMPLE_VISUAL}
              className="h-auto w-full"
              title="Sample brand applied to a visual"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
