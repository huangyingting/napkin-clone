"use client";

/**
 * Toolbar button that opens the SlideEditor panel for the current document.
 *
 * All open/close/route state is managed by {@link useSlideEditorOpen}; this
 * component is purely presentational.
 */

import { useCallback } from "react";
import { createPortal } from "react-dom";

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
  resolveThemePackageForDeck,
  type PresentationDiagnostic,
} from "@/lib/presentation-vnext";
import { downloadBlob } from "@/lib/visual/export";

function SlideEditorOpenRecovery({
  error,
  diagnostics,
  validationErrors,
  onClose,
}: {
  error: string;
  diagnostics: readonly PresentationDiagnostic[];
  validationErrors?: readonly string[];
  onClose: () => void;
}) {
  return (
    <div className="flex h-full w-full flex-col bg-ds-surface">
      <header className="flex shrink-0 items-center justify-between border-b border-ds-border-subtle bg-ds-surface-chrome px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ds-text-primary">
            Slides could not be opened
          </h2>
          <p className="mt-0.5 text-xs text-ds-text-muted">
            The saved deck data needs migration or repair before editing.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-ds-sm border border-ds-border-subtle px-3 py-1.5 text-xs font-medium text-ds-text-primary hover:bg-ds-state-hover"
        >
          Close
        </button>
      </header>
      <main className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
        <section className="w-full max-w-2xl rounded-ds-md border border-ds-danger-border bg-ds-danger-surface p-4">
          <p className="text-sm font-medium text-ds-danger-text">{error}</p>
          {diagnostics.length > 0 ? (
            <ul className="mt-3 space-y-2 text-xs text-ds-danger-text">
              {diagnostics.map((diagnostic, index) => (
                <li key={`${diagnostic.code}-${index}`}>
                  {diagnostic.message}
                </li>
              ))}
            </ul>
          ) : null}
          {validationErrors && validationErrors.length > 0 ? (
            <details className="mt-3 text-xs text-ds-danger-text">
              <summary className="cursor-pointer font-medium">
                Validation details
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {validationErrors.map((message, index) => (
                  <li key={`${message}-${index}`}>{message}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function SlideEditorOverlay({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-label="Slide editor"
      className="fixed inset-0 z-panel bg-ds-surface"
    >
      {children}
    </div>,
    document.body,
  );
}

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
    deckOpenDiagnosticsV7,
    deckOpenErrorV7,
    saveStatus,
    saveStatusLabel,
    saveErrorMessage,
    hasUnsavedWork,
    handleDeckV7Change,
    handleSaveV7,
    handleUndoV7,
    handleRedoV7,
    canUndoV7,
    canRedoV7,
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

  const themeResolution = deckV7 ? resolveThemePackageForDeck(deckV7) : null;
  const editorDiagnostics = [
    ...deckOpenDiagnosticsV7,
    ...(themeResolution?.diagnostics ?? []),
  ];

  const handleExportV7Pptx = useCallback(async () => {
    if (!deckV7) return;
    const blob = await exportDeckV7AsPPTX(
      deckV7,
      themeResolution?.package ?? resolveThemePackageForDeck(deckV7).package,
    );
    if (!blob) throw new Error("PPTX export returned empty result");
    downloadBlob(blob, "presentation.pptx");
  }, [deckV7, themeResolution]);

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
        <SlideEditorOverlay>
          <SlideEditorVNext
            deck={deckV7}
            themePackage={themeResolution?.package}
            diagnostics={editorDiagnostics}
            saveStatus={saveStatus}
            saveStatusLabel={saveStatusLabel}
            saveErrorMessage={saveErrorMessage}
            hasUnsavedWork={hasUnsavedWork}
            canUndo={canUndoV7}
            canRedo={canRedoV7}
            onUndo={handleUndoV7}
            onRedo={handleRedoV7}
            onDeckChange={handleDeckV7Change}
            onSave={handleSaveV7}
            onClose={handleClose}
            onExportPptx={handleExportV7Pptx}
          />
        </SlideEditorOverlay>
      ) : null}

      {open && !deckV7 && deckOpenErrorV7 ? (
        <SlideEditorOverlay>
          <SlideEditorOpenRecovery
            error={deckOpenErrorV7.error}
            diagnostics={deckOpenErrorV7.diagnostics}
            validationErrors={deckOpenErrorV7.validationErrors}
            onClose={handleClose}
          />
        </SlideEditorOverlay>
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
