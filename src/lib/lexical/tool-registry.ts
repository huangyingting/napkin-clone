/**
 * The data-driven extension model for the editor's contextual surfaces.
 *
 * A {@link EditorTool} is a declarative description of a single editing
 * affordance: when it should be visible (`when`), whether it is currently
 * active (`isActive`), and what it does (`run`). Surfaces (the floating text
 * toolbar, insert menus, visual controls) render the subset of registered tools
 * whose `when()` predicate matches the current {@link EditorContextSnapshot} —
 * they never derive selection state or behaviour themselves.
 *
 * Invariants (per the approved Phase 1 decisions):
 * - `when` and `isActive` are PURE functions of the snapshot. They never touch
 *   the DOM, the editor, or Yjs — so they are unit-testable without a browser.
 * - `run` mutates the document EXCLUSIVELY through Lexical commands /
 *   `editor.update()`. It never writes to Yjs directly and never persists
 *   NodeKeys. `contentJson` (the Lexical state) stays the single source of
 *   truth.
 */
import { TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  $insertList,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import { $createHorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import {
  $createHeadingNode,
  $createQuoteNode,
  type HeadingTagType,
} from "@lexical/rich-text";
import { $patchStyleText, $setBlocksType } from "@lexical/selection";
import {
  $createParagraphNode,
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  type ElementFormatType,
  type LexicalEditor,
  type LexicalNode,
  type TextFormatType,
} from "lexical";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  BarChart3,
  Baseline,
  Bold,
  Code,
  Columns2,
  Combine,
  Filter,
  GitBranch,
  Grid2x2,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Lightbulb,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Milestone,
  Minus,
  Network,
  Quote,
  RefreshCw,
  Strikethrough,
  Triangle,
  Underline,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { INSERT_VISUAL_COMMAND } from "@/lib/lexical/commands";
import { VISUAL_KINDS, type VisualKind } from "@/lib/visual/schema";

import type { EditorContextSnapshot } from "./editor-context";

/** The contextual surface a tool belongs to. */
export type EditorToolGroup =
  | "text-format"
  | "block-insert"
  | "visual-insert"
  | "visual-edit"
  | "visual-style";

/**
 * Optional visual sub-grouping within a single surface, used to draw dividers
 * between related clusters of tools (e.g. inline formats vs. block types vs.
 * lists in the text toolbar). Purely presentational.
 */
export type EditorToolSection = string;

/**
 * How a tool renders in its surface. Most tools are `"button"` (a single
 * command/toggle). `"color"` tools render as a swatch-triggered color popover
 * (text color / highlight) — they read their value from the snapshot and write
 * an inline style on the selection.
 */
export type EditorToolControl = "button" | "color";

export type EditorTool = {
  /** Stable, unique id (also used as the React key). */
  id: string;
  /** The surface this tool renders in. */
  group: EditorToolGroup;
  /** Human-readable label (aria-label + tooltip). */
  label: string;
  /** lucide-react icon for icon-first rendering. */
  icon?: LucideIcon;
  /** Keyboard shortcut in canonical `Mod+Key` form (see {@link formatShortcut}). */
  shortcut?: string;
  /** Optional visual sub-group for divider placement within a surface. */
  section?: EditorToolSection;
  /**
   * How the tool renders in a surface. `"button"` (default) is a single-action
   * toggle/command. `"color"` is a swatch-triggered color popover that reads its
   * current value from the snapshot ({@link value}) and writes via {@link apply}.
   */
  control?: EditorToolControl;
  /**
   * Optional one-line secondary description (the menu hint shown beneath the
   * label in the `+`/`/` insert menu). Purely presentational.
   */
  description?: string;
  /**
   * Optional extra search terms for the `/` slash-menu filter (matched in
   * addition to {@link label}). Purely presentational.
   */
  keywords?: readonly string[];
  /** PURE: whether the tool is visible for this snapshot. */
  when(ctx: EditorContextSnapshot): boolean;
  /** PURE: whether the tool is currently active/toggled-on. */
  isActive?(ctx: EditorContextSnapshot): boolean;
  /**
   * Mutate the document via Lexical commands / `editor.update()` only.
   * Present for `"button"` controls; omitted for `"color"` controls (which use
   * {@link apply}). It never writes to Yjs directly and never persists NodeKeys.
   */
  run?(editor: LexicalEditor, ctx: EditorContextSnapshot): void;
  /**
   * PURE: current value of a `"color"` control for this snapshot (a CSS color,
   * or `""` when unset). Only defined for color controls.
   */
  value?(ctx: EditorContextSnapshot): string;
  /**
   * Apply (or clear, with `null`) a `"color"` control's style on the selection,
   * via `editor.update()` + `$patchStyleText`. Only defined for color controls.
   */
  apply?(editor: LexicalEditor, value: string | null): void;
};

const registry = new Map<string, EditorTool>();
const order: string[] = [];

/** Register (or replace) a single tool, preserving first-seen ordering. */
function registerTool(tool: EditorTool): void {
  if (!registry.has(tool.id)) {
    order.push(tool.id);
  }
  registry.set(tool.id, tool);
}

/** Register many tools at once. */
function registerTools(tools: readonly EditorTool[]): void {
  for (const tool of tools) {
    registerTool(tool);
  }
}

/** All registered tools, in registration order. */
function getTools(): EditorTool[] {
  return order.map((id) => registry.get(id) as EditorTool);
}

/**
 * The visible tools for a given `group`, in registration order, filtered by each
 * tool's `when(ctx)` predicate. Pure: safe to call during render.
 */
export function toolsFor(
  group: EditorToolGroup,
  ctx: EditorContextSnapshot,
): EditorTool[] {
  return getTools().filter((tool) => tool.group === group && tool.when(ctx));
}

/** Whether a tool is active for the snapshot (false when it declares no state). */
export function isToolActive(
  tool: EditorTool,
  ctx: EditorContextSnapshot,
): boolean {
  return tool.isActive ? tool.isActive(ctx) : false;
}

/**
 * Render a canonical `Mod+B` shortcut for the platform: `⌘B` on macOS,
 * `Ctrl+B` elsewhere. `Shift` collapses to `⇧` on macOS. Returns `undefined`
 * for tools without a shortcut.
 */
export function formatShortcut(
  shortcut: string | undefined,
  isMac: boolean,
): string | undefined {
  if (!shortcut) {
    return undefined;
  }
  if (isMac) {
    return shortcut.replace(/Mod\+?/g, "⌘").replace(/Shift\+?/g, "⇧");
  }
  return shortcut.replace(/Mod/g, "Ctrl");
}

// --- run helpers (Lexical commands / editor.update only) --------------------

function toggleFormat(editor: LexicalEditor, format: TextFormatType): void {
  editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
}

function setAlignment(editor: LexicalEditor, format: ElementFormatType): void {
  editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, format);
}

/**
 * Apply (or clear, with `null`) an inline `style` property on the current text
 * selection via `@lexical/selection`'s `$patchStyleText`, inside an
 * `editor.update()`. The style serialises into the `TextNode` — standard,
 * Yjs/collab-safe Lexical mutation; `contentJson` stays authoritative.
 */
function patchSelectionStyle(
  editor: LexicalEditor,
  property: "color" | "background-color",
  value: string | null,
): void {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return;
    }
    $patchStyleText(selection, { [property]: value });
  });
}

/** Whether `format` is the active alignment, treating "" / "start" as left. */
function isAlignmentActive(
  format: EditorContextSnapshot["elementFormat"],
  target: ElementFormatType,
): boolean {
  if (target === "left") {
    return format === "left" || format === "start" || format === "";
  }
  return format === target;
}

function toggleBlock(
  editor: LexicalEditor,
  target: "h1" | "h2" | "h3" | "quote",
  ctx: EditorContextSnapshot,
): void {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return;
    }
    // Toggling the active block type returns it to a plain paragraph.
    if (ctx.blockType === target) {
      $setBlocksType(selection, () => $createParagraphNode());
      return;
    }
    if (target === "quote") {
      $setBlocksType(selection, () => $createQuoteNode());
      return;
    }
    const tag: HeadingTagType = target;
    $setBlocksType(selection, () => $createHeadingNode(tag));
  });
}

function toggleList(
  editor: LexicalEditor,
  target: "bullet" | "number",
  ctx: EditorContextSnapshot,
): void {
  if (ctx.blockType === target) {
    editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    return;
  }
  editor.dispatchCommand(
    target === "bullet"
      ? INSERT_UNORDERED_LIST_COMMAND
      : INSERT_ORDERED_LIST_COMMAND,
    undefined,
  );
}

function toggleLink(editor: LexicalEditor, ctx: EditorContextSnapshot): void {
  if (ctx.isLink) {
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    return;
  }
  const url = window.prompt("Enter a URL");
  if (url === null) {
    return;
  }
  const trimmed = url.trim();
  editor.dispatchCommand(TOGGLE_LINK_COMMAND, trimmed === "" ? null : trimmed);
}

// Text-format tools are visible whenever there is a non-collapsed, editable
// text selection — exactly the condition the legacy floating toolbar used.
const onRangeSelection = (ctx: EditorContextSnapshot): boolean =>
  ctx.editable && ctx.kind === "range";

/**
 * The text formatting tool set, migrated 1:1 from the legacy floating toolbar
 * (bold/italic/link, H2/H3/quote, bullet/number lists), plus the Phase 4
 * additions: inline `code` (now themed as a chip via the editor `theme`),
 * text alignment, and text color / highlight. Underline and strikethrough are
 * surfaced too — the editor already applies them — so this exposes existing
 * capability rather than inventing new formatting.
 */
const TEXT_FORMAT_TOOLS: readonly EditorTool[] = [
  {
    id: "format-bold",
    group: "text-format",
    section: "inline",
    label: "Bold",
    icon: Bold,
    shortcut: "Mod+B",
    when: onRangeSelection,
    isActive: (ctx) => ctx.activeFormats.has("bold"),
    run: (editor) => toggleFormat(editor, "bold"),
  },
  {
    id: "format-italic",
    group: "text-format",
    section: "inline",
    label: "Italic",
    icon: Italic,
    shortcut: "Mod+I",
    when: onRangeSelection,
    isActive: (ctx) => ctx.activeFormats.has("italic"),
    run: (editor) => toggleFormat(editor, "italic"),
  },
  {
    id: "format-underline",
    group: "text-format",
    section: "inline",
    label: "Underline",
    icon: Underline,
    shortcut: "Mod+U",
    when: onRangeSelection,
    isActive: (ctx) => ctx.activeFormats.has("underline"),
    run: (editor) => toggleFormat(editor, "underline"),
  },
  {
    id: "format-strikethrough",
    group: "text-format",
    section: "inline",
    label: "Strikethrough",
    icon: Strikethrough,
    when: onRangeSelection,
    isActive: (ctx) => ctx.activeFormats.has("strikethrough"),
    run: (editor) => toggleFormat(editor, "strikethrough"),
  },
  {
    id: "format-code",
    group: "text-format",
    section: "inline",
    label: "Inline code",
    icon: Code,
    shortcut: "Mod+E",
    when: onRangeSelection,
    isActive: (ctx) => ctx.activeFormats.has("code"),
    run: (editor) => toggleFormat(editor, "code"),
  },
  {
    id: "format-link",
    group: "text-format",
    section: "inline",
    label: "Link",
    icon: LinkIcon,
    when: onRangeSelection,
    isActive: (ctx) => ctx.isLink,
    run: (editor, ctx) => toggleLink(editor, ctx),
  },
  {
    id: "block-h1",
    group: "text-format",
    section: "block",
    label: "Heading 1",
    icon: Heading1,
    when: onRangeSelection,
    isActive: (ctx) => ctx.blockType === "h1",
    run: (editor, ctx) => toggleBlock(editor, "h1", ctx),
  },
  {
    id: "block-h2",
    group: "text-format",
    section: "block",
    label: "Heading 2",
    icon: Heading2,
    when: onRangeSelection,
    isActive: (ctx) => ctx.blockType === "h2",
    run: (editor, ctx) => toggleBlock(editor, "h2", ctx),
  },
  {
    id: "block-h3",
    group: "text-format",
    section: "block",
    label: "Heading 3",
    icon: Heading3,
    when: onRangeSelection,
    isActive: (ctx) => ctx.blockType === "h3",
    run: (editor, ctx) => toggleBlock(editor, "h3", ctx),
  },
  {
    id: "block-quote",
    group: "text-format",
    section: "block",
    label: "Quote",
    icon: Quote,
    when: onRangeSelection,
    isActive: (ctx) => ctx.blockType === "quote",
    run: (editor, ctx) => toggleBlock(editor, "quote", ctx),
  },
  {
    id: "block-bullet",
    group: "text-format",
    section: "list",
    label: "Bullet list",
    icon: List,
    when: onRangeSelection,
    isActive: (ctx) => ctx.blockType === "bullet",
    run: (editor, ctx) => toggleList(editor, "bullet", ctx),
  },
  {
    id: "block-number",
    group: "text-format",
    section: "list",
    label: "Numbered list",
    icon: ListOrdered,
    when: onRangeSelection,
    isActive: (ctx) => ctx.blockType === "number",
    run: (editor, ctx) => toggleList(editor, "number", ctx),
  },
  {
    id: "align-left",
    group: "text-format",
    section: "align",
    label: "Align left",
    icon: AlignLeft,
    shortcut: "Mod+Shift+L",
    when: onRangeSelection,
    isActive: (ctx) => isAlignmentActive(ctx.elementFormat, "left"),
    run: (editor) => setAlignment(editor, "left"),
  },
  {
    id: "align-center",
    group: "text-format",
    section: "align",
    label: "Align center",
    icon: AlignCenter,
    shortcut: "Mod+Shift+E",
    when: onRangeSelection,
    isActive: (ctx) => isAlignmentActive(ctx.elementFormat, "center"),
    run: (editor) => setAlignment(editor, "center"),
  },
  {
    id: "align-right",
    group: "text-format",
    section: "align",
    label: "Align right",
    icon: AlignRight,
    shortcut: "Mod+Shift+R",
    when: onRangeSelection,
    isActive: (ctx) => isAlignmentActive(ctx.elementFormat, "right"),
    run: (editor) => setAlignment(editor, "right"),
  },
  {
    id: "align-justify",
    group: "text-format",
    section: "align",
    label: "Justify",
    icon: AlignJustify,
    shortcut: "Mod+Shift+J",
    when: onRangeSelection,
    isActive: (ctx) => isAlignmentActive(ctx.elementFormat, "justify"),
    run: (editor) => setAlignment(editor, "justify"),
  },
  {
    id: "format-text-color",
    group: "text-format",
    section: "color",
    label: "Text color",
    icon: Baseline,
    control: "color",
    when: onRangeSelection,
    isActive: (ctx) => ctx.textColor !== "",
    value: (ctx) => ctx.textColor,
    apply: (editor, value) => patchSelectionStyle(editor, "color", value),
  },
  {
    id: "format-highlight",
    group: "text-format",
    section: "color",
    label: "Highlight color",
    icon: Highlighter,
    control: "color",
    when: onRangeSelection,
    isActive: (ctx) => ctx.highlightColor !== "",
    value: (ctx) => ctx.highlightColor,
    apply: (editor, value) =>
      patchSelectionStyle(editor, "background-color", value),
  },
];

registerTools(TEXT_FORMAT_TOOLS);

// --- block-insert tool set --------------------------------------------------

/** The block types the `+`/`/` insert menu can transform the current block into. */
type BlockInsertKind = "h1" | "h2" | "h3" | "bullet" | "number" | "quote" | "divider";

/**
 * Transforms the active block into `itemKey`, reusing the exact insertion logic
 * the legacy `block-insert-menu.tsx` used: replace the anchored block with a
 * fresh empty paragraph (clearing any `/filter` trigger text and giving the
 * block transforms a clean range selection), then apply the target type. Prefers
 * the snapshot's `blockKey` (the menu-anchored block) and falls back to the live
 * selection. Mutates only through `editor.update()`; never touches Yjs.
 */
function applyBlockInsert(
  editor: LexicalEditor,
  ctx: EditorContextSnapshot,
  itemKey: BlockInsertKind,
): void {
  editor.update(() => {
    let top: LexicalNode | null = null;
    if (ctx.blockKey) {
      const node = $getNodeByKey(ctx.blockKey);
      top = node
        ? $isElementNode(node)
          ? node
          : node.getTopLevelElement()
        : null;
    } else {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        top = selection.anchor.getNode().getTopLevelElement();
      }
    }
    if (top === null || !$isElementNode(top)) {
      return;
    }
    const paragraph = $createParagraphNode();
    top.replace(paragraph);
    paragraph.select();

    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return;
    }
    if (itemKey === "h1" || itemKey === "h2" || itemKey === "h3") {
      const tag: HeadingTagType = itemKey;
      $setBlocksType(selection, () => $createHeadingNode(tag));
    } else if (itemKey === "quote") {
      $setBlocksType(selection, () => $createQuoteNode());
    } else if (itemKey === "bullet") {
      $insertList("bullet");
    } else if (itemKey === "number") {
      $insertList("number");
    } else if (itemKey === "divider") {
      selection.insertNodes([$createHorizontalRuleNode()]);
    }
  });
  editor.focus();
}

// Insert tools surface whenever the editor is editable; the insert menu itself
// owns the empty-block / slash-trigger gating for when it is shown.
const whenEditable = (ctx: EditorContextSnapshot): boolean => ctx.editable;

/**
 * The deterministic block-type insert tools offered by the `+`/`/` menu —
 * exactly the set the legacy `block-insert-menu.tsx` supported (Heading 2/3,
 * bullet/numbered list, quote, divider). Each `run` reuses that menu's block
 * transform via {@link applyBlockInsert}.
 */
const BLOCK_INSERT_TOOLS: readonly EditorTool[] = [
  {
    id: "insert-h1",
    group: "block-insert",
    label: "Heading 1",
    icon: Heading1,
    description: "Page title",
    keywords: ["heading", "h1", "title"],
    when: whenEditable,
    run: (editor, ctx) => applyBlockInsert(editor, ctx, "h1"),
  },
  {
    id: "insert-h2",
    group: "block-insert",
    label: "Heading 2",
    icon: Heading2,
    description: "Section heading",
    keywords: ["heading", "h2", "title", "subtitle"],
    when: whenEditable,
    run: (editor, ctx) => applyBlockInsert(editor, ctx, "h2"),
  },
  {
    id: "insert-h3",
    group: "block-insert",
    label: "Heading 3",
    icon: Heading3,
    description: "Sub-section heading",
    keywords: ["heading", "h3", "subtitle"],
    when: whenEditable,
    run: (editor, ctx) => applyBlockInsert(editor, ctx, "h3"),
  },
  {
    id: "insert-bullet",
    group: "block-insert",
    label: "Bullet list",
    icon: List,
    description: "Unordered list",
    keywords: ["bullet", "unordered", "list", "ul"],
    when: whenEditable,
    run: (editor, ctx) => applyBlockInsert(editor, ctx, "bullet"),
  },
  {
    id: "insert-number",
    group: "block-insert",
    label: "Numbered list",
    icon: ListOrdered,
    description: "Ordered list",
    keywords: ["numbered", "ordered", "list", "ol"],
    when: whenEditable,
    run: (editor, ctx) => applyBlockInsert(editor, ctx, "number"),
  },
  {
    id: "insert-quote",
    group: "block-insert",
    label: "Quote",
    icon: Quote,
    description: "Block quote",
    keywords: ["quote", "blockquote", "citation"],
    when: whenEditable,
    run: (editor, ctx) => applyBlockInsert(editor, ctx, "quote"),
  },
  {
    id: "insert-divider",
    group: "block-insert",
    label: "Divider",
    icon: Minus,
    description: "Horizontal rule",
    keywords: ["divider", "hr", "horizontal", "rule", "separator"],
    when: whenEditable,
    run: (editor, ctx) => applyBlockInsert(editor, ctx, "divider"),
  },
];

registerTools(BLOCK_INSERT_TOOLS);

// --- visual-insert tool set -------------------------------------------------

/** Presentational metadata for a {@link VisualKind} in the insert surfaces. */
export type VisualKindMeta = {
  label: string;
  icon: LucideIcon;
  description: string;
  keywords: readonly string[];
};

/**
 * Single source of truth for how each blank {@link VisualKind} is presented in
 * the insert surfaces (the `+`/`/` menu's "Visuals" section and the per-block
 * gutter spark's deterministic insert row). Labels/icons/keywords live here so
 * the menu (via {@link VISUAL_INSERT_TOOLS}) and the gutter stay in lockstep.
 */
export const VISUAL_KIND_META: Record<VisualKind, VisualKindMeta> = {
  flowchart: {
    label: "Flowchart",
    icon: Workflow,
    description: "Steps & decisions",
    keywords: ["flow", "process", "steps", "diagram", "workflow"],
  },
  mindmap: {
    label: "Mind map",
    icon: Network,
    description: "Branching ideas",
    keywords: ["mind", "map", "brainstorm", "branches", "ideas"],
  },
  list: {
    label: "List",
    icon: ListChecks,
    description: "Itemized points",
    keywords: ["list", "items", "points", "checklist"],
  },
  chart: {
    label: "Chart",
    icon: BarChart3,
    description: "Bars & values",
    keywords: ["chart", "bar", "graph", "data", "values"],
  },
  concept: {
    label: "Concept",
    icon: Lightbulb,
    description: "Central idea map",
    keywords: ["concept", "idea", "relationship", "map"],
  },
  timeline: {
    label: "Timeline",
    icon: Milestone,
    description: "Events over time",
    keywords: ["timeline", "time", "events", "history", "schedule"],
  },
  cycle: {
    label: "Cycle",
    icon: RefreshCw,
    description: "Repeating loop",
    keywords: ["cycle", "loop", "circular", "process"],
  },
  comparison: {
    label: "Comparison",
    icon: Columns2,
    description: "Side by side",
    keywords: ["comparison", "compare", "versus", "vs", "columns"],
  },
  funnel: {
    label: "Funnel",
    icon: Filter,
    description: "Narrowing stages",
    keywords: ["funnel", "stages", "conversion", "pipeline"],
  },
  venn: {
    label: "Venn",
    icon: Combine,
    description: "Overlapping sets",
    keywords: ["venn", "overlap", "sets", "intersection"],
  },
  pyramid: {
    label: "Pyramid",
    icon: Triangle,
    description: "Stacked hierarchy",
    keywords: ["pyramid", "hierarchy", "levels", "stack"],
  },
  matrix: {
    label: "Matrix",
    icon: Grid2x2,
    description: "2×2 quadrant grid",
    keywords: ["matrix", "quadrant", "grid", "2x2"],
  },
  orgchart: {
    label: "Org chart",
    icon: GitBranch,
    description: "Team hierarchy",
    keywords: ["org", "orgchart", "hierarchy", "team", "tree"],
  },
};

/**
 * The deterministic, non-AI "Insert Visual" tool set: one tool per
 * {@link VisualKind}. Each `run` dispatches {@link INSERT_VISUAL_COMMAND} with
 * the kind (and the snapshot's anchored `blockKey` so the visual lands after the
 * active block) — the UI never builds a `VisualNode` or writes to the DB itself;
 * Tank's command handler owns insertion + selection + persistence.
 */
const VISUAL_INSERT_TOOLS: readonly EditorTool[] = VISUAL_KINDS.map(
  (kind) => {
    const meta = VISUAL_KIND_META[kind];
    return {
      id: `insert-visual-${kind}`,
      group: "visual-insert",
      label: meta.label,
      icon: meta.icon,
      description: meta.description,
      keywords: meta.keywords,
      when: whenEditable,
      run: (editor, ctx) =>
        editor.dispatchCommand(INSERT_VISUAL_COMMAND, {
          kind,
          afterNodeKey: ctx.blockKey,
        }),
    } satisfies EditorTool;
  },
);

registerTools(VISUAL_INSERT_TOOLS);
