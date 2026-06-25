"use client";

/**
 * Document-level export control rendered in the editor header.
 *
 * Distinct from the per-visual `ExportMenu` (which exports one visual to
 * SVG/PNG/PDF/PPTX). This button exports the *entire* document:
 *   – "Export as PDF"        → multi-page PDF (text + every visual in reading order)
 *   – "Export as PPTX"       → the edited deck (honoring `deckJson`: slide order,
 *                              retitling, free-form elements, per-slide theming)
 *   – "Slide SVGs / PNGs"    → one image per authored slide, bundled as a ZIP
 *   – "Infographic PNG/PDF"  → one tall composed image (text + visuals in order)
 *
 * It reads the current Lexical editor state to traverse the document blocks
 * and resolves each visual's live SVG element via the `VisualSvgRegistry`. The
 * PPTX path additionally prefers the freshest saved `deckJson` (re-fetched on
 * export, then the page-load prop) so it reflects slide-editor changes, falling
 * back to a deck derived from the live editor blocks.
 */

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { FileDown, Image as ImageIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { FOCUS_RING } from "@/components/ui/tokens";
import { EditorToolbarButton } from "@/components/editor/toolbar-button";
import { useVisualSvgRegistry } from "@/components/editor/visual-svg-registry";
import type { DeckFetchPort } from "@/lib/action-ports";
import { collectDocumentBlocks } from "@/lib/content";
import {
  INFOGRAPHIC_WIDTH_PRESETS,
  DEFAULT_INFOGRAPHIC_CONFIG,
  type InfographicWidthPreset,
} from "@/lib/visual/infographic-layout";
import { downloadBlob } from "@/lib/visual/export";
import { sanitizeFilename } from "@/lib/visual/export-filename";
import { useUserEntitlements } from "@/lib/billing/use-user-entitlements";
import { resolveExportPolicy } from "@/lib/visual/export-policy";
import { runExportPreflight } from "@/lib/visual/export-preflight";
import { resolveDeckExportContext } from "@/lib/visual/deck-export-context";
import {
  bucketBytes,
  bucketDurationMs,
  emitProductTelemetry,
} from "@/lib/telemetry/product";

interface DocumentExportButtonProps {
  documentTitle: string;
  /** Document id — used to re-fetch the freshest saved deck for PPTX export. */
  documentId: string;
  deckPort: DeckFetchPort;
  /** Page-load `deckJson`, used as a fallback when the re-fetch is unavailable. */
  initialDeckJson?: unknown;
  iconOnly?: boolean;
}

type ExportStatus = "idle" | "exporting" | "error";
type DeckSlideImageFormat = "svg" | "png";

/** Ordered list of infographic width presets shown in the sub-menu. */
const WIDTH_PRESET_LIST = (
  Object.keys(INFOGRAPHIC_WIDTH_PRESETS) as InfographicWidthPreset[]
).map((k) => ({ key: k, ...INFOGRAPHIC_WIDTH_PRESETS[k] }));

/**
 * A dropdown button placed in the editor header that exports the whole
 * document as a PDF, PPTX deck, per-slide SVG/PNG bundle, or infographic
 * PNG/PDF.
 * Uses `--ds-*` semantic tokens so it matches the surrounding app chrome.
 *
 * Fetches the current user's plan entitlements via /api/user/entitlements so
 * that PPTX export and watermark removal are gated correctly for free, Plus,
 * and Pro users (issue #93).
 */
export function DocumentExportButton({
  documentTitle,
  documentId,
  deckPort,
  initialDeckJson = null,
  iconOnly = false,
}: DocumentExportButtonProps) {
  const [editor] = useLexicalComposerContext();
  const registry = useVisualSvgRegistry();
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const [infogramWidth, setInfogramWidth] =
    useState<InfographicWidthPreset>("1080");
  const menuRef = useRef<HTMLDivElement>(null);

  const entitlements = useUserEntitlements();
  const exportPolicy = resolveExportPolicy(entitlements);
  const canPptx = exportPolicy.canPptx;
  const canRemoveWatermark = exportPolicy.canRemoveWatermark;

  // Close the menu on an outside click or Escape. A focus-based `onBlur` missed
  // clicks on non-focusable areas (plain page background), which left the menu
  // stuck open — the document listener with ref-containment is reliable.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onDocClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const getBlocks = useCallback(() => {
    return new Promise<ReturnType<typeof collectDocumentBlocks>>((resolve) => {
      editor.getEditorState().read(() => {
        const json = JSON.stringify(editor.getEditorState().toJSON());
        resolve(collectDocumentBlocks(json));
      });
    });
  }, [editor]);

  const getSvg = useCallback(
    (visualId: string): SVGSVGElement | null => {
      if (!registry) return null;
      const getter = registry.get(visualId);
      return getter ? getter() : null;
    },
    [registry],
  );

  const safeFilename = (ext: string) => {
    return `${sanitizeFilename(documentTitle, "document")}.${ext}`;
  };

  const trackExportStart = (outputFormat: string) => {
    emitProductTelemetry("product.export.started", {
      exportKind: "document",
      outputFormat,
    });
    return performance.now();
  };

  const trackExportSuccess = (
    outputFormat: string,
    startedAt: number,
    blob: Blob,
  ) => {
    emitProductTelemetry("product.export.succeeded", {
      durationBucket: bucketDurationMs(performance.now() - startedAt),
      exportKind: "document",
      fileSizeBucket: bucketBytes(blob.size),
      outputFormat,
    });
  };

  const trackExportFailure = (
    outputFormat: string,
    startedAt: number,
    failureReason: string,
  ) => {
    emitProductTelemetry("product.export.failed", {
      durationBucket: bucketDurationMs(performance.now() - startedAt),
      exportKind: "document",
      failureReason,
      outputFormat,
    });
  };

  const fetchDeckJson = async (): Promise<unknown> => {
    try {
      return (await deckPort.fetchDeckJson(documentId)).deckJson;
    } catch {
      return null;
    }
  };

  const preflightDeckExport = (
    deck: Parameters<typeof runExportPreflight>[0],
    target: "pptx" | "image",
  ): boolean => {
    const result = runExportPreflight(deck, {
      target,
      exportPolicy,
    });
    if (result.hasFatal) {
      setErrorMsg(
        result.diagnostics
          .filter((diagnostic) => diagnostic.severity === "fatal")
          .map((diagnostic) => diagnostic.message)
          .join(" "),
      );
      setStatus("error");
      return false;
    }
    setWarningMsg(
      result.hasWarnings
        ? result.diagnostics
            .filter((diagnostic) => diagnostic.severity === "warning")
            .map((diagnostic) => diagnostic.message)
            .join(" ")
        : null,
    );
    return true;
  };

  const handleExportPDF = async () => {
    setErrorMsg(null);
    setWarningMsg(null);
    setStatus("exporting");
    setIsOpen(false);
    const startedAt = trackExportStart("pdf");
    try {
      const { exportDocumentAsPDF } =
        await import("@/lib/visual/document-export-targets");
      const blocks = await getBlocks();
      const blob = await exportDocumentAsPDF(
        blocks,
        documentTitle || "Untitled",
        getSvg,
      );
      if (!blob) {
        trackExportFailure("pdf", startedAt, "empty_blob");
        setErrorMsg("PDF export failed");
        setStatus("error");
        return;
      }
      trackExportSuccess("pdf", startedAt, blob);
      downloadBlob(blob, safeFilename("pdf"));
      setStatus("idle");
    } catch {
      trackExportFailure("pdf", startedAt, "exception");
      setErrorMsg("PDF export failed");
      setStatus("error");
    }
  };

  const handleExportPPTX = async () => {
    if (!canPptx) return;
    setErrorMsg(null);
    setStatus("exporting");
    setIsOpen(false);
    const startedAt = trackExportStart("pptx");
    try {
      const { exportDeckAsPPTX } =
        await import("@/lib/visual/deck-export-pptx");
      const blocks = await getBlocks();
      const { deck, visuals } = resolveDeckExportContext(
        blocks,
        await fetchDeckJson(),
        initialDeckJson,
      );
      if (!preflightDeckExport(deck, "pptx")) {
        trackExportFailure("pptx", startedAt, "preflight_fatal");
        return;
      }
      const blob = await exportDeckAsPPTX(deck, visuals, getSvg);
      if (!blob) {
        trackExportFailure("pptx", startedAt, "empty_blob");
        setErrorMsg("PPTX export failed");
        setStatus("error");
        return;
      }
      trackExportSuccess("pptx", startedAt, blob);
      downloadBlob(blob, safeFilename("pptx"));
      setStatus("idle");
    } catch {
      trackExportFailure("pptx", startedAt, "exception");
      setErrorMsg("PPTX export failed");
      setStatus("error");
    }
  };

  const handleExportSlideImages = async (format: DeckSlideImageFormat) => {
    const outputFormat = `slides-${format}`;
    setErrorMsg(null);
    setWarningMsg(null);
    setStatus("exporting");
    setIsOpen(false);
    const startedAt = trackExportStart(outputFormat);
    try {
      const { exportDeckAsSlideImages } =
        await import("@/lib/visual/deck-export-slide-images");
      const blocks = await getBlocks();
      const { deck, visuals } = resolveDeckExportContext(
        blocks,
        await fetchDeckJson(),
        initialDeckJson,
      );
      if (!preflightDeckExport(deck, "image")) {
        trackExportFailure(outputFormat, startedAt, "preflight_fatal");
        return;
      }

      const blob = await exportDeckAsSlideImages(deck, visuals, getSvg, {
        format,
      });
      if (!blob) {
        trackExportFailure(outputFormat, startedAt, "empty_blob");
        setErrorMsg("Slide image export failed");
        setStatus("error");
        return;
      }
      trackExportSuccess(outputFormat, startedAt, blob);
      downloadBlob(
        blob,
        `${sanitizeFilename(documentTitle, "document")}-slides.zip`,
      );
      setStatus("idle");
    } catch {
      trackExportFailure(outputFormat, startedAt, "exception");
      setErrorMsg("Slide image export failed");
      setStatus("error");
    }
  };

  const handleExportInfographic = async (format: "png" | "pdf") => {
    const outputFormat = `infographic-${format}`;
    setErrorMsg(null);
    setStatus("exporting");
    setIsOpen(false);
    const startedAt = trackExportStart(outputFormat);
    try {
      const { exportDocumentAsInfographic } =
        await import("@/lib/visual/document-export-targets");
      const blocks = await getBlocks();
      const presetWidth = INFOGRAPHIC_WIDTH_PRESETS[infogramWidth].width;
      const blob = await exportDocumentAsInfographic(
        blocks,
        documentTitle || "Untitled",
        getSvg,
        {
          config: {
            ...DEFAULT_INFOGRAPHIC_CONFIG,
            width: presetWidth,
          },
          watermark: exportPolicy.defaultWatermark,
          outputFormat: format,
        },
      );
      if (!blob) {
        trackExportFailure(outputFormat, startedAt, "empty_blob");
        setErrorMsg("Infographic export failed");
        setStatus("error");
        return;
      }
      trackExportSuccess(outputFormat, startedAt, blob);
      downloadBlob(blob, safeFilename(format));
      setStatus("idle");
    } catch {
      trackExportFailure(outputFormat, startedAt, "exception");
      setErrorMsg("Infographic export failed");
      setStatus("error");
    }
  };

  const isExporting = status === "exporting";

  return (
    <div className="relative" ref={menuRef}>
      <EditorToolbarButton
        label={isExporting ? "Exporting…" : "Export"}
        tooltip="Export document"
        icon={
          isExporting ? (
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
          ) : (
            <FileDown size={15} aria-hidden="true" />
          )
        }
        iconOnly={iconOnly}
        disabled={isExporting}
        aria-label="Export document"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => {
          setErrorMsg(null);
          setIsOpen((o) => !o);
        }}
      />

      {isOpen && !isExporting ? (
        <div
          role="menu"
          aria-label="Export document"
          className="absolute right-0 top-full z-dropdown mt-1 min-w-[240px] overflow-hidden rounded-ds-lg border border-ds-border-subtle bg-ds-surface-raised shadow-ds-overlay"
        >
          {/* ── Standard document formats ────────────────────────────── */}
          <div className="p-1">
            <p className="px-3 py-2 text-xs font-semibold text-ds-text-muted">
              Document
            </p>

            <button
              type="button"
              role="menuitem"
              onClick={() => void handleExportPDF()}
              className={`flex w-full items-center justify-between rounded-ds-sm px-3 py-2 text-left text-sm text-ds-text-primary transition-colors hover:bg-ds-state-hover active:bg-ds-state-active ${FOCUS_RING}`}
            >
              <span>PDF</span>
              <span className="text-xs text-ds-text-muted">
                Text + all visuals
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => void handleExportPPTX()}
              disabled={!canPptx}
              aria-disabled={!canPptx}
              className={`flex w-full items-center justify-between rounded-ds-sm px-3 py-2 text-left text-sm transition-colors ${canPptx ? `text-ds-text-primary hover:bg-ds-state-hover active:bg-ds-state-active ${FOCUS_RING}` : "cursor-not-allowed text-ds-text-muted"}`}
            >
              <span>PPTX deck</span>
              <span className="text-xs text-ds-text-muted">
                {canPptx ? "Your edited deck" : "Plus / Pro"}
              </span>
            </button>
            {!canPptx && (
              <p className="px-3 pb-2 text-[10px] text-ds-text-muted">
                PPTX export requires Plus or Pro.{" "}
                <a
                  href="/app/settings/billing"
                  className="underline"
                  onClick={() => setIsOpen(false)}
                >
                  Upgrade
                </a>{" "}
                to unlock.
              </p>
            )}

            <button
              type="button"
              role="menuitem"
              onClick={() => void handleExportSlideImages("svg")}
              className={`flex w-full items-center justify-between rounded-ds-sm px-3 py-2 text-left text-sm text-ds-text-primary transition-colors hover:bg-ds-state-hover active:bg-ds-state-active ${FOCUS_RING}`}
            >
              <span>Slide SVGs</span>
              <span className="text-xs text-ds-text-muted">
                ZIP · one file per slide
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => void handleExportSlideImages("png")}
              className={`flex w-full items-center justify-between rounded-ds-sm px-3 py-2 text-left text-sm text-ds-text-primary transition-colors hover:bg-ds-state-hover active:bg-ds-state-active ${FOCUS_RING}`}
            >
              <span>Slide PNGs</span>
              <span className="text-xs text-ds-text-muted">
                ZIP · one image per slide
              </span>
            </button>
          </div>

          {/* ── Infographic section ───────────────────────────────────── */}
          <div className="border-t border-ds-border-subtle p-1">
            <p className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-ds-text-muted">
              <ImageIcon size={12} aria-hidden="true" />
              Infographic
            </p>

            {/* Width preset chips */}
            <div className="mb-2 flex gap-1 px-3">
              {WIDTH_PRESET_LIST.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={infogramWidth === p.key}
                  onClick={() => setInfogramWidth(p.key)}
                  className={`rounded-ds-sm border px-2 py-0.5 text-[10px] font-medium transition-colors ${FOCUS_RING} ${
                    infogramWidth === p.key
                      ? "border-ds-accent bg-ds-accent text-ds-text-on-accent"
                      : "border-ds-border-subtle bg-ds-surface-base text-ds-text-secondary hover:border-ds-border-strong"
                  }`}
                >
                  {p.width}px
                </button>
              ))}
            </div>

            <button
              type="button"
              role="menuitem"
              onClick={() => void handleExportInfographic("png")}
              className={`flex w-full items-center justify-between rounded-ds-sm px-3 py-2 text-left text-sm text-ds-text-primary transition-colors hover:bg-ds-state-hover active:bg-ds-state-active ${FOCUS_RING}`}
            >
              <span>Infographic PNG</span>
              <span className="text-xs text-ds-text-muted">One tall image</span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => void handleExportInfographic("pdf")}
              className={`flex w-full items-center justify-between rounded-ds-sm px-3 py-2 text-left text-sm text-ds-text-primary transition-colors hover:bg-ds-state-hover active:bg-ds-state-active ${FOCUS_RING}`}
            >
              <span>Infographic PDF</span>
              <span className="text-xs text-ds-text-muted">
                Single page PDF
              </span>
            </button>

            {!canRemoveWatermark && (
              <p className="px-3 pb-2 text-[10px] text-ds-text-muted">
                Free plan: includes watermark.{" "}
                <a
                  href="/app/settings/billing"
                  className="underline"
                  onClick={() => setIsOpen(false)}
                >
                  Upgrade
                </a>{" "}
                to remove.
              </p>
            )}
          </div>

          {errorMsg ? (
            <div
              role="alert"
              className="border-t border-ds-danger-border bg-ds-danger-surface px-3 py-2 text-xs text-ds-danger-text"
            >
              {errorMsg}
            </div>
          ) : null}
          {warningMsg ? (
            <div
              role="status"
              className="border-t border-ds-warning-border bg-ds-warning-surface px-3 py-2 text-xs text-ds-warning-text"
            >
              {warningMsg}
            </div>
          ) : null}
        </div>
      ) : null}

      {status === "error" && !isOpen && errorMsg ? (
        <p role="alert" className="mt-1 text-xs text-ds-danger-text">
          {errorMsg}
        </p>
      ) : null}
      {status !== "error" && !isOpen && warningMsg ? (
        <p role="status" className="mt-1 text-xs text-ds-warning-text">
          {warningMsg}
        </p>
      ) : null}
    </div>
  );
}
