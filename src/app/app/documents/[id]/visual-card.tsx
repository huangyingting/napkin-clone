"use client";

import { Check, Copy, Download, Share2 } from "lucide-react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNodeByKey, $nodesOfType } from "lexical";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

import { useCardMotion } from "@/components/motion/reveal";
import { FOCUS_RING } from "@/components/motion/control-styles";
import { VisualRenderer } from "@/components/visual/visual-renderer";
import { safeParseVisual, type Visual } from "@/lib/visual/schema";
import {
  DEFAULT_EXPORT_OPTIONS,
  exportPNG,
  downloadBlob,
} from "@/lib/visual/export";
import { applySocialPresetToOptions } from "@/lib/visual/export-options";
import { applyElasticLayout } from "@/lib/visual/transforms";
import { applyBrand } from "@/lib/brand/transforms";
import type { BrandStyle } from "@/lib/brand/schema";
import { BRAND_WEB_FONTS } from "@/lib/brand/schema";
import {
  canCopyImageToClipboard,
  canWebShare,
} from "@/lib/share/social-intents";

import { useRegisterVisualSvg } from "@/components/editor/visual-svg-registry";
import { useRightSurface } from "./right-surface-context";

import { useEditingSurface } from "./use-editing-surface";
import { useDockedPreference } from "./docked-preference";
import { useVisualAnchor } from "./visual-anchor-context";
import { VisualContextPopover } from "./visual-context-popover";
import { VisualEditor } from "./visual-editor";
import { $isVisualNode, $createVisualNode, VisualNode } from "./visual-node";
import { useVisualPanel } from "./visual-panel-context";

// Block types whose text content can serve as a visual's source anchor.
const SOURCE_TEXT_BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "quote",
  "list",
]);

/**
 * Interactive card for a {@link Visual} embedded in the Lexical editor (US-012).
 * Read-only by default; clicking it (when the editor is editable) opens the
 * contextual {@link VisualContextPopover} plus the in-card {@link VisualEditor}
 * — the single Phase-3 editing surface (type / theme / refine / typography /
 * per-element overrides).
 *
 * Visibility is local React state, not a Lexical `NodeSelection`. Under
 * real-time collaboration the `@lexical/yjs` binding discards programmatic
 * decorator `NodeSelection`s on commit (a decorator selection has no Yjs
 * relative-position representation, so it resets to null), which is why the
 * selection-driven popover never surfaced. Local state is the single source of
 * truth for visibility: click-away is scoped to the editor root (clicking other
 * document content — or another visual — closes this one, giving
 * single-active-visual semantics) and Escape / × close via the popover surface.
 *
 * Every edit writes back via `node.setVisual` inside an `editor.update`, a local
 * edit that persists through the debounced Lexical save (US-003) and the
 * mirrored `Visual` row (US-011). No NodeKey is ever persisted.
 */
export function VisualCard({
  nodeKey,
  visual,
  visualId,
}: {
  nodeKey: string;
  visual: Visual;
  visualId: string;
}) {
  const [editor] = useLexicalComposerContext();

  const rootRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<SVGSVGElement | null>(null);

  // Register this card's SVG getter in the document-level export registry so
  // the whole-document export can include every visual in reading order.
  useRegisterVisualSvg(visualId, () => rendererRef.current);

  const [editable, setEditable] = useState(() => editor.isEditable());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  // Whether this card's editing controls are open. Local state (not a Lexical
  // NodeSelection) so it survives collaborative updates — see the component doc.
  const [open, setOpen] = useState(false);

  // When the full-page SlideEditor is open it covers the whole screen, so the
  // inline floating overlay would be hidden behind it. The coordinator
  // suppresses the float while the slide editor is active; visual editing
  // remains accessible via the docked rail.
  const { suppressFloatPopover } = useRightSurface();

  // When the user has opted into the docked rail (dockedPreference === "on")
  // and the resolver puts us in "docked" mode (≥ lg), the visual-edit controls
  // render in the rail instead. Suppress the inline float here so a visual is
  // never edited in two surfaces at once. Gating on the preference (not merely
  // mode === "docked") is essential for byte-for-byte safety: with the
  // preference OFF the resolver can still return "docked"(overall) for the
  // no-selection case at ≥ lg (R4), but the rail is not mounted then, so the
  // float must keep showing exactly as on main.
  const editingSurface = useEditingSurface();
  const dockedPreference = useDockedPreference();
  const dockedActive =
    editingSurface.mode === "docked" && dockedPreference === "on";

  // Current text content of the immediately preceding block (the likely anchor).
  // Updated on every editor state change so the popover can detect staleness.
  const [currentSourceText, setCurrentSourceText] = useState<
    string | undefined
  >(undefined);

  useEffect(() => {
    const readSourceText = () => {
      editor.read(() => {
        const node = $getNodeByKey(nodeKey);
        if (node === null) {
          setCurrentSourceText(undefined);
          return;
        }
        const prev = node.getPreviousSibling();
        if (prev !== null && SOURCE_TEXT_BLOCK_TYPES.has(prev.getType())) {
          const text = prev.getTextContent().trim();
          setCurrentSourceText(text || undefined);
        } else {
          setCurrentSourceText(undefined);
        }
      });
    };
    readSourceText();
    return editor.registerUpdateListener(readSourceText);
  }, [editor, nodeKey]);

  const cardMotion = useCardMotion();

  const showControls = open && editable;

  // Report the selected visual element up to the editor chrome so a comment can
  // be anchored to it (US-017). We store the node id + label, not a Lexical key.
  const visualAnchor = useVisualAnchor();
  const reportedAnchorRef = useRef(false);
  useEffect(() => {
    if (!visualAnchor) {
      return;
    }
    if (showControls && selectedNodeId) {
      const node = visual.nodes.find((item) => item.id === selectedNodeId);
      visualAnchor.setVisualAnchor({
        id: selectedNodeId,
        label: node?.label?.trim() || "element",
      });
      reportedAnchorRef.current = true;
    } else if (reportedAnchorRef.current) {
      visualAnchor.setVisualAnchor(null);
      reportedAnchorRef.current = false;
    }
  }, [visualAnchor, showControls, selectedNodeId, visual.nodes]);

  useEffect(() => {
    return editor.registerEditableListener((value) => {
      setEditable(value);
      // Never leave stale editing UI open when the card becomes non-editable
      // (read-only access, or collaboration not yet ready).
      if (!value) {
        setOpen(false);
      }
    });
  }, [editor]);

  // Click-away + single-active-visual: a pointer-down inside the editor but
  // outside this card closes the controls. Scoped to the editor root so clicks
  // on the portaled popover and its nested pickers (which render outside the
  // editable root) keep the controls open; Escape and × close via the popover.
  useEffect(() => {
    if (!showControls) {
      return;
    }
    const root = editor.getRootElement();
    if (!root) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };
    root.addEventListener("mousedown", onPointerDown);
    return () => root.removeEventListener("mousedown", onPointerDown);
  }, [showControls, editor]);

  // Writes a new payload back to the node. This is a local edit, so the editor's
  // OnChangePlugin debounce-saves it into `contentJson` (US-003) and the save
  // action mirrors it to the `Visual` row (US-011). When `autoLayout` is on,
  // elastic layout is re-applied here so the canvas always grows to fit content.
  const updateVisual = useCallback(
    (next: Visual) => {
      const toSave = applyElasticLayout(next);
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if ($isVisualNode(node)) {
          node.setVisual(toSave);
        }
      });
    },
    [editor, nodeKey],
  );

  // Removes this visual block from the document (US-013).
  const removeVisual = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isVisualNode(node)) {
        node.remove();
      }
    });
  }, [editor, nodeKey]);

  // Duplicates this visual block by inserting a new VisualNode with the same
  // payload immediately after the current node. A fresh visualId is generated
  // by $createVisualNode so the duplicate is tracked independently. Collab-safe:
  // the mutation goes through editor.update() → node.insertAfter().
  const duplicateVisual = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isVisualNode(node)) {
        const copy = $createVisualNode(node.getVisual());
        node.insertAfter(copy);
      }
    });
  }, [editor, nodeKey]);

  /**
   * Applies a brand to ALL VisualNodes in the document via a single
   * `editor.update()` call using `$nodesOfType` to find all visual nodes.
   * Yjs-safe: mutations go through `node.setVisual()` as a local edit.
   *
   * Fonts referenced by the brand are injected as <link> tags so they load
   * immediately in the editor canvas.
   */
  const applyBrandToAll = useCallback(
    (brand: BrandStyle) => {
      // Inject Google Font if needed
      if (brand.fontFamily) {
        const match = BRAND_WEB_FONTS.find(
          (f) => f.cssFamily === brand.fontFamily,
        );
        if (match) {
          const id = `gfont-brand-${match.id}`;
          if (!document.getElementById(id)) {
            const link = document.createElement("link");
            link.id = id;
            link.rel = "stylesheet";
            link.href = match.url;
            document.head.appendChild(link);
          }
        }
      }

      editor.update(() => {
        const nodes = $nodesOfType(VisualNode);
        for (const node of nodes) {
          node.setVisual(
            applyElasticLayout(applyBrand(node.getVisual(), brand)),
          );
        }
      });
    },
    [editor],
  );

  // Opens this card's editing controls. Visibility is local state; the
  // editor-root click-away above closes any other open visual, giving
  // single-active-visual semantics without a (collab-stripped) NodeSelection.
  const selectVisual = useCallback(() => {
    setOpen(true);
  }, []);

  // Closes the controls (Escape / × / click-away).
  const closeControls = useCallback(() => {
    setOpen(false);
  }, []);

  // Sync the close callback and selected-node id with the editing bottom-sheet
  // (touch fallback) so it can render the visual controls and forward close
  // events.
  const { setOnClose, setSelectedNodeId: setPanelSelectedNodeId } =
    useVisualPanel();

  useEffect(() => {
    if (showControls) {
      setOnClose(closeControls);
      setPanelSelectedNodeId(selectedNodeId);
      return () => {
        setOnClose(null);
        setPanelSelectedNodeId(null);
      };
    }
    setOnClose(null);
    setPanelSelectedNodeId(null);
  }, [
    showControls,
    closeControls,
    selectedNodeId,
    setOnClose,
    setPanelSelectedNodeId,
  ]);

  // Parse once per `visual` identity. An unmemoized parse returns a fresh object
  // (and `nodes` array) every render, which would make every downstream consumer
  // that depends on it (the anchor-reporting effect here, the popover's
  // `selectedNode`/reposition effect) re-run on every render and loop with their
  // own setState calls.
  const parsed = useMemo(() => safeParseVisual(visual), [visual]);

  // Quick-download: export the visual as PNG on the download icon click.
  const quickDownload = useCallback(
    async (event: React.MouseEvent) => {
      event.stopPropagation();
      const svg = rendererRef.current;
      if (!svg || !parsed.success) return;
      const visualData = parsed.data;
      const opts = {
        ...DEFAULT_EXPORT_OPTIONS,
        aspectRatio: visualData.aspectRatio,
      };
      const blob = await exportPNG(svg, opts);
      if (blob) {
        const filename = (visualData.title?.trim() || "visual") + ".png";
        downloadBlob(blob, filename);
      }
    },
    [parsed],
  );

  // Copy image to clipboard.
  const [copyImageState, setCopyImageState] = useState<
    "idle" | "copying" | "copied" | "error"
  >("idle");
  const copyImageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (copyImageTimerRef.current !== null)
        clearTimeout(copyImageTimerRef.current);
    };
  }, []);

  const copyImage = useCallback(async (event: React.MouseEvent) => {
    event.stopPropagation();
    const svg = rendererRef.current;
    if (!svg) return;
    setCopyImageState("copying");
    try {
      const opts = applySocialPresetToOptions("square", DEFAULT_EXPORT_OPTIONS);
      const blob = await exportPNG(svg, opts);
      if (!blob) throw new Error("exportPNG returned null");
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setCopyImageState("copied");
      copyImageTimerRef.current = setTimeout(
        () => setCopyImageState("idle"),
        2500,
      );
    } catch {
      setCopyImageState("error");
      copyImageTimerRef.current = setTimeout(
        () => setCopyImageState("idle"),
        2500,
      );
    }
  }, []);

  // Native share: share visual image via Web Share API when available.
  const nativeShare = useCallback(
    async (event: React.MouseEvent) => {
      event.stopPropagation();
      const svg = rendererRef.current;
      if (!svg || !parsed.success) return;
      const visualData = parsed.data;
      const name = visualData.title?.trim() || "visual";
      try {
        const opts = applySocialPresetToOptions(
          "square",
          DEFAULT_EXPORT_OPTIONS,
        );
        const blob = await exportPNG(svg, opts);
        if (blob) {
          const file = new File([blob], `${name}.png`, { type: "image/png" });
          if (canWebShare(file)) {
            await navigator.share({ files: [file], title: name });
            return;
          }
        }
        if (canWebShare()) {
          await navigator.share({ title: name });
        }
      } catch (err) {
        // Ignore user-initiated cancellations
        if (!(err instanceof Error && err.name === "AbortError")) {
          console.error("[SocialShare] native share failed:", err);
        }
      }
    },
    [parsed],
  );

  if (!parsed.success) {
    return (
      <div
        role="img"
        aria-label="Unavailable visual"
        className="my-4 rounded-2xl border border-dashed border-[var(--ds-border-subtle,rgba(0,0,0,0.12))] bg-[var(--ds-surface-sunken,#f4f4f5)] p-6 text-center text-sm text-[var(--ds-text-muted,#6f7d83)]"
      >
        This visual could not be displayed.
      </div>
    );
  }

  const data = parsed.data;

  const cardClass = [
    "overflow-hidden rounded-2xl border bg-[var(--ds-surface-base,#ffffff)] p-2 transition",
    showControls
      ? "border-[var(--ds-accent,#6366f1)] ring-2 ring-[var(--ds-accent,#6366f1)]/20"
      : "border-[var(--ds-border-subtle,rgba(0,0,0,0.06))]",
  ].join(" ");

  return (
    <motion.div
      ref={rootRef}
      data-visual-chrome
      className="relative my-4"
      initial={cardMotion.initial}
      animate={cardMotion.animate}
      transition={cardMotion.transition}
    >
      {showControls ? (
        <div className={cardClass}>
          <VisualEditor
            visual={data}
            onChange={updateVisual}
            onSelectNode={setSelectedNodeId}
            rendererRef={rendererRef}
            canEdit
          />
        </div>
      ) : editable ? (
        <div className="group relative">
          <button
            type="button"
            aria-label="Edit visual"
            // Prevent the button from grabbing focus from the editor on click
            // (avoids a focus flash as it unmounts into the editing controls)
            // while still firing `onClick`; keyboard activation is unaffected.
            onMouseDown={(event) => event.preventDefault()}
            onClick={selectVisual}
            className={`${cardClass} block w-full cursor-pointer text-left hover:border-[var(--ds-border-strong,rgba(0,0,0,0.2))] ${FOCUS_RING}`}
          >
            <VisualRenderer
              ref={rendererRef}
              visual={data}
              className="pointer-events-none block h-auto w-full"
            />
          </button>
          {/* Quick-download button — visible on hover */}
          <button
            type="button"
            aria-label="Download visual as PNG"
            title="Download PNG"
            onClick={(e) => void quickDownload(e)}
            className={[
              "absolute bottom-3 right-3 flex h-7 w-7 items-center justify-center rounded-full border border-ds-border-subtle bg-ds-surface-glass text-ds-text-muted opacity-0 shadow-sm backdrop-blur-sm transition hover:text-ds-text-primary group-hover:opacity-100",
              FOCUS_RING,
            ].join(" ")}
          >
            <Download aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
          {/* Copy image to clipboard — only when Clipboard API is available */}
          {canCopyImageToClipboard() && (
            <button
              type="button"
              aria-label={
                copyImageState === "copied"
                  ? "Image copied!"
                  : copyImageState === "error"
                    ? "Copy failed"
                    : "Copy image to clipboard"
              }
              title={
                copyImageState === "copied"
                  ? "Copied!"
                  : copyImageState === "error"
                    ? "Failed"
                    : "Copy image"
              }
              onClick={(e) => void copyImage(e)}
              disabled={copyImageState === "copying"}
              className={[
                "absolute bottom-3 right-12 flex h-7 w-7 items-center justify-center rounded-full border border-ds-border-subtle bg-ds-surface-glass text-ds-text-muted opacity-0 shadow-sm backdrop-blur-sm transition hover:text-ds-text-primary group-hover:opacity-100",
                "disabled:cursor-wait",
                FOCUS_RING,
              ].join(" ")}
            >
              {copyImageState === "copied" ? (
                <Check
                  aria-hidden="true"
                  className="h-3.5 w-3.5 text-ds-success-text"
                />
              ) : (
                <Copy aria-hidden="true" className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          {/* Native share — only on devices that support Web Share API */}
          {canWebShare() && (
            <button
              type="button"
              aria-label="Share visual"
              title="Share"
              onClick={(e) => void nativeShare(e)}
              className={[
                "absolute bottom-3 right-[5.25rem] flex h-7 w-7 items-center justify-center rounded-full border border-ds-border-subtle bg-ds-surface-glass text-ds-text-muted opacity-0 shadow-sm backdrop-blur-sm transition hover:text-ds-text-primary group-hover:opacity-100",
                FOCUS_RING,
              ].join(" ")}
            >
              <Share2 aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ) : (
        <div className={cardClass}>
          <VisualRenderer
            ref={rendererRef}
            visual={data}
            className="block h-auto w-full"
          />
        </div>
      )}

      {/* Float the visual editing popover inline beside the selected visual so
          its properties can be adjusted in place. Suppressed only while the
          SlideEditor panel is open, so the two right-side surfaces never appear
          at once. */}
      {showControls && !suppressFloatPopover && !dockedActive ? (
        <VisualContextPopover
          visual={data}
          selectedNodeId={selectedNodeId}
          onChange={updateVisual}
          onRemove={removeVisual}
          onClose={closeControls}
          getSvgElement={() => rendererRef.current}
          anchorRef={rootRef}
          currentSourceText={currentSourceText}
          onApplyBrandToAll={applyBrandToAll}
          onDuplicate={duplicateVisual}
        />
      ) : null}
    </motion.div>
  );
}
