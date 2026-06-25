"use client";

import { useState } from "react";

import { ToolbarButton } from "@/components/ui";
import { ExportDialog } from "@/components/visual/export-dialog";
import { useUserEntitlements } from "@/lib/billing/use-user-entitlements";
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
 *
 * Fetches the current user's plan entitlements via /api/user/entitlements so
 * that SVG/PPTX format options and watermark removal are gated correctly for
 * free, Plus, and Pro users (issue #93).
 */
export function ExportMenu({
  getSvgElement,
  getVisual,
  filename,
}: ExportMenuProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const entitlements = useUserEntitlements();

  return (
    <>
      <ToolbarButton
        onClick={() => setDialogOpen(true)}
        aria-label="Export visual"
        aria-haspopup="dialog"
        iconOnly={false}
        shape="pill"
        size="lg"
        tone="surface"
        className="gap-2 font-medium"
      >
        Export
      </ToolbarButton>

      <ExportDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        getSvgElement={getSvgElement}
        getVisual={getVisual}
        filename={filename}
        entitlements={entitlements}
      />
    </>
  );
}
