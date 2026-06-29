"use client";

/**
 * vNext slide editor surface.
 *
 * A standalone editing surface for `DeckV7` decks that renders through the
 * `resolveDeckRenderTree` / `SlideCanvasVNext` path. It wires together:
 *
 *   - Slide rail (thumbnail navigation)
 *   - Main stage (`SlideCanvasVNext`)
 *   - Inspector: `SlideControlsPanel`, `StyleBindingPanel`,
 *     `LocalOverrideBadge`, `DiagnosticsPanel`
 *   - Node selection model (normal / layers mode)
 *   - vNext editor commands: `updateSlideControls`, `updateNodeStyleBinding`,
 *     `resetLocalStyleOverride`, `detachDecoration`, `updateNodeLayout`
 *
 * Decoration rendering rules:
 *   - Decorations are rendered behind user nodes and are not selectable in
 *     normal mode.
 *   - In "layers" mode, decorations become selectable and can be detached via
 *     the `detachDecoration` editor command.
 *
 * The component never mutates the deck prop. All changes are reported via
 * `onDeckChange`.
 *
 * Close / export: pass `onClose` to render a close button in the top toolbar
 * and `onExportPptx` to render an Export PPTX button. Export errors are caught
 * and surfaced inline via `exportDeckV7AsPPTX` (barrel-exported from
 * `@/lib/presentation-vnext`).
 */

import { useCallback, useMemo, useState, type JSX } from "react";
import { FileDown, X } from "lucide-react";

import type { ActionResult } from "@/lib/action-result";
import type {
  DeckV7,
  SlideNode,
  SlideChildNode,
} from "@/lib/presentation-vnext/schema";
import type { ThemePackageV1 } from "@/lib/presentation-vnext/theme-package-schema";
import type {
  StyleBinding,
  StylePatch,
} from "@/lib/presentation-vnext/style-schema";
import type {
  SlideControls,
  SlideProps,
} from "@/lib/presentation-vnext/schema";
import type {
  PresentationDiagnostic,
  DiagnosticAction,
} from "@/lib/presentation-vnext/diagnostics";
import type { ResolvedRenderNode } from "@/lib/presentation-vnext/render-tree";
import {
  updateSlideControls,
  updateNodeStyleBinding,
  resetLocalStyleOverride,
  detachDecoration,
} from "@/lib/presentation-vnext/editor-commands";
import { NEUTRAL_THEME_PACKAGE } from "@/lib/presentation-vnext/neutral-theme-package";

import { SlideCanvasVNext } from "./slide-canvas";
import {
  createSelectionState,
  selectNode,
  clearSelection,
  setSelectionMode,
  selectedNodeIds,
  type SelectionState,
} from "./selection-model";
import {
  SlideControlsPanel,
  StyleBindingPanel,
  LocalOverrideBadge,
  DiagnosticsPanel,
} from "./inspector";
import { useDeckV7RenderTree } from "./use-deck-v7-render-tree";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SlideEditorVNextProps {
  /** The v7 deck to edit. */
  deck: DeckV7;
  /** Theme package to use for rendering. Falls back to the neutral package. */
  themePackage?: ThemePackageV1 | null;
  /**
   * Called on every structural change. Receives the updated deck with the
   * command result applied. The parent is responsible for persistence.
   */
  onDeckChange: (deck: DeckV7) => void;
  /**
   * Optional explicit save callback. Called when the user requests an
   * immediate save (e.g. Save button). When omitted, the parent's
   * `onDeckChange` handler is solely responsible for persistence timing.
   *
   * Extension point for v7-specific autosave/commit infrastructure —
   * see `handleSaveV7` in `use-slide-editor-open.ts`.
   */
  onSave?: (deck: DeckV7) => Promise<ActionResult>;
  /**
   * Called when the user closes the editor. When provided, a close button
   * is rendered in the top toolbar.
   */
  onClose?: () => void;
  /**
   * Called when the user requests a PPTX export. The callback is responsible
   * for invoking `exportDeckV7AsPPTX` and triggering the browser download.
   * When provided, an "Export PPTX" button is rendered in the top toolbar.
   * Thrown errors are caught and displayed inline.
   */
  onExportPptx?: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Finds the first slide child node with the given id, searching groups
 * recursively. Returns undefined if not found.
 */
function findNodeById(
  nodes: SlideChildNode[],
  id: string,
): SlideChildNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.type === "group" && node.children) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SlideEditorVNext({
  deck,
  themePackage,
  onDeckChange,
  onSave,
  onClose,
  onExportPptx,
}: SlideEditorVNextProps): JSX.Element {
  const pkg = themePackage ?? NEUTRAL_THEME_PACKAGE;

  // Export error surfaced below the toolbar banner
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExportPptx = useCallback(async () => {
    if (!onExportPptx) return;
    setExportError(null);
    try {
      await onExportPptx();
    } catch {
      setExportError("PPTX export failed. Please try again.");
    }
  }, [onExportPptx]);

  // ---------------------------------------------------------------------------
  // Slide navigation
  // ---------------------------------------------------------------------------

  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const activeSlide: SlideNode | undefined = deck.slides[activeSlideIndex];

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  const [selection, setSelection] = useState<SelectionState>(() =>
    createSelectionState("normal"),
  );

  const handleNodeClick = useCallback(
    (nodeId: string, event: React.MouseEvent) => {
      setSelection((s) =>
        selectNode(s, nodeId, event.shiftKey || event.metaKey),
      );
    },
    [],
  );

  const handleStageClick = useCallback((e: React.MouseEvent) => {
    // Clear selection when clicking the stage background (not a node)
    if (e.target === e.currentTarget) {
      setSelection((s) => clearSelection(s));
    }
  }, []);

  const toggleSelectionMode = useCallback(() => {
    setSelection((s) =>
      setSelectionMode(s, s.mode === "normal" ? "layers" : "normal"),
    );
  }, []);

  // ---------------------------------------------------------------------------
  // Resolved render tree
  // ---------------------------------------------------------------------------

  const renderTree = useDeckV7RenderTree(deck, pkg);
  const activeSlideTree = renderTree?.slides[activeSlideIndex] ?? null;

  const diagnostics: PresentationDiagnostic[] = renderTree?.diagnostics ?? [];

  // ---------------------------------------------------------------------------
  // Selected node data (from the persisted deck, not the resolved tree)
  // ---------------------------------------------------------------------------

  const selectedIds = selectedNodeIds(selection);
  const firstSelectedId = selectedIds[0];

  const selectedNode: SlideChildNode | undefined = useMemo(() => {
    if (!activeSlide || !firstSelectedId) return undefined;
    return findNodeById(activeSlide.children, firstSelectedId);
  }, [activeSlide, firstSelectedId]);

  // Also find the selected resolved node to support decoration detach
  const selectedResolvedNode: ResolvedRenderNode | undefined = useMemo(() => {
    if (!activeSlideTree || !firstSelectedId) return undefined;
    const allNodes = [
      ...activeSlideTree.nodes,
      ...(selection.mode === "layers" ? activeSlideTree.decorations : []),
    ];
    return allNodes.find((n) => n.id === firstSelectedId);
  }, [activeSlideTree, firstSelectedId, selection.mode]);

  // ---------------------------------------------------------------------------
  // Slide root controls
  // ---------------------------------------------------------------------------

  const handleUpdateControls = useCallback(
    (patch: Partial<SlideControls>) => {
      if (!activeSlide) return;
      onDeckChange(updateSlideControls(deck, activeSlide.id, patch));
    },
    [deck, activeSlide, onDeckChange],
  );

  const handleUpdateProps = useCallback(
    (patch: Partial<SlideProps>) => {
      if (!activeSlide) return;
      // SlideProps (decoration/chrome) updates are applied via updateSlideControls
      // by merging into the slide props
      const updated: DeckV7 = {
        ...deck,
        slides: deck.slides.map((s) =>
          s.id === activeSlide.id
            ? { ...s, props: { ...s.props, ...patch } }
            : s,
        ),
      };
      onDeckChange(updated);
    },
    [deck, activeSlide, onDeckChange],
  );

  // ---------------------------------------------------------------------------
  // Style binding
  // ---------------------------------------------------------------------------

  const handleChangeStyleBinding = useCallback(
    (binding: StyleBinding) => {
      if (!activeSlide || !firstSelectedId) return;
      onDeckChange(
        updateNodeStyleBinding(deck, activeSlide.id, firstSelectedId, binding),
      );
    },
    [deck, activeSlide, firstSelectedId, onDeckChange],
  );

  // ---------------------------------------------------------------------------
  // Local override reset
  // ---------------------------------------------------------------------------

  const handleResetToTheme = useCallback(() => {
    if (!activeSlide || !firstSelectedId) return;
    onDeckChange(
      resetLocalStyleOverride(deck, activeSlide.id, firstSelectedId),
    );
  }, [deck, activeSlide, firstSelectedId, onDeckChange]);

  // ---------------------------------------------------------------------------
  // Diagnostics actions
  // ---------------------------------------------------------------------------

  const handleDiagnosticAction = useCallback(
    (action: DiagnosticAction) => {
      if (action === "reset-to-theme") {
        handleResetToTheme();
      }
      // Other actions (split-slide, open-asset-panel, etc.) require parent
      // routing — a future caller can extend this via a prop callback
    },
    [handleResetToTheme],
  );

  // ---------------------------------------------------------------------------
  // Decoration detach
  // ---------------------------------------------------------------------------

  const handleDetachDecoration = useCallback(() => {
    if (!activeSlide || !selectedResolvedNode) return;
    if (selectedResolvedNode.source !== "themeDecoration") return;

    const { layout, style } = selectedResolvedNode;
    // Build a LayoutBox from the resolved layout (drop framePx)
    const { framePx: _framePx, ...persistedLayout } = layout;
    onDeckChange(
      detachDecoration(
        deck,
        activeSlide.id,
        selectedResolvedNode.id,
        persistedLayout,
        style as StylePatch,
      ),
    );
  }, [deck, activeSlide, selectedResolvedNode, onDeckChange]);

  // ---------------------------------------------------------------------------
  // Template control support for the active slide
  // ---------------------------------------------------------------------------

  const slideControlsSupport = useMemo(() => {
    // For now, show all options (template-specific filtering can be added later)
    return undefined;
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isDecorationSelected =
    selectedResolvedNode?.source === "themeDecoration";

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-ds-surface">
      {/* ------------------------------------------------------------------ */}
      {/* Top Toolbar                                                         */}
      {/* ------------------------------------------------------------------ */}
      {(onClose ?? onExportPptx) ? (
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-ds-border-subtle px-3">
          <span className="text-xs font-medium text-ds-text-primary">
            Slides
          </span>
          <div className="flex items-center gap-1">
            {onExportPptx ? (
              <button
                type="button"
                onClick={() => void handleExportPptx()}
                aria-label="Export as PPTX"
                className="flex items-center gap-1.5 rounded-ds-sm border border-ds-border-subtle px-2.5 py-1 text-xs font-medium text-ds-text-primary transition-colors hover:bg-ds-state-hover"
              >
                <FileDown size={14} aria-hidden="true" />
                Export PPTX
              </button>
            ) : null}
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close slide editor"
                className="flex h-8 w-8 items-center justify-center rounded-ds-md border border-ds-border-subtle text-ds-text-muted transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary"
              >
                <X size={16} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Export error banner */}
      {exportError ? (
        <div
          role="alert"
          className="shrink-0 border-b border-ds-danger-border bg-ds-danger-surface px-3 py-2 text-xs text-ds-danger-text"
        >
          {exportError}
        </div>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Editor surface (rail + stage + inspector)                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* ------------------------------------------------------------------ */}
        {/* Slide Rail                                                          */}
        {/* ------------------------------------------------------------------ */}
        <nav
          aria-label="Slides"
          className="flex w-[120px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-ds-border-subtle p-2"
        >
          {renderTree?.slides.map((slideTree, index) => (
            <button
              key={slideTree.id}
              type="button"
              aria-label={`Slide ${index + 1}`}
              aria-current={index === activeSlideIndex ? "true" : undefined}
              onClick={() => {
                setActiveSlideIndex(index);
                setSelection(createSelectionState(selection.mode));
              }}
              className={`relative w-full overflow-hidden rounded-ds-sm border transition-shadow ${
                index === activeSlideIndex
                  ? "border-ds-accent-border shadow-ds-focus-ring"
                  : "border-ds-border-subtle hover:border-ds-border"
              }`}
            >
              <SlideCanvasVNext
                slide={slideTree}
                canvas={renderTree.canvas}
                preview
              />
            </button>
          ))}
        </nav>

        {/* ------------------------------------------------------------------ */}
        {/* Main Stage                                                          */}
        {/* ------------------------------------------------------------------ */}
        <div
          className="relative min-w-0 flex-1 overflow-hidden bg-ds-surface-recessed"
          onClick={handleStageClick}
        >
          {activeSlideTree ? (
            <div className="flex h-full items-center justify-center p-6">
              <div className="w-full max-w-4xl">
                <SlideCanvasVNext
                  slide={activeSlideTree}
                  canvas={renderTree?.canvas}
                  selection={selection}
                  onNodeClick={handleNodeClick}
                  className="shadow-ds-xl"
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-ds-text-muted text-sm">
              No slide selected
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Inspector Panel                                                     */}
        {/* ------------------------------------------------------------------ */}
        <aside
          aria-label="Inspector"
          className="flex w-[272px] shrink-0 flex-col gap-0 overflow-y-auto border-l border-ds-border-subtle bg-ds-surface"
        >
          {/* Mode toggle */}
          <div className="flex items-center justify-between border-b border-ds-border-subtle px-3 py-2">
            <span className="text-xs font-medium text-ds-text-primary">
              {selection.mode === "layers" ? "Layers mode" : "Inspector"}
            </span>
            <button
              type="button"
              onClick={toggleSelectionMode}
              className={`rounded-ds-sm px-2 py-0.5 text-[11px] font-medium transition-colors ${
                selection.mode === "layers"
                  ? "bg-ds-accent-surface text-ds-accent-text"
                  : "text-ds-text-muted hover:text-ds-text-secondary"
              }`}
              aria-pressed={selection.mode === "layers"}
            >
              Layers
            </button>
          </div>

          {/* Slide controls — always visible for the active slide */}
          {activeSlide && (
            <SlideControlsPanel
              controls={activeSlide.controls}
              props={activeSlide.props}
              onUpdateControls={handleUpdateControls}
              onUpdateProps={handleUpdateProps}
              supportedControls={slideControlsSupport}
            />
          )}

          {/* Node inspector — shown when a user node is selected */}
          {selectedNode && !isDecorationSelected && (
            <>
              <div className="mx-3 h-px bg-ds-border-subtle" />
              <div className="px-3 py-2">
                <LocalOverrideBadge
                  localStyle={selectedNode.localStyle}
                  onResetToTheme={handleResetToTheme}
                />
              </div>
              <StyleBindingPanel
                role={selectedNode.role}
                binding={selectedNode.style}
                onChangeStyleBinding={handleChangeStyleBinding}
              />
            </>
          )}

          {/* Decoration inspector — shown in layers mode when a decoration is selected */}
          {isDecorationSelected && (
            <>
              <div className="mx-3 h-px bg-ds-border-subtle" />
              <section className="flex flex-col gap-2 px-3 py-2.5">
                <h4 className="text-[10px] font-bold uppercase tracking-[0.06em] text-ds-text-muted">
                  Theme Decoration
                </h4>
                <p className="text-xs text-ds-text-secondary">
                  This element is generated by the theme package and follows
                  theme changes. Detach it to make independent edits.
                </p>
                <button
                  type="button"
                  onClick={handleDetachDecoration}
                  className="self-start rounded-ds-sm border border-ds-border-subtle bg-ds-surface px-3 py-1 text-xs font-medium text-ds-text-primary transition-colors hover:bg-ds-surface-raised"
                >
                  Detach from theme
                </button>
              </section>
            </>
          )}

          {/* Save button — shown when an explicit save handler is provided */}
          {onSave && (
            <>
              <div className="mx-3 h-px bg-ds-border-subtle" />
              <div className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => void onSave(deck)}
                  className="w-full rounded-ds-sm border border-ds-accent-border bg-ds-accent-surface px-3 py-1.5 text-xs font-medium text-ds-accent-text transition-colors hover:bg-ds-accent-surface-raised"
                >
                  Save
                </button>
              </div>
            </>
          )}

          {/* Diagnostics — shown when there are diagnostics for the active deck */}
          {diagnostics.length > 0 && (
            <>
              <div className="mx-3 h-px bg-ds-border-subtle" />
              <DiagnosticsPanel
                diagnostics={diagnostics}
                onAction={handleDiagnosticAction}
                hideInfo={false}
              />
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
