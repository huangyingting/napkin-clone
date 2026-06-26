import type { ShortcutEntry } from "./catalog-types";

function presentationShortcut(args: {
  id: ShortcutEntry["id"];
  surface: "presentation-runtime" | "present-mode";
  tokens: readonly string[];
  match: ShortcutEntry["match"];
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

export const PRESENTATION_SHORTCUTS: readonly ShortcutEntry[] = [
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
