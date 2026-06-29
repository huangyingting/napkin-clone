"use client";

/**
 * Toolbar button that opens the SlideEditor panel for the current document.
 *
 * All open/close/route state is managed by {@link useSlideEditorOpen}; this
 * component is purely presentational.
 */

import { useCallback } from "react";

import { LayoutPanelLeft } from "lucide-react";

import { ConflictRecoveryDialog } from "@/components/presentation/conflict-recovery-dialog";
import { ConflictRecoveryDialogV7 } from "@/components/presentation-vnext/conflict-recovery-dialog-v7";
import { SlideEditor } from "@/components/presentation/slide-editor";
import { SlideEditorOpenDialog } from "@/components/editor/slide-editor-open-dialog";
import { DeckGenerationPreview } from "@/components/presentation/deck-generation-preview";
import { SlideEditorVNext } from "@/components/presentation-vnext/slide-editor-vnext";
import { DeckGenerationPreviewVNext } from "@/components/presentation-vnext/deck-generation-preview-vnext";
import type {
  BrandListPort,
  DeckActionPort,
  SlideAssetActionPort,
} from "@/lib/action-ports";
import { EditorToolbarButton } from "@/components/editor/toolbar-button";
import { findStaleSourceLinks } from "@/lib/presentation/source-link-staleness";
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
  brandPort: BrandListPort;
  slideAssetPort?: SlideAssetActionPort;
  /**
   * The DB-persisted serialised Lexical state the editor seeds from. Used as a
   * non-empty fallback for AI generation when the LIVE editor state hasn't
   * finished seeding yet (collab degraded/connecting — issue #280).
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
  brandPort,
  slideAssetPort,
  initialContentJson = null,
  onOpenRightSurface,
  onCloseRightSurface,
  iconOnly = false,
}: SlideEditorButtonProps) {
  const {
    open,
    deck,
    setDeck,
    deckV7,
    handleDeckV7Change,
    handleSaveV7,
    visuals,
    documentBlocks,
    documentTextBlocks,
    freshDeck,
    stale,
    brandSwatches,
    handleOpen,
    handleClose,
    handleSave,
    aiEnabled,
    pendingJson,
    pendingThemePackageId,
    emptyDocument,
    handleOpenDialogApply,
    handleOpenDialogDerive,
    handleOpenDialogClose,
    aiPreview,
    handleAiPreviewApply,
    handleAiPreviewDerive,
    handleAiPreviewCancel,
    aiPreviewV7,
    handleAiPreviewV7Apply,
    handleAiPreviewV7Derive,
    handleAiPreviewV7Cancel,
    conflictState,
    handleConflictKeepMine,
    handleConflictUseTheirs,
    handleConflictDismiss,
    conflictStateV7,
    handleConflictKeepMineV7,
    handleConflictUseTheirsV7,
    handleConflictDismissV7,
  } = useSlideEditorOpen({
    documentId,
    initialDeckJson,
    deckPort,
    brandPort,
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

      {/* v7 AI generation preview */}
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

      {/* v6 AI generation preview */}
      {aiPreview && !open ? (
        <DeckGenerationPreview
          proposedDeck={aiPreview.proposedDeck}
          baselineDeck={aiPreview.baselineDeck}
          visuals={aiPreview.visuals}
          truncated={aiPreview.truncated}
          contentJson={aiPreview.contentJson}
          options={aiPreview.options}
          onApply={handleAiPreviewApply}
          onDerive={handleAiPreviewDerive}
          onCancel={handleAiPreviewCancel}
        />
      ) : null}

      {/* v7 editor — shown when the stored/AI-generated deck is DeckV7 */}
      {open && deckV7 ? (
        <SlideEditorVNext
          deck={deckV7}
          onDeckChange={handleDeckV7Change}
          onSave={handleSaveV7}
          onClose={handleClose}
          onExportPptx={handleExportV7Pptx}
        />
      ) : null}

      {/* v6 editor — preserved for backward compatibility */}
      {open && deck ? (
        <SlideEditor
          deck={deck}
          visuals={visuals}
          documentBlocks={documentBlocks}
          documentTextBlocks={documentTextBlocks}
          documentId={documentId}
          slideAssetPort={slideAssetPort}
          onDeckChange={setDeck}
          onClose={handleClose}
          onSave={handleSave}
          freshDeck={freshDeck}
          isDeckStale={stale}
          brandSwatches={brandSwatches}
          staleSourceLinkCount={
            findStaleSourceLinks(deck, documentBlocks).length
          }
        />
      ) : null}

      {conflictState ? (
        <ConflictRecoveryDialog
          open={true}
          localDeck={conflictState.localDeck}
          serverRevisionToken={conflictState.serverRevisionToken}
          onKeepMine={handleConflictKeepMine}
          onUseTheirs={handleConflictUseTheirs}
          onDismiss={handleConflictDismiss}
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
