"use client";

/**
 * OverallAdjustmentsPanel — document-level toolbox rendered in the right rail.
 *
 * Appears when the editor context kind is "none" or "empty-block" (i.e. the
 * user clicked empty canvas space, not on a visual or a non-empty text block).
 *
 * Controls:
 *  • Apply a theme to ALL visuals  (applyTheme + $nodesOfType)
 *  • Apply a brand to ALL visuals  (applyBrand + $nodesOfType)
 *  • A4 / page-break indicator toggle  (via PageBreakContext)
 *  • Export document entry point  (DocumentExportButton)
 *
 * Every mutation goes through editor.update() — never touches Yjs directly —
 * satisfying the collab-safe invariant from the architecture decision log.
 */

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $nodesOfType } from "lexical";
import { FileDown, LayoutTemplate, Palette, Rows3 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Divider, Surface, Tooltip } from "@/components/ui";
import { cx } from "@/components/ui/tokens";
import { FOCUS_RING } from "@/components/motion/control-styles";
import { DocumentExportButton } from "@/components/editor/document-export-button";
import type { BrandStyle } from "@/lib/brand/schema";
import { BRAND_WEB_FONTS } from "@/lib/brand/schema";
import { applyBrand, brandPreviewStyle } from "@/lib/brand/transforms";
import { STYLE_THEMES } from "@/lib/visual/themes";
import { applyTheme } from "@/lib/visual/transforms";
import { applyElasticLayout } from "@/lib/visual/transforms";

import { VisualNode } from "./visual-node";

// ---------------------------------------------------------------------------
// useBrands — fetches brands lazily from /api/brand
// ---------------------------------------------------------------------------

function useBrands() {
  const [brands, setBrands] = useState<BrandStyle[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");

  const load = useCallback(async () => {
    if (status !== "idle") return;
    setStatus("loading");
    try {
      const res = await fetch("/api/brand");
      if (!res.ok) return;
      const json = (await res.json()) as { brands?: unknown };
      if (Array.isArray(json.brands)) {
        setBrands(json.brands as BrandStyle[]);
      }
    } catch {
      // Best-effort; ignore errors
    } finally {
      setStatus("done");
    }
  }, [status]);

  return { brands, status, load };
}

// ---------------------------------------------------------------------------
// SectionLabel
// ---------------------------------------------------------------------------

function SectionLabel({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted,#6f7d83)]">
      <span
        aria-hidden="true"
        className="h-3.5 w-3.5 [&>svg]:h-3.5 [&>svg]:w-3.5"
      >
        {icon}
      </span>
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// ThemeSection — apply a theme to all visuals
// ---------------------------------------------------------------------------

function ThemeSection() {
  const [editor] = useLexicalComposerContext();

  const applyThemeToAll = useCallback(
    (themeId: string) => {
      editor.update(() => {
        const nodes = $nodesOfType(VisualNode);
        for (const node of nodes) {
          node.setVisual(
            applyElasticLayout(applyTheme(node.getVisual(), themeId)),
          );
        }
      });
    },
    [editor],
  );

  return (
    <div className="p-3">
      <SectionLabel icon={<Palette />}>Theme — all visuals</SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        {STYLE_THEMES.map((theme) => (
          <Tooltip
            key={theme.id}
            label={`Apply "${theme.name}" to all visuals`}
          >
            <button
              type="button"
              aria-label={`Apply ${theme.name} theme to all visuals`}
              onClick={() => applyThemeToAll(theme.id)}
              className={cx(
                "flex h-8 w-8 flex-col items-center justify-center gap-0.5 rounded-[var(--ds-radius-sm,8px)] border transition",
                "border-[var(--ds-border-subtle,rgba(0,0,0,0.1))] hover:border-[var(--ds-border-strong,rgba(0,0,0,0.2))]",
                FOCUS_RING,
              )}
              style={{ backgroundColor: theme.colors.nodeFill }}
              title={theme.name}
            >
              <span
                aria-hidden="true"
                className="h-2 w-4 rounded-full"
                style={{ backgroundColor: theme.colors.nodeStroke }}
              />
              <span className="sr-only">{theme.name}</span>
            </button>
          </Tooltip>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] text-[var(--ds-text-muted,#6f7d83)]">
        One click re-themes every visual in the document.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BrandSection — apply a brand to all visuals
// ---------------------------------------------------------------------------

function BrandSection() {
  const [editor] = useLexicalComposerContext();
  const { brands, status, load } = useBrands();

  // Lazy-load brands when section is first rendered.
  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applyBrandToAll = useCallback(
    (brand: BrandStyle) => {
      // Load the web font for the brand so text renders correctly.
      if (brand.fontFamily) {
        const match = BRAND_WEB_FONTS.find(
          (f) => f.cssFamily === brand.fontFamily,
        );
        if (match) {
          const id = `gfont-brand-${match.id}`;
          if (!document.getElementById(id)) {
            const link = document.createElement("link");
            link.id = id;
            link.rel = "stylesheet";
            link.href = match.url;
            document.head.appendChild(link);
          }
        }
      }
      editor.update(() => {
        const nodes = $nodesOfType(VisualNode);
        for (const node of nodes) {
          node.setVisual(
            applyElasticLayout(applyBrand(node.getVisual(), brand)),
          );
        }
      });
    },
    [editor],
  );

  if (status === "done" && brands.length === 0) return null;

  return (
    <div className="p-3">
      <SectionLabel icon={<LayoutTemplate />}>Brand — all visuals</SectionLabel>
      {status !== "done" ? (
        <p className="text-[11px] text-[var(--ds-text-muted,#6f7d83)]">
          Loading brands…
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {brands.map((brand) => {
            const preview = brandPreviewStyle(brand);
            return (
              <Tooltip
                key={brand.id}
                label={`Apply brand "${brand.name}" to all visuals`}
              >
                <button
                  type="button"
                  aria-label={`Apply brand ${brand.name} to all visuals`}
                  onClick={() => applyBrandToAll(brand)}
                  className={cx(
                    "flex flex-col items-center gap-1 rounded-[var(--ds-radius-sm,8px)] border p-1.5 transition",
                    "border-[var(--ds-border-subtle,rgba(0,0,0,0.1))] hover:border-[var(--ds-border-strong,rgba(0,0,0,0.2))]",
                    FOCUS_RING,
                  )}
                >
                  <span
                    className="flex h-8 w-8 items-center justify-center gap-0.5 rounded-[4px] border p-1"
                    style={{
                      backgroundColor: preview.nodeFill,
                      borderColor: preview.nodeStroke,
                    }}
                  >
                    {preview.palette.slice(0, 3).map((color, i) => (
                      <span
                        key={i}
                        aria-hidden="true"
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </span>
                  <span className="max-w-[56px] truncate text-[9px] font-medium text-[var(--ds-text-muted,#6f7d83)]">
                    {brand.name}
                  </span>
                </button>
              </Tooltip>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PageLayoutSection — A4 page-break indicator toggle
// ---------------------------------------------------------------------------

function PageLayoutSection({
  showPageBreaks,
  onTogglePageBreaks,
}: {
  showPageBreaks: boolean;
  onTogglePageBreaks: () => void;
}) {
  return (
    <div className="p-3">
      <SectionLabel icon={<Rows3 />}>Page layout</SectionLabel>
      <button
        type="button"
        role="switch"
        aria-checked={showPageBreaks}
        onClick={onTogglePageBreaks}
        className={cx(
          "flex w-full items-center justify-between rounded-[var(--ds-radius-sm,8px)] border px-3 py-2 text-sm transition",
          showPageBreaks
            ? "border-[var(--ds-accent,#6366f1)] bg-[var(--ds-accent,#6366f1)]/10 text-[var(--ds-accent,#6366f1)]"
            : "border-[var(--ds-border-subtle,rgba(0,0,0,0.1))] bg-[var(--ds-surface-base,#fff)] text-[var(--ds-text-primary,#111)] hover:border-[var(--ds-border-strong,rgba(0,0,0,0.2))]",
          FOCUS_RING,
        )}
      >
        <span className="flex items-center gap-2">
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className="h-3.5 w-3.5 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M2 5h12M2 11h12" />
          </svg>
          A4 page breaks
        </span>
        <span
          className={cx(
            "h-4 w-7 rounded-full transition",
            showPageBreaks
              ? "bg-[var(--ds-accent,#6366f1)]"
              : "bg-[var(--ds-border-strong,rgba(0,0,0,0.2))]",
          )}
          aria-hidden="true"
        >
          <span
            className={cx(
              "block h-3 w-3 translate-y-0.5 rounded-full bg-white shadow transition-transform",
              showPageBreaks ? "translate-x-3.5" : "translate-x-0.5",
            )}
          />
        </span>
      </button>
      <p className="mt-1.5 text-[10px] text-[var(--ds-text-muted,#6f7d83)]">
        Show where A4 page boundaries fall.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExportSection
// ---------------------------------------------------------------------------

function ExportSection({ documentTitle }: { documentTitle?: string }) {
  return (
    <div className="p-3">
      <SectionLabel icon={<FileDown />}>Export document</SectionLabel>
      <DocumentExportButton documentTitle={documentTitle ?? "Untitled"} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// OverallAdjustmentsPanel — the root component
// ---------------------------------------------------------------------------

export interface OverallAdjustmentsPanelProps {
  /** The document title — passed to DocumentExportButton. */
  documentTitle?: string;
  /** Whether A4 page-break indicators are currently shown. */
  showPageBreaks: boolean;
  /** Toggle the A4 page-break indicator on/off. */
  onTogglePageBreaks: () => void;
}

/**
 * Document-level overall-adjustments toolbox.  Rendered in the editing rail
 * whenever the editor context kind is "none" or "empty-block".
 *
 * Distinct from the +// insert menu (BlockSpark / InsertMenu), which handles
 * inserting new blocks.  This panel surfaces document-wide adjustments.
 */
export function OverallAdjustmentsPanel({
  documentTitle,
  showPageBreaks,
  onTogglePageBreaks,
}: OverallAdjustmentsPanelProps) {
  return (
    <Surface elevation="flat" radius="sm" bordered={false} className="flex-1">
      <div className="px-3 pb-1 pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted,#6f7d83)]">
          Document adjustments
        </p>
      </div>
      <Divider />
      <ThemeSection />
      <Divider />
      <BrandSection />
      <Divider />
      <PageLayoutSection
        showPageBreaks={showPageBreaks}
        onTogglePageBreaks={onTogglePageBreaks}
      />
      <Divider />
      <ExportSection documentTitle={documentTitle} />
    </Surface>
  );
}
