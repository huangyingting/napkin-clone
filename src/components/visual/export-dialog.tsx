"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Download, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { createPortal } from "react-dom";

import { usePopMotion } from "@/components/motion/reveal";
import {
  Button,
  IconButton,
  SegmentedControl,
  cx,
  FOCUS_RING,
  type SegmentedOption,
} from "@/components/ui";
import {
  applyExportOptionsToSvg,
  DEFAULT_EXPORT_OPTIONS,
  type BackgroundMode,
  type ColorMode,
  type ExportOptions,
} from "@/lib/visual/export-options";
import {
  downloadBlob,
  exportPDF,
  exportPNG,
  exportPPTX,
} from "@/lib/visual/export";
import type { Visual } from "@/lib/visual/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ExportFormat = "svg" | "png" | "pdf" | "pptx";

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  getSvgElement: () => SVGSVGElement | null;
  getVisual?: () => Visual | null;
  filename: string;
}

// ---------------------------------------------------------------------------
// Segmented control option sets
// ---------------------------------------------------------------------------

const BG_OPTIONS: SegmentedOption<BackgroundMode>[] = [
  { value: "include", label: "Include" },
  { value: "transparent", label: "Transparent" },
  { value: "custom", label: "Custom" },
];

const COLOR_OPTIONS: SegmentedOption<ColorMode>[] = [
  { value: "color", label: "Color" },
  { value: "mono", label: "Mono" },
];

const SCALE_OPTIONS: SegmentedOption<string>[] = [
  { value: "1", label: "1×" },
  { value: "2", label: "2×" },
  { value: "3", label: "3×" },
];

const FORMAT_OPTIONS: SegmentedOption<ExportFormat>[] = [
  { value: "png", label: "PNG" },
  { value: "svg", label: "SVG" },
  { value: "pdf", label: "PDF" },
  { value: "pptx", label: "PPTX" },
];

// ---------------------------------------------------------------------------
// Live preview hook
// ---------------------------------------------------------------------------

/**
 * Builds a data URL that reflects the current ExportOptions against the source
 * SVG element. Returns undefined while the image is being re-generated.
 */
function useExportPreview(
  getSvgElement: () => SVGSVGElement | null,
  options: ExportOptions,
  format: ExportFormat,
): string | undefined {
  const [dataUrl, setDataUrl] = useState<string | undefined>(undefined);
  const pendingRef = useRef(0);

  useEffect(() => {
    const tick = ++pendingRef.current;
    const svg = getSvgElement();
    if (!svg) return;

    // SVG and PDF share SVG-based preview; PNG/PPTX use PNG-based preview.
    if (format === "svg" || format === "pdf") {
      let url: string | undefined;
      try {
        const serializer = new XMLSerializer();
        const raw = serializer.serializeToString(svg);
        const transformed = applyExportOptionsToSvg(raw, options);
        const blob = new Blob([transformed], {
          type: "image/svg+xml;charset=utf-8",
        });
        url = URL.createObjectURL(blob);
      } catch {
        // fall through to undefined
      }

      if (url) {
        const capturedUrl = url;
        // Schedule state update after effect body to satisfy lint rule
        queueMicrotask(() => {
          if (tick === pendingRef.current) setDataUrl(capturedUrl);
        });
        return () => URL.revokeObjectURL(capturedUrl);
      }
    } else {
      // PNG / PPTX — use a lower-res preview (1x)
      const previewOpts: ExportOptions = { ...options, scale: 1 };
      let cancelled = false;
      let objectUrl: string | undefined;

      exportPNG(svg, previewOpts).then((blob) => {
        if (cancelled || !blob || tick !== pendingRef.current) return;
        objectUrl = URL.createObjectURL(blob);
        setDataUrl(objectUrl);
      });

      return () => {
        cancelled = true;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }
  }, [getSvgElement, options, format]);

  return dataUrl;
}

// ---------------------------------------------------------------------------
// Format label helpers
// ---------------------------------------------------------------------------

function formatLabel(format: ExportFormat): string {
  return format.toUpperCase();
}

function formatDescription(format: ExportFormat): string {
  switch (format) {
    case "svg":
      return "Scalable vector";
    case "png":
      return "Raster image";
    case "pdf":
      return "Document";
    case "pptx":
      return "Slide";
  }
}

// ---------------------------------------------------------------------------
// ExportDialog
// ---------------------------------------------------------------------------

/**
 * Modal export dialog with live preview, background/color-mode/resolution
 * controls, and per-format download.
 */
export function ExportDialog({
  open,
  onClose,
  getSvgElement,
  getVisual,
  filename,
}: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("png");
  const [options, setOptions] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewUrl = useExportPreview(getSvgElement, options, format);
  const popMotion = usePopMotion();

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const setBackground = useCallback(
    (bg: BackgroundMode) => setOptions((o) => ({ ...o, background: bg })),
    [],
  );

  const setColorMode = useCallback(
    (mode: ColorMode) => setOptions((o) => ({ ...o, colorMode: mode })),
    [],
  );

  const setScale = useCallback(
    (s: string) => setOptions((o) => ({ ...o, scale: Number(s) })),
    [],
  );

  const setCustomBackground = useCallback(
    (e: ChangeEvent<HTMLInputElement>) =>
      setOptions((o) => ({ ...o, customBackground: e.target.value })),
    [],
  );

  const handleExport = useCallback(async () => {
    setError(null);
    setExporting(true);

    const svg = getSvgElement();
    if (!svg) {
      setError("No visual to export");
      setExporting(false);
      return;
    }

    try {
      let blob: Blob | null = null;
      const ext = format;

      switch (format) {
        case "svg": {
          // For SVG apply the export options as transforms, then download
          const serializer = new XMLSerializer();
          const raw = serializer.serializeToString(svg);
          const transformed = applyExportOptionsToSvg(raw, options);
          const xmlHeader = `<?xml version="1.0" encoding="UTF-8"?>\n`;
          blob = new Blob([xmlHeader + transformed], {
            type: "image/svg+xml;charset=utf-8",
          });
          break;
        }
        case "png":
          blob = await exportPNG(svg, options);
          break;
        case "pdf":
          blob = await exportPDF(svg, options);
          break;
        case "pptx":
          blob = await exportPPTX(svg, getVisual?.() ?? undefined, options);
          break;
      }

      if (!blob) {
        setError(`${formatLabel(format)} export failed`);
        return;
      }

      const scaleLabel =
        format === "png" && options.scale !== 1 ? `@${options.scale}x` : "";
      downloadBlob(blob, `${filename}${scaleLabel}.${ext}`);
      onClose();
    } catch {
      setError(`${formatLabel(format)} export failed`);
    } finally {
      setExporting(false);
    }
  }, [format, options, getSvgElement, getVisual, filename, onClose]);

  // Options that only apply to raster formats
  const isRaster = format === "png" || format === "pdf" || format === "pptx";

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/30"
            aria-hidden="true"
            onClick={onClose}
          />

          {/* Dialog */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Export visual"
            {...popMotion}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-[var(--ds-radius-xl,18px)] border border-[var(--ds-border-subtle,rgba(0,0,0,0.08))] bg-[var(--ds-surface-raised,#ffffff)] shadow-[var(--ds-shadow-popover,0_12px_32px_rgba(0,0,0,0.18))]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[var(--ds-border-subtle,rgba(0,0,0,0.08))] px-5 py-4">
                <h2 className="text-sm font-semibold text-[var(--ds-text-primary,#15171a)]">
                  Export visual
                </h2>
                <IconButton
                  aria-label="Close export dialog"
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </IconButton>
              </div>

              {/* Body */}
              <div className="flex min-h-0 flex-1 flex-col gap-0 sm:flex-row">
                {/* Preview panel */}
                <div className="flex min-h-[180px] flex-1 items-center justify-center bg-[var(--ds-surface-sunken,#f4f8fb)] p-4 sm:min-h-[280px]">
                  <PreviewThumbnail
                    dataUrl={previewUrl}
                    background={options.background}
                    customBackground={options.customBackground}
                  />
                </div>

                {/* Controls panel */}
                <div className="flex w-full flex-col gap-4 border-t border-[var(--ds-border-subtle,rgba(0,0,0,0.08))] p-5 sm:w-[260px] sm:border-l sm:border-t-0">
                  {/* Format */}
                  <ControlField label="Format">
                    <SegmentedControl
                      options={FORMAT_OPTIONS}
                      value={format}
                      onChange={setFormat as (v: string) => void}
                      aria-label="Export format"
                      size="sm"
                    />
                  </ControlField>

                  {/* Background (raster/SVG) */}
                  <ControlField label="Background">
                    <SegmentedControl
                      options={BG_OPTIONS}
                      value={options.background}
                      onChange={setBackground}
                      aria-label="Background mode"
                      size="sm"
                    />
                    {options.background === "custom" && (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="color"
                          value={options.customBackground ?? "#ffffff"}
                          onChange={setCustomBackground}
                          aria-label="Custom background color"
                          className={cx(
                            "h-7 w-7 cursor-pointer rounded-[var(--ds-radius-sm,8px)] border border-[var(--ds-border-subtle,rgba(0,0,0,0.08))]",
                            FOCUS_RING,
                          )}
                        />
                        <span className="font-mono text-xs text-[var(--ds-text-muted,#6f7d83)]">
                          {options.customBackground ?? "#ffffff"}
                        </span>
                      </div>
                    )}
                  </ControlField>

                  {/* Color mode (raster) */}
                  {isRaster && (
                    <ControlField label="Color mode">
                      <SegmentedControl
                        options={COLOR_OPTIONS}
                        value={options.colorMode}
                        onChange={setColorMode}
                        aria-label="Color mode"
                        size="sm"
                      />
                    </ControlField>
                  )}

                  {/* Resolution (raster) */}
                  {isRaster && (
                    <ControlField label="Resolution">
                      <SegmentedControl
                        options={SCALE_OPTIONS}
                        value={String(options.scale)}
                        onChange={setScale}
                        aria-label="Export resolution"
                        size="sm"
                      />
                      <p className="mt-1 text-xs text-[var(--ds-text-muted,#6f7d83)]">
                        <ExportDimensions
                          getSvgElement={getSvgElement}
                          scale={options.scale}
                        />
                      </p>
                    </ControlField>
                  )}

                  {/* Format hint */}
                  <p className="text-xs text-[var(--ds-text-muted,#6f7d83)]">
                    {formatLabel(format)} — {formatDescription(format)}
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-[var(--ds-border-subtle,rgba(0,0,0,0.08))] px-5 py-3">
                {error ? (
                  <p
                    role="alert"
                    className="text-xs text-[var(--ds-danger,#dc2626)]"
                  >
                    {error}
                  </p>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    variant="solid"
                    size="sm"
                    disabled={exporting}
                    onClick={handleExport}
                    leadingIcon={
                      exporting ? (
                        <span
                          aria-hidden="true"
                          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                        />
                      ) : (
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      )
                    }
                  >
                    {exporting
                      ? "Exporting…"
                      : `Download ${formatLabel(format)}`}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ControlField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[var(--ds-text-secondary,#54666d)]">
        {label}
      </span>
      {children}
    </div>
  );
}

function PreviewThumbnail({
  dataUrl,
  background,
  customBackground,
}: {
  dataUrl: string | undefined;
  background: BackgroundMode;
  customBackground?: string;
}) {
  const isTransparent = background === "transparent";
  const customFill =
    background === "custom" ? (customBackground ?? "#ffffff") : undefined;

  return (
    <div
      className="relative flex max-h-[220px] max-w-[320px] items-center justify-center overflow-hidden rounded-[var(--ds-radius-md,10px)] border border-[var(--ds-border-subtle,rgba(0,0,0,0.08))]"
      style={
        isTransparent
          ? {
              backgroundImage:
                "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)",
              backgroundSize: "12px 12px",
              backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0px",
            }
          : customFill
            ? { backgroundColor: customFill }
            : { backgroundColor: "#ffffff" }
      }
    >
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dataUrl}
          alt="Export preview"
          className="max-h-[220px] max-w-[320px] object-contain"
          draggable={false}
        />
      ) : (
        <div className="flex h-32 w-48 items-center justify-center">
          <span
            aria-hidden="true"
            className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--ds-border-strong,#dde1e5)] border-t-[var(--ds-text-muted,#6f7d83)]"
          />
        </div>
      )}
    </div>
  );
}

function ExportDimensions({
  getSvgElement,
  scale,
}: {
  getSvgElement: () => SVGSVGElement | null;
  scale: number;
}) {
  const svg = getSvgElement();
  if (!svg) return null;
  const vb = svg.viewBox.baseVal;
  if (vb.width === 0 || vb.height === 0) return null;
  const w = Math.round(vb.width * scale);
  const h = Math.round(vb.height * scale);
  return (
    <>
      {w} × {h} px
    </>
  );
}
