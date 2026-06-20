"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { $getNodeByKey, $nodesOfType } from "lexical";

import {
  ColorPicker,
  Divider,
  IconButton,
  Surface,
  Tooltip,
  cx,
} from "@/components/ui";
import { useEditorContext } from "@/lib/lexical/editor-context";
import {
  formatShortcut,
  isToolActive,
  toolsFor,
  type EditorTool,
} from "@/lib/lexical/tool-registry";
import { applyElasticLayout } from "@/lib/visual/transforms";
import type { Visual } from "@/lib/visual/schema";
import type { BrandStyle } from "@/lib/brand/schema";
import { BRAND_WEB_FONTS } from "@/lib/brand/schema";
import { applyBrand } from "@/lib/brand/transforms";
import { useVisualSvgRegistry } from "@/components/editor/visual-svg-registry";

import { $isVisualNode, VisualNode } from "./visual-node";
import { VisualContextPopover } from "./visual-context-popover";
import { useVisualPanel } from "./visual-panel-context";

// Block types from which a visual can derive source text (mirrors VisualCard).
const SOURCE_TEXT_BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "quote",
  "list",
]);

function useIsMac(): boolean {
  return useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } })
        .userAgentData?.platform ??
      navigator.platform ??
      navigator.userAgent;
    return /mac|iphone|ipad|ipod/i.test(platform);
  }, []);
}

// ---------------------------------------------------------------------------
// Text-format toolbar content (inline, no floating/position logic).
// ---------------------------------------------------------------------------

function RailToolButton({
  tool,
  active,
  shortcut,
  showDivider,
  onRun,
}: {
  tool: EditorTool;
  active: boolean;
  shortcut?: string;
  showDivider: boolean;
  onRun: () => void;
}) {
  const Icon = tool.icon;
  return (
    <>
      {showDivider ? <Divider /> : null}
      <Tooltip
        label={
          shortcut ? (
            <span className="inline-flex items-center gap-1.5">
              {tool.label}
              <kbd className="font-sans text-[var(--ds-text-muted,#a1a1aa)]">
                {shortcut}
              </kbd>
            </span>
          ) : (
            tool.label
          )
        }
      >
        <IconButton
          aria-label={shortcut ? `${tool.label} (${shortcut})` : tool.label}
          active={active}
          size="sm"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onRun}
        >
          {Icon ? <Icon aria-hidden="true" className="h-4 w-4" /> : tool.label}
        </IconButton>
      </Tooltip>
    </>
  );
}

function RailColorToolButton({
  tool,
  active,
  value,
  showDivider,
  onPick,
  onReset,
}: {
  tool: EditorTool;
  active: boolean;
  value: string;
  showDivider: boolean;
  onPick: (next: string) => void;
  onReset: () => void;
}) {
  const Icon = tool.icon;
  return (
    <>
      {showDivider ? <Divider /> : null}
      <Tooltip label={tool.label}>
        <span
          className="inline-flex"
          onMouseDown={(event) => event.preventDefault()}
        >
          <ColorPicker
            color={value}
            active={active}
            aria-label={tool.label}
            size="sm"
            icon={
              Icon ? <Icon aria-hidden="true" className="h-4 w-4" /> : undefined
            }
            preserveSelection
            onChange={onPick}
            onReset={onReset}
            resetLabel="Default (none)"
          />
        </span>
      </Tooltip>
    </>
  );
}

function TextFormatSection() {
  const [editor] = useLexicalComposerContext();
  const ctx = useEditorContext();
  const isMac = useIsMac();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [rovingIndex, setRovingIndex] = useState(0);

  const tools = useMemo(() => toolsFor("text-format", ctx), [ctx]);

  const getItems = useCallback(
    () =>
      Array.from(
        containerRef.current?.querySelectorAll<HTMLButtonElement>("button") ??
          [],
      ),
    [],
  );

  useEffect(() => {
    const items = getItems();
    if (items.length === 0) return;
    const active = Math.min(rovingIndex, items.length - 1);
    items.forEach((el, index) => {
      el.tabIndex = index === active ? 0 : -1;
    });
  });

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        editor.focus();
        return;
      }
      const items = getItems();
      if (items.length === 0) return;
      const current = items.findIndex((el) => el === document.activeElement);
      let next: number;
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          next = current < 0 ? 0 : (current + 1) % items.length;
          break;
        case "ArrowLeft":
        case "ArrowUp":
          next = current < 0 ? 0 : (current - 1 + items.length) % items.length;
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = items.length - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      setRovingIndex(next);
      items[next]?.focus();
    },
    [editor, getItems],
  );

  const onFocus = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      const items = getItems();
      const index = items.findIndex((el) => el === target);
      if (index >= 0) setRovingIndex(index);
    },
    [getItems],
  );

  return (
    <div className="p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted,#6f7d83)]">
        Text format
      </p>
      <div
        ref={containerRef}
        role="toolbar"
        aria-label="Text formatting"
        className="flex flex-wrap items-center gap-0.5"
        onKeyDown={onKeyDown}
        onFocus={onFocus}
      >
        {tools.map((tool, index) => {
          const previous = tools[index - 1];
          const showDivider =
            previous !== undefined && previous.section !== tool.section;
          if (tool.control === "color") {
            return (
              <RailColorToolButton
                key={tool.id}
                tool={tool}
                active={isToolActive(tool, ctx)}
                value={tool.value ? tool.value(ctx) : ""}
                showDivider={showDivider}
                onPick={(next) => tool.apply?.(editor, next)}
                onReset={() => tool.apply?.(editor, null)}
              />
            );
          }
          return (
            <RailToolButton
              key={tool.id}
              tool={tool}
              active={isToolActive(tool, ctx)}
              shortcut={formatShortcut(tool.shortcut, isMac)}
              showDivider={showDivider}
              onRun={() => tool.run?.(editor, ctx)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visual context section — reads node data directly from editor state.
// ---------------------------------------------------------------------------

function VisualContextSection() {
  const [editor] = useLexicalComposerContext();
  const ctx = useEditorContext();
  const { onClose, selectedNodeId } = useVisualPanel();
  const svgRegistry = useVisualSvgRegistry();

  // Merge visual data + source text into a single state object so we never
  // call multiple synchronous setStates in the same effect body.
  const [panelState, setPanelState] = useState<{
    visual: Visual;
    nodeKey: string;
    visualId: string;
    currentSourceText: string | undefined;
  } | null>(null);

  const nodeKey = ctx.selectedVisualNodeKey;
  const visualId = ctx.selectedVisualId;

  // Read the VisualNode payload whenever the selection or the editor state
  // changes. All setState calls happen inside editor.read() callbacks, which
  // satisfies the react-hooks/set-state-in-effect rule (callbacks are allowed).
  useEffect(() => {
    if (!nodeKey || !visualId) return;

    const readData = () => {
      editor.read(() => {
        const node = $getNodeByKey(nodeKey);
        if (!$isVisualNode(node)) {
          setPanelState(null);
          return;
        }
        const prev = node.getPreviousSibling();
        let srcText: string | undefined;
        if (prev !== null && SOURCE_TEXT_BLOCK_TYPES.has(prev.getType())) {
          const text = prev.getTextContent().trim();
          srcText = text || undefined;
        }
        setPanelState({
          visual: node.getVisual(),
          nodeKey,
          visualId: node.getVisualId(),
          currentSourceText: srcText,
        });
      });
    };

    readData();
    return editor.registerUpdateListener(readData);
  }, [nodeKey, visualId, editor]);

  // If the nodeKey no longer matches what we last read, treat as not-selected.
  const visualData = panelState?.nodeKey === nodeKey ? panelState : null;

  const updateVisual = useCallback(
    (next: Visual) => {
      if (!visualData) return;
      const key = visualData.nodeKey;
      editor.update(() => {
        const node = $getNodeByKey(key);
        if ($isVisualNode(node)) {
          node.setVisual(applyElasticLayout(next));
        }
      });
    },
    [editor, visualData],
  );

  const removeVisual = useCallback(() => {
    if (!visualData) return;
    const key = visualData.nodeKey;
    editor.update(() => {
      const node = $getNodeByKey(key);
      if ($isVisualNode(node)) {
        node.remove();
      }
    });
  }, [editor, visualData]);

  const applyBrandToAll = useCallback(
    (brand: BrandStyle) => {
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

  // Use the full visualData object as a dep (not a sub-property) to satisfy
  // the react-hooks/preserve-manual-memoization rule.
  const getSvgElement = useCallback(() => {
    if (!visualData?.visualId) return null;
    return svgRegistry?.get(visualData.visualId)?.() ?? null;
  }, [svgRegistry, visualData]);

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  // Stable anchor ref — panel mode doesn't use position, but the prop is required.
  const dummyAnchorRef = useRef<HTMLElement | null>(null);

  if (!visualData) return null;

  return (
    <VisualContextPopover
      mode="panel"
      visual={visualData.visual}
      selectedNodeId={selectedNodeId}
      onChange={updateVisual}
      onRemove={removeVisual}
      onClose={handleClose}
      getSvgElement={getSvgElement}
      anchorRef={dummyAnchorRef}
      currentSourceText={visualData.currentSourceText}
      onApplyBrandToAll={applyBrandToAll}
    />
  );
}

// ---------------------------------------------------------------------------
// EditingRail — the docked right-side editing panel.
// ---------------------------------------------------------------------------

/**
 * A persistent right-side editing rail that hosts contextual editing surfaces
 * at desktop widths (≥ 1024 px / Tailwind `lg:`). It reads
 * {@link useEditorContext} to determine what to show:
 *
 * - `kind === "range"` → text-format toolbar
 * - `kind === "visual"` → visual editing controls (VisualContextPopover in
 *   panel mode, reading node data directly from the Lexical editor state)
 *
 * At narrower viewports the `lg:flex` class hides the rail; the existing
 * floating surfaces handle those widths unchanged.
 *
 * Data flow invariants are preserved: surfaces read only through
 * {@link useEditorContext} and mutate exclusively via Lexical
 * commands / `editor.update()`.
 */
export function EditingRail() {
  const ctx = useEditorContext();

  const hasContent = ctx.kind === "range" || ctx.kind === "visual";

  return (
    <aside
      aria-label="Editing panel"
      // Hidden below lg (floats handle narrow viewports); at lg+ this becomes a
      // sticky column beside the article. `self-start` + `sticky top-0` keep it
      // anchored to the viewport top while the article scrolls freely.
      className={cx(
        "hidden lg:flex w-[320px] flex-shrink-0 flex-col self-start sticky top-0 max-h-screen overflow-y-auto",
        "border-l border-[var(--ds-border,rgba(0,0,0,0.06))] dark:border-[rgba(255,255,255,0.06)]",
      )}
    >
      {hasContent ? (
        <Surface
          elevation="flat"
          radius="sm"
          bordered={false}
          className="flex-1"
        >
          {ctx.kind === "range" && <TextFormatSection />}
          {ctx.kind === "visual" && <VisualContextSection />}
        </Surface>
      ) : (
        <div className="p-4 text-[12px] text-[var(--ds-text-muted,#6f7d83)]">
          Select text or a visual to see editing options.
        </div>
      )}
    </aside>
  );
}
