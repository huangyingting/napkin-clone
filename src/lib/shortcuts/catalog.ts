/**
 * Executable registry of the application's keyboard shortcuts.
 *
 * This module is intentionally framework-free (no React/DOM imports) so it can
 * be unit-tested and reused by matchers, discoverable help, canvas help, and
 * local editor tool labels.
 */

export type ShortcutScope = "Global" | "Dashboard" | "Editor" | "Slides";

export type ShortcutSurface =
  | "app-shell"
  | "dashboard"
  | "document-editor"
  | "text-toolbar"
  | "slide-canvas"
  | "presentation-runtime"
  | "present-mode";

export type ShortcutHandlerKind =
  | "global"
  | "local"
  | "browser-editor"
  | "canvas";

type ModifierRule = "required" | "forbidden" | "optional";

export type ShortcutId =
  | "global.help"
  | "dashboard.new-document"
  | "editor.toggle-preview"
  | "editor.format.bold"
  | "editor.format.italic"
  | "editor.format.underline"
  | "editor.format.inline-code"
  | "editor.align.left"
  | "editor.align.center"
  | "editor.align.right"
  | "editor.align.justify"
  | "canvas.selection.traverse"
  | "canvas.selection.focus"
  | "canvas.selection.multi-toggle"
  | "canvas.selection.select-all"
  | "canvas.selection.clear"
  | "canvas.move.step"
  | "canvas.move.large-step"
  | "canvas.resize.step"
  | "canvas.resize.large-step"
  | "canvas.rotate.step"
  | "canvas.rotate.fine-step"
  | "canvas.edit.inline"
  | "canvas.edit.delete"
  | "canvas.edit.duplicate"
  | "canvas.edit.clipboard"
  | "canvas.edit.undo"
  | "canvas.edit.redo"
  | "canvas.arrange.group"
  | "canvas.arrange.ungroup"
  | "canvas.connect.create"
  | "canvas.connect.cycle-anchor"
  | "canvas.slides.previous-next"
  | "canvas.slides.new"
  | "canvas.help"
  | "presentation.next"
  | "presentation.previous"
  | "presentation.first"
  | "presentation.last"
  | "presentation.help"
  | "presentation.exit"
  | "presentation.fullscreen"
  | "presentation.notes"
  | "presentation.overview"
  | "presentation.timer"
  | "presentation.laser";

export type KeyMatcherMetadata = {
  /** `event.key` values accepted by this shortcut. */
  key: string | readonly string[];
  /** Defaults to `true`, preserving current lowercase/uppercase matching. */
  caseInsensitive?: boolean;
  ctrlKey?: ModifierRule;
  metaKey?: ModifierRule;
  altKey?: ModifierRule;
  shiftKey?: ModifierRule;
  /** Requires Ctrl or Meta while preserving current behavior that allows both. */
  primaryModifier?: "required" | "forbidden";
};

export type KeyEventLike = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

export type ShortcutEntry = {
  /** Stable id used by match helpers and local feature registries. */
  id: ShortcutId;
  /** Human-readable grouping for global and in-product help. */
  scope: ShortcutScope;
  /** Specific product surface where the shortcut applies. */
  surface: ShortcutSurface;
  /** Matcher metadata used by pure shortcut predicates. */
  match: KeyMatcherMetadata;
  /** Display tokens for a single chord, e.g. `["Mod", "B"]`. */
  displayTokens: readonly string[];
  /** Optional display string for multi-chord rows such as canvas help. */
  displayLabel?: string;
  /** Canonical local label source used by editor tooltips. */
  canonical?: string;
  /** What the shortcut does. */
  description: string;
  /** Whether it is handled by app-level, feature-local, browser/editor, or canvas wiring. */
  handler: ShortcutHandlerKind;
  /** Whether the shortcut is allowed to fire from text-entry targets. */
  allowInTextInput: boolean;
  /** Optional subgroup used by slide-canvas help. */
  helpGroup?: string;
  /** Hide implementation-only/local duplicates from the global shortcut dialog. */
  showInGlobalHelp?: boolean;
};

/** Ordered scopes for grouping entries in the help dialog. */
export const SHORTCUT_SCOPES: ShortcutScope[] = [
  "Global",
  "Dashboard",
  "Editor",
  "Slides",
];

const SHORTCUTS: readonly ShortcutEntry[] = [
  {
    id: "global.help",
    scope: "Global",
    surface: "app-shell",
    match: {
      key: "?",
      ctrlKey: "forbidden",
      metaKey: "forbidden",
      altKey: "forbidden",
      shiftKey: "optional",
    },
    displayTokens: ["?"],
    canonical: "?",
    description: "Show keyboard shortcuts",
    handler: "global",
    allowInTextInput: false,
  },
  {
    id: "dashboard.new-document",
    scope: "Dashboard",
    surface: "dashboard",
    match: bareKey("n"),
    displayTokens: ["N"],
    canonical: "N",
    description: "Create a new document",
    handler: "global",
    allowInTextInput: false,
  },
  {
    id: "editor.toggle-preview",
    scope: "Editor",
    surface: "document-editor",
    match: modKey("e"),
    displayTokens: ["Mod", "E"],
    canonical: "Mod+E",
    description: "Toggle Write / Preview",
    handler: "global",
    allowInTextInput: true,
  },
  textTool("editor.format.bold", "Bold", "b", "Mod+B"),
  textTool("editor.format.italic", "Italic", "i", "Mod+I"),
  textTool("editor.format.underline", "Underline", "u", "Mod+U"),
  textTool("editor.format.inline-code", "Inline code", "e", "Mod+E"),
  textTool("editor.align.left", "Align left", "l", "Mod+Shift+L", true),
  textTool("editor.align.center", "Align center", "e", "Mod+Shift+E", true),
  textTool("editor.align.right", "Align right", "r", "Mod+Shift+R", true),
  textTool("editor.align.justify", "Justify", "j", "Mod+Shift+J", true),
  canvasShortcut({
    id: "canvas.selection.traverse",
    group: "Selection",
    displayLabel: "Tab / Shift + Tab",
    tokens: ["Tab"],
    match: {
      key: "Tab",
      ctrlKey: "forbidden",
      metaKey: "forbidden",
      altKey: "forbidden",
      shiftKey: "optional",
    },
    description: "Select next / previous element",
  }),
  canvasShortcut({
    id: "canvas.selection.focus",
    group: "Selection",
    tokens: ["Space"],
    match: bareKey(" "),
    description: "Select the focused element",
  }),
  canvasShortcut({
    id: "canvas.selection.multi-toggle",
    group: "Selection",
    tokens: ["Shift", "Space"],
    match: shiftKey(" "),
    description: "Add / remove from multi-selection",
  }),
  canvasShortcut({
    id: "canvas.selection.select-all",
    group: "Selection",
    tokens: ["Mod", "A"],
    canonical: "Mod+A",
    match: modKey("a"),
    description: "Select all elements",
  }),
  canvasShortcut({
    id: "canvas.selection.clear",
    group: "Selection",
    tokens: ["Escape"],
    match: bareKey("Escape", false),
    description: "Clear selection / release canvas focus",
  }),
  canvasShortcut({
    id: "canvas.move.step",
    group: "Move & resize",
    tokens: ["Arrow"],
    match: arrowKey(),
    description: "Move selection by 1%",
  }),
  canvasShortcut({
    id: "canvas.move.large-step",
    group: "Move & resize",
    tokens: ["Shift", "Arrow"],
    match: shiftArrowKey(),
    description: "Move selection by 5%",
  }),
  canvasShortcut({
    id: "canvas.resize.step",
    group: "Move & resize",
    tokens: ["Alt", "Arrow"],
    match: altArrowKey(),
    description: "Resize selection by 1%",
  }),
  canvasShortcut({
    id: "canvas.resize.large-step",
    group: "Move & resize",
    tokens: ["Alt", "Shift", "Arrow"],
    match: altShiftArrowKey(),
    description: "Resize selection by 5%",
  }),
  canvasShortcut({
    id: "canvas.rotate.step",
    group: "Move & resize",
    displayLabel: "[ / ]",
    tokens: ["["],
    match: bracketKey(),
    description: "Rotate selection by 15°",
  }),
  canvasShortcut({
    id: "canvas.rotate.fine-step",
    group: "Move & resize",
    displayLabel: "Shift + [ / ]",
    tokens: ["Shift", "["],
    match: shiftBracketKey(),
    description: "Rotate selection by 1°",
  }),
  canvasShortcut({
    id: "canvas.edit.inline",
    group: "Edit",
    tokens: ["Enter"],
    match: bareKey("Enter", false),
    description: "Edit text / enter group",
  }),
  canvasShortcut({
    id: "canvas.edit.delete",
    group: "Edit",
    displayLabel: "Delete / Backspace",
    tokens: ["Delete"],
    match: {
      key: ["Delete", "Backspace"],
      ctrlKey: "forbidden",
      metaKey: "forbidden",
      altKey: "forbidden",
      shiftKey: "optional",
    },
    description: "Delete selection",
  }),
  canvasShortcut({
    id: "canvas.edit.duplicate",
    group: "Edit",
    tokens: ["Mod", "D"],
    canonical: "Mod+D",
    match: modKey("d"),
    description: "Duplicate selection",
  }),
  canvasShortcut({
    id: "canvas.edit.clipboard",
    group: "Edit",
    displayLabel: "Mod + C / X / V",
    tokens: ["Mod", "C"],
    match: {
      key: ["c", "x", "v"],
      caseInsensitive: true,
      primaryModifier: "required",
      altKey: "forbidden",
      shiftKey: "forbidden",
    },
    description: "Copy / cut / paste",
  }),
  canvasShortcut({
    id: "canvas.edit.undo",
    group: "Edit",
    tokens: ["Mod", "Z"],
    canonical: "Mod+Z",
    match: modKey("z"),
    description: "Undo",
  }),
  canvasShortcut({
    id: "canvas.edit.redo",
    group: "Edit",
    tokens: ["Mod", "Shift", "Z"],
    canonical: "Mod+Shift+Z",
    match: modShiftKey("z"),
    description: "Redo",
  }),
  canvasShortcut({
    id: "canvas.arrange.group",
    group: "Arrange",
    tokens: ["Mod", "G"],
    canonical: "Mod+G",
    match: modKey("g"),
    description: "Group selection",
  }),
  canvasShortcut({
    id: "canvas.arrange.ungroup",
    group: "Arrange",
    tokens: ["Mod", "Shift", "G"],
    canonical: "Mod+Shift+G",
    match: modShiftKey("g"),
    description: "Ungroup",
  }),
  canvasShortcut({
    id: "canvas.connect.create",
    group: "Connectors",
    tokens: ["C"],
    match: bareKey("c"),
    description: "Connect selected elements / start connector mode",
  }),
  canvasShortcut({
    id: "canvas.connect.cycle-anchor",
    group: "Connectors",
    displayLabel: "C / Shift + C",
    tokens: ["C"],
    match: {
      key: "c",
      caseInsensitive: true,
      ctrlKey: "forbidden",
      metaKey: "forbidden",
      altKey: "forbidden",
      shiftKey: "optional",
    },
    description: "Cycle a connector's end / start anchor",
  }),
  canvasShortcut({
    id: "canvas.slides.previous-next",
    group: "Slides",
    displayLabel: "Arrow Left / Right",
    tokens: ["ArrowLeft"],
    match: {
      key: ["ArrowLeft", "ArrowRight"],
      ctrlKey: "forbidden",
      metaKey: "forbidden",
      altKey: "forbidden",
      shiftKey: "optional",
    },
    description: "Previous / next slide (nothing selected)",
  }),
  canvasShortcut({
    id: "canvas.slides.new",
    group: "Slides",
    tokens: ["Mod", "N"],
    canonical: "Mod+N",
    match: modKey("n"),
    description: "New slide",
  }),
  canvasShortcut({
    id: "canvas.help",
    group: "Slides",
    tokens: ["?"],
    canonical: "?",
    match: {
      key: "?",
      ctrlKey: "forbidden",
      metaKey: "forbidden",
      altKey: "forbidden",
      shiftKey: "optional",
    },
    description: "Show this keyboard help",
  }),
  presentationShortcut({
    id: "presentation.next",
    surface: "presentation-runtime",
    tokens: ["→", "↓", "Space", "PgDn"],
    match: {
      key: ["ArrowRight", "ArrowDown", " ", "PageDown"],
      caseInsensitive: false,
    },
    description: "Next slide",
  }),
  presentationShortcut({
    id: "presentation.previous",
    surface: "presentation-runtime",
    tokens: ["←", "↑", "PgUp"],
    match: {
      key: ["ArrowLeft", "ArrowUp", "PageUp"],
      caseInsensitive: false,
    },
    description: "Previous slide",
  }),
  presentationShortcut({
    id: "presentation.first",
    surface: "presentation-runtime",
    tokens: ["Home"],
    match: { key: "Home", caseInsensitive: false },
    description: "First slide",
  }),
  presentationShortcut({
    id: "presentation.last",
    surface: "presentation-runtime",
    tokens: ["End"],
    match: { key: "End", caseInsensitive: false },
    description: "Last slide",
  }),
  presentationShortcut({
    id: "presentation.help",
    surface: "present-mode",
    tokens: ["?"],
    match: {
      key: "?",
      ctrlKey: "forbidden",
      metaKey: "forbidden",
      altKey: "forbidden",
      shiftKey: "optional",
    },
    description: "Toggle keyboard help",
  }),
  presentationShortcut({
    id: "presentation.exit",
    surface: "present-mode",
    tokens: ["Esc"],
    match: { key: "Escape", caseInsensitive: false },
    description: "Close overlay or exit presentation",
  }),
  presentationShortcut({
    id: "presentation.fullscreen",
    surface: "present-mode",
    tokens: ["F"],
    match: { key: "f", caseInsensitive: true },
    description: "Toggle fullscreen",
  }),
  presentationShortcut({
    id: "presentation.notes",
    surface: "present-mode",
    tokens: ["N"],
    match: { key: "n", caseInsensitive: true },
    description: "Toggle speaker notes",
  }),
  presentationShortcut({
    id: "presentation.overview",
    surface: "present-mode",
    tokens: ["O"],
    match: { key: "o", caseInsensitive: true },
    description: "Toggle slide overview",
  }),
  presentationShortcut({
    id: "presentation.timer",
    surface: "present-mode",
    tokens: ["T"],
    match: { key: "t", caseInsensitive: true },
    description: "Toggle presenter timer",
  }),
  presentationShortcut({
    id: "presentation.laser",
    surface: "present-mode",
    tokens: ["L"],
    match: { key: "l", caseInsensitive: true },
    description: "Toggle laser pointer",
  }),
];

export const SHORTCUT_REGISTRY: readonly ShortcutEntry[] = SHORTCUTS;

export const EDITOR_TEXT_TOOL_SHORTCUT_IDS = [
  "editor.format.bold",
  "editor.format.italic",
  "editor.format.underline",
  "editor.format.inline-code",
  "editor.align.left",
  "editor.align.center",
  "editor.align.right",
  "editor.align.justify",
] as const satisfies readonly ShortcutId[];

const SHORTCUT_BY_ID = new Map(SHORTCUTS.map((entry) => [entry.id, entry]));

/** Returns the shortcuts that belong to a given scope, in registry order. */
export function shortcutsForScope(scope: ShortcutScope): ShortcutEntry[] {
  return SHORTCUTS.filter(
    (entry) => entry.scope === scope && entry.showInGlobalHelp !== false,
  );
}

export function shortcutById(id: ShortcutId): ShortcutEntry {
  const entry = SHORTCUT_BY_ID.get(id);
  if (!entry) {
    throw new Error(`Unknown shortcut id: ${id}`);
  }
  return entry;
}

export function shortcutCanonical(id: ShortcutId): string | undefined {
  return shortcutById(id).canonical;
}

export function shortcutDisplayTokens(
  entry: ShortcutEntry,
  opts: { isMac?: boolean } = {},
): string[] {
  if (entry.displayLabel) {
    return [shortcutDisplayLabel(entry, opts)];
  }
  return entry.displayTokens.map((token) => formatDisplayToken(token, opts));
}

export function shortcutDisplayLabel(
  entry: ShortcutEntry,
  opts: { isMac?: boolean } = {},
): string {
  const label = entry.displayLabel ?? entry.displayTokens.join(" + ");
  return formatShortcutLabel(label, opts);
}

/**
 * Render a canonical `Mod+B` shortcut for the platform: `⌘B` on macOS,
 * `Ctrl+B` elsewhere. Returns `undefined` for tools without a shortcut.
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

export function matchesShortcut(id: ShortcutId, event: KeyEventLike): boolean {
  return matchesKey(shortcutById(id).match, event);
}

export function matchesKey(
  match: KeyMatcherMetadata,
  event: KeyEventLike,
): boolean {
  const expectedKeys = Array.isArray(match.key) ? match.key : [match.key];
  const actualKey =
    match.caseInsensitive === false ? event.key : lower(event.key);
  const keyMatched = expectedKeys.some((key) => {
    const expectedKey = match.caseInsensitive === false ? key : lower(key);
    return actualKey === expectedKey;
  });
  if (!keyMatched) {
    return false;
  }
  if (
    match.primaryModifier === "required" &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    return false;
  }
  if (
    match.primaryModifier === "forbidden" &&
    (event.ctrlKey || event.metaKey)
  ) {
    return false;
  }
  return (
    modifierMatches(match.ctrlKey, event.ctrlKey) &&
    modifierMatches(match.metaKey, event.metaKey) &&
    modifierMatches(match.altKey, event.altKey) &&
    modifierMatches(match.shiftKey, event.shiftKey)
  );
}

function lower(value: string): string {
  return value.toLocaleLowerCase("en-US");
}

function modifierMatches(
  rule: ModifierRule | undefined,
  value: boolean,
): boolean {
  switch (rule ?? "optional") {
    case "required":
      return value;
    case "forbidden":
      return !value;
    case "optional":
      return true;
  }
}

function bareKey(key: string, caseInsensitive = true): KeyMatcherMetadata {
  return {
    key,
    caseInsensitive,
    ctrlKey: "forbidden",
    metaKey: "forbidden",
    altKey: "forbidden",
    shiftKey: "forbidden",
  };
}

function shiftKey(key: string): KeyMatcherMetadata {
  return {
    key,
    ctrlKey: "forbidden",
    metaKey: "forbidden",
    altKey: "forbidden",
    shiftKey: "required",
  };
}

function modKey(key: string): KeyMatcherMetadata {
  return {
    key,
    caseInsensitive: true,
    primaryModifier: "required",
    altKey: "forbidden",
    shiftKey: "forbidden",
  };
}

function modShiftKey(key: string): KeyMatcherMetadata {
  return {
    key,
    caseInsensitive: true,
    primaryModifier: "required",
    altKey: "forbidden",
    shiftKey: "required",
  };
}

function arrowKey(): KeyMatcherMetadata {
  return {
    key: ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"],
    caseInsensitive: false,
    ctrlKey: "forbidden",
    metaKey: "forbidden",
    altKey: "forbidden",
    shiftKey: "forbidden",
  };
}

function shiftArrowKey(): KeyMatcherMetadata {
  return { ...arrowKey(), shiftKey: "required" };
}

function altArrowKey(): KeyMatcherMetadata {
  return { ...arrowKey(), altKey: "required" };
}

function altShiftArrowKey(): KeyMatcherMetadata {
  return { ...arrowKey(), altKey: "required", shiftKey: "required" };
}

function bracketKey(): KeyMatcherMetadata {
  return {
    key: ["[", "]"],
    caseInsensitive: false,
    ctrlKey: "forbidden",
    metaKey: "forbidden",
    altKey: "forbidden",
    shiftKey: "forbidden",
  };
}

function shiftBracketKey(): KeyMatcherMetadata {
  return { ...bracketKey(), key: ["{", "}"], shiftKey: "required" };
}

function textTool(
  id: ShortcutId,
  description: string,
  key: string,
  canonical: string,
  shift = false,
): ShortcutEntry {
  return {
    id,
    scope: "Editor",
    surface: "text-toolbar",
    match: shift ? modShiftKey(key) : modKey(key),
    displayTokens: canonical.split("+"),
    canonical,
    description,
    handler: "browser-editor",
    allowInTextInput: true,
  };
}

function canvasShortcut(args: {
  id: ShortcutId;
  group: string;
  tokens: readonly string[];
  match: KeyMatcherMetadata;
  description: string;
  displayLabel?: string;
  canonical?: string;
}): ShortcutEntry {
  return {
    id: args.id,
    scope: "Slides",
    surface: "slide-canvas",
    match: args.match,
    displayTokens: args.tokens,
    displayLabel: args.displayLabel,
    canonical: args.canonical,
    description: args.description,
    handler: "canvas",
    allowInTextInput: false,
    helpGroup: args.group,
  };
}

function presentationShortcut(args: {
  id: ShortcutId;
  surface: "presentation-runtime" | "present-mode";
  tokens: readonly string[];
  match: KeyMatcherMetadata;
  description: string;
  displayLabel?: string;
}): ShortcutEntry {
  return {
    id: args.id,
    scope: "Slides",
    surface: args.surface,
    match: args.match,
    displayTokens: args.tokens,
    displayLabel: args.displayLabel,
    description: args.description,
    handler: "local",
    allowInTextInput: false,
    showInGlobalHelp: false,
  };
}

function formatDisplayToken(
  token: string,
  opts: { isMac?: boolean } = {},
): string {
  if (token === "Mod") {
    if (opts.isMac === true) return "⌘";
    if (opts.isMac === false) return "Ctrl";
    return "Ctrl/⌘";
  }
  if (token === "Shift" && opts.isMac === true) return "⇧";
  return token;
}

function formatShortcutLabel(
  label: string,
  opts: { isMac?: boolean } = {},
): string {
  return label.replace(/\bMod\b/g, formatDisplayToken("Mod", opts));
}
