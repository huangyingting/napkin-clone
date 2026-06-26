import type { KeyMatcherMetadata, ModifierRule } from "./catalog-types";

export function lower(value: string): string {
  return value.toLocaleLowerCase("en-US");
}

export function modifierMatches(
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

export function bareKey(
  key: string,
  caseInsensitive = true,
): KeyMatcherMetadata {
  return {
    key,
    caseInsensitive,
    ctrlKey: "forbidden",
    metaKey: "forbidden",
    altKey: "forbidden",
    shiftKey: "forbidden",
  };
}

export function shiftKey(key: string): KeyMatcherMetadata {
  return {
    key,
    ctrlKey: "forbidden",
    metaKey: "forbidden",
    altKey: "forbidden",
    shiftKey: "required",
  };
}

export function modKey(key: string): KeyMatcherMetadata {
  return {
    key,
    caseInsensitive: true,
    primaryModifier: "required",
    altKey: "forbidden",
    shiftKey: "forbidden",
  };
}

export function modShiftKey(key: string): KeyMatcherMetadata {
  return {
    key,
    caseInsensitive: true,
    primaryModifier: "required",
    altKey: "forbidden",
    shiftKey: "required",
  };
}

export function arrowKey(): KeyMatcherMetadata {
  return {
    key: ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"],
    caseInsensitive: false,
    ctrlKey: "forbidden",
    metaKey: "forbidden",
    altKey: "forbidden",
    shiftKey: "forbidden",
  };
}

export function shiftArrowKey(): KeyMatcherMetadata {
  return { ...arrowKey(), shiftKey: "required" };
}

export function altArrowKey(): KeyMatcherMetadata {
  return { ...arrowKey(), altKey: "required" };
}

export function altShiftArrowKey(): KeyMatcherMetadata {
  return { ...arrowKey(), altKey: "required", shiftKey: "required" };
}

export function bracketKey(): KeyMatcherMetadata {
  return {
    key: ["[", "]"],
    caseInsensitive: false,
    ctrlKey: "forbidden",
    metaKey: "forbidden",
    altKey: "forbidden",
    shiftKey: "forbidden",
  };
}

export function shiftBracketKey(): KeyMatcherMetadata {
  return { ...bracketKey(), key: ["{", "}"], shiftKey: "required" };
}

export function formatDisplayToken(
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

export function formatShortcutLabel(
  label: string,
  opts: { isMac?: boolean } = {},
): string {
  return label.replace(/\bMod\b/g, formatDisplayToken("Mod", opts));
}
