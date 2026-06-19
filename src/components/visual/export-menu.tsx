"use client";

import { useRef, useState } from "react";

import { FOCUS_RING } from "@/components/motion/control-styles";
import {
  downloadBlob,
  exportPDF,
  exportPNG,
  exportPPTX,
  exportSVG,
} from "@/lib/visual/export";

interface ExportMenuProps {
  /** Ref to the SVG element to export (the main canvas visual, not thumbnails) */
  getSvgElement: () => SVGSVGElement | null;
  /** Base filename for the exported file (extension will be added) */
  filename: string;
}

/**
 * Export menu for visuals. Offers PNG (1x/2x), SVG, PDF, and PPTX downloads.
 * When a format is chosen, it serializes/rasterizes the provided SVG element
 * and triggers a browser download. Errors (e.g., failed PNG conversion) show
 * inline and are retryable.
 */
export function ExportMenu({ getSvgElement, filename }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleExportSVG = () => {
    setError(null);
    const svg = getSvgElement();
    if (!svg) {
      setError("No visual to export");
      return;
    }

    try {
      const blob = exportSVG(svg);
      downloadBlob(blob, `${filename}.svg`);
      setIsOpen(false);
    } catch {
      setError("SVG export failed");
    }
  };

  const handleExportPNG = async (scale: number) => {
    setError(null);
    setExporting(true);

    const svg = getSvgElement();
    if (!svg) {
      setError("No visual to export");
      setExporting(false);
      return;
    }

    try {
      const blob = await exportPNG(svg, scale);
      if (!blob) {
        setError("PNG conversion failed");
        setExporting(false);
        return;
      }

      const scaleLabel = scale === 1 ? "" : `@${scale}x`;
      downloadBlob(blob, `${filename}${scaleLabel}.png`);
      setIsOpen(false);
    } catch {
      setError("PNG export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleExportPDF = async () => {
    setError(null);
    setExporting(true);

    const svg = getSvgElement();
    if (!svg) {
      setError("No visual to export");
      setExporting(false);
      return;
    }

    try {
      const blob = await exportPDF(svg);
      if (!blob) {
        setError("PDF conversion failed");
        setExporting(false);
        return;
      }

      downloadBlob(blob, `${filename}.pdf`);
      setIsOpen(false);
    } catch {
      setError("PDF export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleExportPPTX = async () => {
    setError(null);
    setExporting(true);

    const svg = getSvgElement();
    if (!svg) {
      setError("No visual to export");
      setExporting(false);
      return;
    }

    try {
      const blob = await exportPPTX(svg);
      if (!blob) {
        setError("PPTX conversion failed");
        setExporting(false);
        return;
      }

      downloadBlob(blob, `${filename}.pptx`);
      setIsOpen(false);
    } catch {
      setError("PPTX export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={exporting}
        aria-label="Export visual"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={`flex h-9 items-center gap-2 rounded-full border border-black/[.08] bg-white px-4 text-sm font-medium text-zinc-900 transition hover:border-black/20 hover:bg-zinc-50 active:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[.12] dark:bg-zinc-900 dark:text-white dark:hover:border-white/30 dark:hover:bg-zinc-800 dark:active:bg-zinc-700 ${FOCUS_RING}`}
      >
        {exporting ? (
          <>
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 motion-safe:animate-spin rounded-full border-2 border-current border-t-transparent"
            />
            Exporting…
          </>
        ) : (
          "Export"
        )}
      </button>

      {isOpen && !exporting ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-10 mt-1 min-w-[180px] rounded-lg border border-black/[.08] bg-white shadow-lg dark:border-white/[.12] dark:bg-zinc-900"
        >
          <div className="p-1">
            <p className="px-3 py-2 text-xs font-semibold text-zinc-400 dark:text-zinc-500">
              Export as
            </p>

            <button
              type="button"
              role="menuitem"
              onClick={handleExportSVG}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-100 active:bg-zinc-200 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:active:bg-zinc-700 ${FOCUS_RING}`}
            >
              <span>SVG</span>
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                Vector
              </span>
            </button>

            <hr className="my-1 border-black/[.06] dark:border-white/[.08]" />

            <button
              type="button"
              role="menuitem"
              onClick={() => handleExportPNG(1)}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-100 active:bg-zinc-200 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:active:bg-zinc-700 ${FOCUS_RING}`}
            >
              <span>PNG</span>
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                1x
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => handleExportPNG(2)}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-100 active:bg-zinc-200 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:active:bg-zinc-700 ${FOCUS_RING}`}
            >
              <span>PNG</span>
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                2x
              </span>
            </button>

            <hr className="my-1 border-black/[.06] dark:border-white/[.08]" />

            <button
              type="button"
              role="menuitem"
              onClick={handleExportPDF}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-100 active:bg-zinc-200 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:active:bg-zinc-700 ${FOCUS_RING}`}
            >
              <span>PDF</span>
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                Document
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={handleExportPPTX}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-100 active:bg-zinc-200 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:active:bg-zinc-700 ${FOCUS_RING}`}
            >
              <span>PPTX</span>
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                Slide
              </span>
            </button>
          </div>

          {error ? (
            <div
              role="alert"
              className="border-t border-red-500/20 bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300"
            >
              {error}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
