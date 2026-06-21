"use client";

/**
 * Document-level export control rendered in the editor header.
 *
 * Distinct from the per-visual `ExportMenu` (which exports one visual to
 * SVG/PNG/PDF/PPTX). This button exports the *entire* document:
 *   – "Export as PDF"        → multi-page PDF (text + every visual in reading order)
 *   – "Export as PPTX"       → one slide per visual (with nearest heading as title)
 *   – "Infographic PNG/PDF"  → one tall composed image (text + visuals in order)
 *
 * It reads the current Lexical editor state to traverse the document blocks
 * and resolves each visual's live SVG element via the `VisualSvgRegistry`.
 */

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { FileDown, Image as ImageIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { FOCUS_RING } from "@/components/motion/control-styles";
import { useVisualSvgRegistry } from "@/components/editor/visual-svg-registry";
import {
  collectDocumentBlocks,
  exportDocumentAsPDF,
  exportDocumentAsPPTX,
  exportDocumentAsInfographic,
  INFOGRAPHIC_WIDTH_PRESETS,
  type InfographicWidthPreset,
} from "@/lib/visual/document-export";
import { DEFAULT_INFOGRAPHIC_CONFIG } from "@/lib/visual/infographic-layout";
import { downloadBlob, sanitizeFilename } from "@/lib/visual/export";
import { useUserEntitlements } from "@/lib/billing/use-user-entitlements";

interface DocumentExportButtonProps {
  documentTitle: string;
  iconOnly?: boolean;
}

type ExportStatus = "idle" | "exporting" | "error";

/** Ordered list of infographic width presets shown in the sub-menu. */
const WIDTH_PRESET_LIST = (
  Object.keys(INFOGRAPHIC_WIDTH_PRESETS) as InfographicWidthPreset[]
).map((k) => ({ key: k, ...INFOGRAPHIC_WIDTH_PRESETS[k] }));

/**
 * A dropdown button placed in the editor header that exports the whole
 * document as a PDF, PPTX deck, or infographic PNG/PDF.
 * Uses `--ds-*` semantic tokens so it matches the surrounding app chrome.
 *
 * Fetches the current user's plan entitlements via /api/user/entitlements so
 * that PPTX export and watermark removal are gated correctly for free, Plus,
 * and Pro users (issue #93).
 */
export function DocumentExportButton({
  documentTitle,
  iconOnly = false,
}: DocumentExportButtonProps) {
  const [editor] = useLexicalComposerContext();
  const registry = useVisualSvgRegistry();
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infogramWidth, setInfogramWidth] =
    useState<InfographicWidthPreset>("1080");
  const menuRef = useRef<HTMLDivElement>(null);

  const entitlements = useUserEntitlements();
  const removeWatermark = entitlements.removeWatermark;
  const canPptx = entitlements.pptxExport;

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

  const handleExportPDF = async () => {
    setErrorMsg(null);
    setStatus("exporting");
    setIsOpen(false);
    try {
      const blocks = await getBlocks();
      const blob = await exportDocumentAsPDF(
        blocks,
        documentTitle || "Untitled",
        getSvg,
      );
      if (!blob) {
        setErrorMsg("PDF export failed");
        setStatus("error");
        return;
      }
      downloadBlob(blob, safeFilename("pdf"));
      setStatus("idle");
    } catch {
      setErrorMsg("PDF export failed");
      setStatus("error");
    }
  };

  const handleExportPPTX = async () => {
    if (!canPptx) return;
    setErrorMsg(null);
    setStatus("exporting");
    setIsOpen(false);
    try {
      const blocks = await getBlocks();
      const blob = await exportDocumentAsPPTX(
        blocks,
        documentTitle || "Untitled",
        getSvg,
      );
      if (!blob) {
        setErrorMsg("PPTX export failed");
        setStatus("error");
        return;
      }
      downloadBlob(blob, safeFilename("pptx"));
      setStatus("idle");
    } catch {
      setErrorMsg("PPTX export failed");
      setStatus("error");
    }
  };

  const handleExportInfographic = async (format: "png" | "pdf") => {
    setErrorMsg(null);
    setStatus("exporting");
    setIsOpen(false);
    try {
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
          watermark: !removeWatermark,
          outputFormat: format,
        },
      );
      if (!blob) {
        setErrorMsg("Infographic export failed");
        setStatus("error");
        return;
      }
      downloadBlob(blob, safeFilename(format));
      setStatus("idle");
    } catch {
      setErrorMsg("Infographic export failed");
      setStatus("error");
    }
  };

  const isExporting = status === "exporting";

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => {
          setErrorMsg(null);
          setIsOpen((o) => !o);
        }}
        disabled={isExporting}
        aria-label="Export document"
        title="Export"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={`flex h-8 items-center justify-center gap-1.5 rounded-ds-md border border-ds-border-subtle bg-ds-surface-raised text-sm font-medium text-ds-text-primary shadow-ds-raised transition-colors hover:bg-ds-state-hover active:bg-ds-state-active disabled:cursor-not-allowed disabled:opacity-50 ${iconOnly ? "w-8 px-0" : "px-3"} ${FOCUS_RING}`}
      >
        {isExporting ? (
          <>
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
            <span className={iconOnly ? "sr-only" : undefined}>Exporting…</span>
          </>
        ) : (
          <>
            <FileDown size={15} aria-hidden="true" />
            <span className={iconOnly ? "sr-only" : undefined}>Export</span>
          </>
        )}
      </button>

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
                {canPptx ? "One slide per visual" : "Plus / Pro"}
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

            {!removeWatermark && (
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
        </div>
      ) : null}

      {status === "error" && !isOpen && errorMsg ? (
        <p role="alert" className="mt-1 text-xs text-ds-danger-text">
          {errorMsg}
        </p>
      ) : null}
    </div>
  );
}
