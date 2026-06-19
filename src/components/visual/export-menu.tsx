"use client";

import { useState } from "react";

import { FOCUS_RING } from "@/components/motion/control-styles";
import { ExportDialog } from "@/components/visual/export-dialog";
import type { Visual } from "@/lib/visual/schema";

interface ExportMenuProps {
  /** Ref to the SVG element to export (the main canvas visual, not thumbnails) */
  getSvgElement: () => SVGSVGElement | null;
  /**
   * Optional: returns the Visual payload for the current visual.
   * When provided, PPTX export uses native shapes; omit for image-only export.
   */
  getVisual?: () => Visual | null;
  /** Base filename for the exported file (extension will be added) */
  filename: string;
}

/**
 * Export button that opens the advanced export dialog. Replaces the previous
 * inline dropdown — all export configuration (background, color mode,
 * resolution, format) happens inside the dialog with a live preview.
 */
export function ExportMenu({
  getSvgElement,
  getVisual,
  filename,
}: ExportMenuProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        aria-label="Export visual"
        aria-haspopup="dialog"
        className={`flex h-9 items-center gap-2 rounded-full border border-[var(--ds-border-subtle,rgba(0,0,0,0.08))] bg-[var(--ds-surface-raised,#ffffff)] px-4 text-sm font-medium text-[var(--ds-text-primary,#15171a)] transition hover:bg-[var(--ds-state-hover,rgba(0,0,0,0.06))] active:bg-[var(--ds-state-active,rgba(0,0,0,0.12))] ${FOCUS_RING}`}
      >
        Export
      </button>

      <ExportDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        getSvgElement={getSvgElement}
        getVisual={getVisual}
        filename={filename}
      />
    </>
  );
}
