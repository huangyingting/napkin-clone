"use client";

/**
 * Document-level export control rendered in the editor header.
 *
 * Distinct from the per-visual `ExportMenu` (which exports one visual to
 * SVG/PNG/PDF/PPTX). This button exports the *entire* document:
 *   – "Export as PDF"  → multi-page PDF (text + every visual in reading order)
 *   – "Export as PPTX" → one slide per visual (with nearest heading as title)
 *
 * It reads the current Lexical editor state to traverse the document blocks
 * and resolves each visual's live SVG element via the `VisualSvgRegistry`.
 */

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { FileDown } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { FOCUS_RING } from "@/components/motion/control-styles";
import { useVisualSvgRegistry } from "@/components/editor/visual-svg-registry";
import {
  collectDocumentBlocks,
  exportDocumentAsPDF,
  exportDocumentAsPPTX,
} from "@/lib/visual/document-export";
import { downloadBlob } from "@/lib/visual/export";

interface DocumentExportButtonProps {
  documentTitle: string;
}

type ExportStatus = "idle" | "exporting" | "error";

/**
 * A dropdown button placed in the editor header that exports the whole
 * document as a PDF or PPTX deck. Uses `--ds-*` semantic tokens so it
 * matches the surrounding app chrome without `dark:` variants.
 */
export function DocumentExportButton({
  documentTitle,
}: DocumentExportButtonProps) {
  const [editor] = useLexicalComposerContext();
  const registry = useVisualSvgRegistry();
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
      const safe = (documentTitle || "document").replace(/[^\w\s-]/g, "").trim();
      downloadBlob(blob, `${safe || "document"}.pdf`);
      setStatus("idle");
    } catch {
      setErrorMsg("PDF export failed");
      setStatus("error");
    }
  };

  const handleExportPPTX = async () => {
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
      const safe = (documentTitle || "document").replace(/[^\w\s-]/g, "").trim();
      downloadBlob(blob, `${safe || "document"}.pptx`);
      setStatus("idle");
    } catch {
      setErrorMsg("PPTX export failed");
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
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={`flex h-9 items-center gap-1.5 rounded-ds-md border border-ds-border-subtle bg-ds-surface-raised px-3 text-sm font-medium text-ds-text-primary shadow-ds-raised transition-colors hover:bg-ds-state-hover active:bg-ds-state-active disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
      >
        {isExporting ? (
          <>
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
            Exporting…
          </>
        ) : (
          <>
            <FileDown size={15} aria-hidden="true" />
            Export
          </>
        )}
      </button>

      {isOpen && !isExporting ? (
        <div
          role="menu"
          aria-label="Export document"
          className="absolute right-0 top-full z-20 mt-1 min-w-[200px] overflow-hidden rounded-ds-lg border border-ds-border-subtle bg-ds-surface-raised shadow-ds-overlay"
          onBlur={(e) => {
            if (!menuRef.current?.contains(e.relatedTarget as Node | null)) {
              setIsOpen(false);
            }
          }}
        >
          <div className="p-1">
            <p className="px-3 py-2 text-xs font-semibold text-ds-text-muted">
              Export document as
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
              className={`flex w-full items-center justify-between rounded-ds-sm px-3 py-2 text-left text-sm text-ds-text-primary transition-colors hover:bg-ds-state-hover active:bg-ds-state-active ${FOCUS_RING}`}
            >
              <span>PPTX deck</span>
              <span className="text-xs text-ds-text-muted">
                One slide per visual
              </span>
            </button>
          </div>

          {errorMsg ? (
            <div
              role="alert"
              className="border-t border-red-500/20 bg-red-50 px-3 py-2 text-xs text-red-700"
            >
              {errorMsg}
            </div>
          ) : null}
        </div>
      ) : null}

      {status === "error" && !isOpen && errorMsg ? (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {errorMsg}
        </p>
      ) : null}
    </div>
  );
}
