/**
 * Pure helpers that convert between the deck's rich-text {@link TextRun} model
 * and the HTML used inside `contentEditable` editors.
 *
 * Shared by the slide inspector's `RichTextBox` and the on-stage inline editor
 * so both serialize formatting identically (bold / italic / code / color /
 * links + line breaks). No React — just DOM/string transforms. The serializer
 * only ever reads element/style data the browser produced; it never injects
 * raw HTML, and `runsToHtml` escapes all text, so round-tripping is XSS-safe.
 */

import type { TextRun } from "@/lib/presentation/deck";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function normalizeCssColor(
  value: string | undefined,
): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return trimmed;
  const rgb = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!rgb) return undefined;
  const toHex = (part: string) =>
    Math.max(0, Math.min(255, Number(part)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`;
}

export function plainTextToRuns(value: string): TextRun[] {
  const runs: TextRun[] = [];
  const parts = value.split("\n");
  parts.forEach((part, index) => {
    if (part.length > 0) runs.push({ text: part });
    if (index < parts.length - 1) runs.push({ text: "\n" });
  });
  return runs.length > 0 ? runs : [{ text: "" }];
}

export function runStyle(run: TextRun): string {
  const rules: string[] = [];
  if (run.bold) rules.push("font-weight:700");
  if (run.italic) rules.push("font-style:italic");
  if (run.color) rules.push(`color:${run.color}`);
  if (run.code) {
    rules.push(
      "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
    );
    rules.push("background-color:rgba(127,127,127,0.18)");
  }
  return rules.join(";");
}

export function runsToHtml(
  runs: readonly TextRun[] | undefined,
  fallback: string,
): string {
  const source = runs && runs.length > 0 ? runs : plainTextToRuns(fallback);
  const html = source
    .map((run) => {
      if (run.text === "\n") return "<br>";
      const body = escapeHtml(run.text).replace(/\n/g, "<br>");
      const style = runStyle(run);
      return style ? `<span style="${style}">${body}</span>` : body;
    })
    .join("");
  return html.length > 0 ? html : "<br>";
}

function sameRunStyle(a: TextRun, b: TextRun): boolean {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.code === b.code &&
    a.color === b.color &&
    a.link === b.link
  );
}

export function mergeRuns(runs: TextRun[]): TextRun[] {
  const merged: TextRun[] = [];
  for (const run of runs) {
    if (run.text.length === 0) continue;
    const last = merged[merged.length - 1];
    if (last && sameRunStyle(last, run)) {
      last.text += run.text;
    } else {
      merged.push({ ...run });
    }
  }
  return merged;
}

function appendRun(
  runs: TextRun[],
  text: string,
  style: Omit<TextRun, "text">,
) {
  if (text.length === 0) return;
  runs.push({ text, ...style });
}

function appendNewline(runs: TextRun[]) {
  const last = runs[runs.length - 1];
  if (!last || last.text.endsWith("\n")) return;
  runs.push({ text: "\n" });
}

function isBlockBoundary(tag: string): boolean {
  return tag === "div" || tag === "p" || tag === "li";
}

export function serializeRichText(root: HTMLElement): {
  text: string;
  runs: TextRun[];
} {
  const runs: TextRun[] = [];

  function visit(node: Node, style: Omit<TextRun, "text">) {
    if (node.nodeType === Node.TEXT_NODE) {
      appendRun(runs, node.textContent?.replace(/\u00a0/g, " ") ?? "", style);
      return;
    }
    if (!(node instanceof HTMLElement)) return;

    const tag = node.tagName.toLowerCase();
    if (tag === "br") {
      runs.push({ text: "\n" });
      return;
    }

    const isBlock = node !== root && isBlockBoundary(tag);
    if (isBlock) {
      appendNewline(runs);
    }

    const next: Omit<TextRun, "text"> = { ...style };
    if (tag === "b" || tag === "strong") next.bold = true;
    if (tag === "i" || tag === "em") next.italic = true;
    if (tag === "code") next.code = true;
    if (tag === "a") next.link = node.getAttribute("href") ?? undefined;

    const fontWeight = node.style.fontWeight;
    if (fontWeight === "bold" || Number(fontWeight) >= 600) next.bold = true;
    if (node.style.fontStyle === "italic") next.italic = true;
    const color = normalizeCssColor(
      node.style.color || node.getAttribute("color") || undefined,
    );
    if (color) next.color = color;

    node.childNodes.forEach((child) => visit(child, next));
    if (isBlock) {
      appendNewline(runs);
    }
  }

  root.childNodes.forEach((node) => visit(node, {}));
  while (runs.length > 0 && runs[runs.length - 1].text === "\n") {
    runs.pop();
  }
  const merged = mergeRuns(runs);
  return { text: merged.map((run) => run.text).join(""), runs: merged };
}

export function shouldStoreRuns(runs: readonly TextRun[]): boolean {
  return runs.some(
    (run) =>
      run.text.includes("\n") ||
      run.bold ||
      run.italic ||
      run.code ||
      run.color ||
      run.link,
  );
}

export function bulletsToRuns(
  bullets: readonly string[],
  bulletRuns?: TextRun[][],
): TextRun[] {
  const runs: TextRun[] = [];
  bullets.forEach((bullet, index) => {
    const rich = bulletRuns?.[index];
    if (rich && rich.length > 0) runs.push(...rich);
    else if (bullet.length > 0) runs.push({ text: bullet });
    if (index < bullets.length - 1) runs.push({ text: "\n" });
  });
  return runs;
}

export function splitRunsIntoLines(
  runs: readonly TextRun[],
): { text: string; runs: TextRun[] }[] {
  const lines: { text: string; runs: TextRun[] }[] = [{ text: "", runs: [] }];
  for (const run of runs) {
    const parts = run.text.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) lines.push({ text: "", runs: [] });
      if (part.length === 0) return;
      const nextRun = { ...run, text: part };
      lines[lines.length - 1].runs.push(nextRun);
      lines[lines.length - 1].text += part;
    });
  }
  return lines;
}
