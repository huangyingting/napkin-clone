"use client";

/**
 * Toolbar button that opens the SlideEditor panel for the current document.
 *
 * All open/close/route state is managed by {@link useSlideEditorOpen}; this
 * component is purely presentational.
 */

import { LayoutPanelLeft } from "lucide-react";

import { ConflictRecoveryDialog } from "@/components/presentation/conflict-recovery-dialog";
import { SlideEditor } from "@/components/presentation/slide-editor";
import { SlideEditorOpenDialog } from "@/components/editor/slide-editor-open-dialog";
import { DeckGenerationPreview } from "@/components/presentation/deck-generation-preview";
import type {
  BrandListPort,
  DeckActionPort,
  SlideAssetActionPort,
} from "@/lib/action-ports";
import { EditorToolbarButton } from "@/components/editor/toolbar-button";
import { findStaleSourceLinks } from "@/lib/presentation/source-link-staleness";
import { useSlideEditorOpen } from "@/components/editor/use-slide-editor-open";

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
    emptyDocument,
    handleOpenDialogApply,
    handleOpenDialogDerive,
    handleOpenDialogClose,
    aiPreview,
    handleAiPreviewApply,
    handleAiPreviewDerive,
    handleAiPreviewCancel,
    conflictState,
    handleConflictKeepMine,
    handleConflictUseTheirs,
    handleConflictDismiss,
  } = useSlideEditorOpen({
    documentId,
    initialDeckJson,
    deckPort,
    brandPort,
    initialContentJson,
    onOpenRightSurface,
    onCloseRightSurface,
  });

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
          isEmptyDocument={emptyDocument}
          onApply={handleOpenDialogApply}
          onDerive={handleOpenDialogDerive}
          onClose={handleOpenDialogClose}
        />
      ) : null}

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
    </>
  );
}
