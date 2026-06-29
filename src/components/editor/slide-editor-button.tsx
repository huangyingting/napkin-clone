"use client";

/**
 * Toolbar button that opens the SlideEditor panel for the current document.
 *
 * All open/close/route state is managed by {@link useSlideEditorOpen}; this
 * component is purely presentational.
 */

import { useCallback } from "react";

import { LayoutPanelLeft } from "lucide-react";

import { ConflictRecoveryDialogV7 } from "@/components/presentation-vnext/conflict-recovery-dialog-v7";
import { SlideEditorOpenDialog } from "@/components/editor/slide-editor-open-dialog";
import { SlideEditorVNext } from "@/components/presentation-vnext/slide-editor-vnext";
import { DeckGenerationPreviewVNext } from "@/components/presentation-vnext/deck-generation-preview-vnext";
import type { DeckActionPort } from "@/lib/action-ports";
import { EditorToolbarButton } from "@/components/editor/toolbar-button";
import { useSlideEditorOpen } from "@/components/editor/use-slide-editor-open";
import {
  exportDeckV7AsPPTX,
  NEUTRAL_THEME_PACKAGE,
} from "@/lib/presentation-vnext";
import { downloadBlob } from "@/lib/visual/export";

interface SlideEditorButtonProps {
  documentId: string;
  initialDeckJson: unknown;
  deckPort: DeckActionPort;
  /**
   * The DB-persisted serialised Lexical state the editor seeds from. Used as a
   * non-empty fallback for AI generation when the live editor state has not
   * finished seeding yet.
   */
  initialContentJson?: string | null;
  onOpenRightSurface?: () => void;
  onCloseRightSurface?: () => void;
  iconOnly?: boolean;
}

export function SlideEditorButton({
  documentId,
  initialDeckJson,
  deckPort,
  initialContentJson = null,
  onOpenRightSurface,
  onCloseRightSurface,
  iconOnly = false,
}: SlideEditorButtonProps) {
  const {
    open,
    deckV7,
    handleDeckV7Change,
    handleSaveV7,
    handleOpen,
    handleClose,
    aiEnabled,
    pendingJson,
    pendingThemePackageId,
    emptyDocument,
    handleOpenDialogApply,
    handleOpenDialogDerive,
    handleOpenDialogClose,
    aiPreviewV7,
    handleAiPreviewV7Apply,
    handleAiPreviewV7Derive,
    handleAiPreviewV7Cancel,
    conflictStateV7,
    handleConflictKeepMineV7,
    handleConflictUseTheirsV7,
    handleConflictDismissV7,
  } = useSlideEditorOpen({
    documentId,
    initialDeckJson,
    deckPort,
    initialContentJson,
    onOpenRightSurface,
    onCloseRightSurface,
  });

  const handleExportV7Pptx = useCallback(async () => {
    if (!deckV7) return;
    const blob = await exportDeckV7AsPPTX(deckV7, NEUTRAL_THEME_PACKAGE);
    if (!blob) throw new Error("PPTX export returned empty result");
    downloadBlob(blob, "presentation.pptx");
  }, [deckV7]);

  return (
    <>
      <EditorToolbarButton
        label="Slides"
        tooltip="Edit slides"
        icon={<LayoutPanelLeft size={15} aria-hidden="true" />}
        iconOnly={iconOnly}
        onClick={handleOpen}
        aria-label="Open slide editor"
      />

      {aiEnabled && pendingJson && !open ? (
        <SlideEditorOpenDialog
          contentJson={pendingJson}
          themePackageId={pendingThemePackageId}
          isEmptyDocument={emptyDocument}
          onApply={handleOpenDialogApply}
          onDerive={handleOpenDialogDerive}
          onClose={handleOpenDialogClose}
        />
      ) : null}

      {aiPreviewV7 && !open ? (
        <DeckGenerationPreviewVNext
          proposedDeck={aiPreviewV7.proposedDeck}
          baselineDeck={aiPreviewV7.baselineDeck}
          truncated={aiPreviewV7.truncated}
          contentJson={aiPreviewV7.contentJson}
          options={aiPreviewV7.options}
          onApply={handleAiPreviewV7Apply}
          onDerive={handleAiPreviewV7Derive}
          onCancel={handleAiPreviewV7Cancel}
        />
      ) : null}

      {open && deckV7 ? (
        <SlideEditorVNext
          deck={deckV7}
          onDeckChange={handleDeckV7Change}
          onSave={handleSaveV7}
          onClose={handleClose}
          onExportPptx={handleExportV7Pptx}
        />
      ) : null}

      {conflictStateV7 ? (
        <ConflictRecoveryDialogV7
          open={true}
          localDeck={conflictStateV7.localDeck}
          serverRevisionToken={conflictStateV7.serverRevisionToken}
          onKeepMine={handleConflictKeepMineV7}
          onUseTheirs={handleConflictUseTheirsV7}
          onDismiss={handleConflictDismissV7}
        />
      ) : null}
    </>
  );
}
