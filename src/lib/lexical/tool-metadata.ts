import { shortcutCanonical, type ShortcutId } from "@/lib/shortcuts/catalog";
import { VISUAL_KINDS, type VisualKind } from "@/lib/visual/schema";

import type { ToolIconName } from "./tool-icons";
import type {
  ToolActiveName,
  ToolValueName,
  ToolVisibilityName,
} from "./tool-predicates";
import type { ToolApplyName, ToolRunName } from "./tool-mutations";
import type {
  EditorToolControl,
  EditorToolGroup,
  EditorToolSection,
} from "./tool-types";

function editorShortcut(id: ShortcutId): string {
  const shortcut = shortcutCanonical(id);
  if (!shortcut) {
    throw new Error(`Shortcut ${id} has no canonical label`);
  }
  return shortcut;
}

export type VisualKindMeta = {
  label: string;
  icon: ToolIconName;
  description: string;
  keywords: readonly string[];
};

export const VISUAL_KIND_META_DATA: Record<VisualKind, VisualKindMeta> = {
  flowchart: {
    label: "Flowchart",
    icon: "workflow",
    description: "Steps & decisions",
    keywords: ["flow", "process", "steps", "diagram", "workflow"],
  },
  mindmap: {
    label: "Mind map",
    icon: "network",
    description: "Branching ideas",
    keywords: ["mind", "map", "brainstorm", "branches", "ideas"],
  },
  list: {
    label: "List",
    icon: "listChecks",
    description: "Itemized points",
    keywords: ["list", "items", "points", "checklist"],
  },
  chart: {
    label: "Chart",
    icon: "barChart",
    description: "Bars & values",
    keywords: ["chart", "bar", "graph", "data", "values"],
  },
  concept: {
    label: "Concept",
    icon: "lightbulb",
    description: "Central idea map",
    keywords: ["concept", "idea", "relationship", "map"],
  },
  timeline: {
    label: "Timeline",
    icon: "milestone",
    description: "Events over time",
    keywords: ["timeline", "time", "events", "history", "schedule"],
  },
  cycle: {
    label: "Cycle",
    icon: "refresh",
    description: "Repeating loop",
    keywords: ["cycle", "loop", "circular", "process"],
  },
  comparison: {
    label: "Comparison",
    icon: "columns",
    description: "Side by side",
    keywords: ["comparison", "compare", "versus", "vs", "columns"],
  },
  funnel: {
    label: "Funnel",
    icon: "filter",
    description: "Narrowing stages",
    keywords: ["funnel", "stages", "conversion", "pipeline"],
  },
  venn: {
    label: "Venn",
    icon: "combine",
    description: "Overlapping sets",
    keywords: ["venn", "overlap", "sets", "intersection"],
  },
  pyramid: {
    label: "Pyramid",
    icon: "triangle",
    description: "Stacked hierarchy",
    keywords: ["pyramid", "hierarchy", "levels", "stack"],
  },
  matrix: {
    label: "Matrix",
    icon: "grid",
    description: "2×2 quadrant grid",
    keywords: ["matrix", "quadrant", "grid", "2x2"],
  },
  orgchart: {
    label: "Org chart",
    icon: "gitBranch",
    description: "Team hierarchy",
    keywords: ["org", "orgchart", "hierarchy", "team", "tree"],
  },
};

export type ToolMetadata = {
  id: string;
  group: EditorToolGroup;
  label: string;
  icon?: ToolIconName;
  shortcut?: string;
  section?: EditorToolSection;
  control?: EditorToolControl;
  description?: string;
  keywords?: readonly string[];
  when: ToolVisibilityName;
  isActive?: ToolActiveName;
  run?: ToolRunName;
  value?: ToolValueName;
  apply?: ToolApplyName;
  visualKind?: VisualKind;
};

export const TEXT_FORMAT_TOOL_METADATA: readonly ToolMetadata[] = [
  {
    id: "format-bold",
    group: "text-format",
    section: "inline",
    label: "Bold",
    icon: "bold",
    shortcut: editorShortcut("editor.format.bold"),
    when: "rangeSelection",
    isActive: "bold",
    run: "formatBold",
  },
  {
    id: "format-italic",
    group: "text-format",
    section: "inline",
    label: "Italic",
    icon: "italic",
    shortcut: editorShortcut("editor.format.italic"),
    when: "rangeSelection",
    isActive: "italic",
    run: "formatItalic",
  },
  {
    id: "format-underline",
    group: "text-format",
    section: "inline",
    label: "Underline",
    icon: "underline",
    shortcut: editorShortcut("editor.format.underline"),
    when: "rangeSelection",
    isActive: "underline",
    run: "formatUnderline",
  },
  {
    id: "format-strikethrough",
    group: "text-format",
    section: "inline",
    label: "Strikethrough",
    icon: "strikethrough",
    when: "rangeSelection",
    isActive: "strikethrough",
    run: "formatStrikethrough",
  },
  {
    id: "format-code",
    group: "text-format",
    section: "inline",
    label: "Inline code",
    icon: "code",
    shortcut: editorShortcut("editor.format.inline-code"),
    when: "rangeSelection",
    isActive: "code",
    run: "formatCode",
  },
  {
    id: "format-link",
    group: "text-format",
    section: "inline",
    label: "Link",
    icon: "link",
    when: "rangeSelection",
    isActive: "link",
    run: "formatLink",
  },
  {
    id: "block-h1",
    group: "text-format",
    section: "block",
    label: "Heading 1",
    icon: "heading1",
    when: "rangeSelection",
    isActive: "h1",
    run: "blockH1",
  },
  {
    id: "block-h2",
    group: "text-format",
    section: "block",
    label: "Heading 2",
    icon: "heading2",
    when: "rangeSelection",
    isActive: "h2",
    run: "blockH2",
  },
  {
    id: "block-h3",
    group: "text-format",
    section: "block",
    label: "Heading 3",
    icon: "heading3",
    when: "rangeSelection",
    isActive: "h3",
    run: "blockH3",
  },
  {
    id: "block-quote",
    group: "text-format",
    section: "block",
    label: "Quote",
    icon: "quote",
    when: "rangeSelection",
    isActive: "quote",
    run: "blockQuote",
  },
  {
    id: "block-bullet",
    group: "text-format",
    section: "list",
    label: "Bullet list",
    icon: "list",
    when: "rangeSelection",
    isActive: "bullet",
    run: "blockBullet",
  },
  {
    id: "block-number",
    group: "text-format",
    section: "list",
    label: "Numbered list",
    icon: "listOrdered",
    when: "rangeSelection",
    isActive: "number",
    run: "blockNumber",
  },
  {
    id: "align-left",
    group: "text-format",
    section: "align",
    label: "Align left",
    icon: "alignLeft",
    shortcut: editorShortcut("editor.align.left"),
    when: "rangeSelection",
    isActive: "alignLeft",
    run: "alignLeft",
  },
  {
    id: "align-center",
    group: "text-format",
    section: "align",
    label: "Align center",
    icon: "alignCenter",
    shortcut: editorShortcut("editor.align.center"),
    when: "rangeSelection",
    isActive: "alignCenter",
    run: "alignCenter",
  },
  {
    id: "align-right",
    group: "text-format",
    section: "align",
    label: "Align right",
    icon: "alignRight",
    shortcut: editorShortcut("editor.align.right"),
    when: "rangeSelection",
    isActive: "alignRight",
    run: "alignRight",
  },
  {
    id: "align-justify",
    group: "text-format",
    section: "align",
    label: "Justify",
    icon: "alignJustify",
    shortcut: editorShortcut("editor.align.justify"),
    when: "rangeSelection",
    isActive: "alignJustify",
    run: "alignJustify",
  },
  {
    id: "format-text-color",
    group: "text-format",
    section: "color",
    label: "Text color",
    icon: "baseline",
    control: "color",
    when: "rangeSelection",
    isActive: "textColor",
    value: "textColor",
    apply: "textColor",
  },
  {
    id: "format-highlight",
    group: "text-format",
    section: "color",
    label: "Highlight color",
    icon: "highlighter",
    control: "color",
    when: "rangeSelection",
    isActive: "highlightColor",
    value: "highlightColor",
    apply: "highlightColor",
  },
];

export const BLOCK_INSERT_TOOL_METADATA: readonly ToolMetadata[] = [
  {
    id: "insert-h1",
    group: "block-insert",
    label: "Heading 1",
    icon: "heading1",
    description: "Page title",
    keywords: ["heading", "h1", "title"],
    when: "editable",
    run: "insertH1",
  },
  {
    id: "insert-h2",
    group: "block-insert",
    label: "Heading 2",
    icon: "heading2",
    description: "Section heading",
    keywords: ["heading", "h2", "title", "subtitle"],
    when: "editable",
    run: "insertH2",
  },
  {
    id: "insert-h3",
    group: "block-insert",
    label: "Heading 3",
    icon: "heading3",
    description: "Sub-section heading",
    keywords: ["heading", "h3", "subtitle"],
    when: "editable",
    run: "insertH3",
  },
  {
    id: "insert-bullet",
    group: "block-insert",
    label: "Bullet list",
    icon: "list",
    description: "Unordered list",
    keywords: ["bullet", "unordered", "list", "ul"],
    when: "editable",
    run: "insertBullet",
  },
  {
    id: "insert-number",
    group: "block-insert",
    label: "Numbered list",
    icon: "listOrdered",
    description: "Ordered list",
    keywords: ["numbered", "ordered", "list", "ol"],
    when: "editable",
    run: "insertNumber",
  },
  {
    id: "insert-quote",
    group: "block-insert",
    label: "Quote",
    icon: "quote",
    description: "Block quote",
    keywords: ["quote", "blockquote", "citation"],
    when: "editable",
    run: "insertQuote",
  },
  {
    id: "insert-divider",
    group: "block-insert",
    label: "Divider",
    icon: "minus",
    description: "Horizontal rule",
    keywords: ["divider", "hr", "horizontal", "rule", "separator"],
    when: "editable",
    run: "insertDivider",
  },
];

export const VISUAL_INSERT_TOOL_METADATA: readonly ToolMetadata[] =
  VISUAL_KINDS.map((kind) => {
    const meta = VISUAL_KIND_META_DATA[kind];
    return {
      id: `insert-visual-${kind}`,
      group: "visual-insert",
      label: meta.label,
      icon: meta.icon,
      description: meta.description,
      keywords: meta.keywords,
      when: "editable",
      visualKind: kind,
    } satisfies ToolMetadata;
  });

export const TOOL_METADATA: readonly ToolMetadata[] = [
  ...TEXT_FORMAT_TOOL_METADATA,
  ...BLOCK_INSERT_TOOL_METADATA,
  ...VISUAL_INSERT_TOOL_METADATA,
];
