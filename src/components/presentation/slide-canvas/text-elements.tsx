"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type RefObject,
} from "react";

import type {
  BulletItem,
  BulletsElement,
  TextElement,
  TextFitMode,
} from "@/lib/presentation/deck";
import { normalizeBulletItems } from "@/lib/presentation/deck";
import type { DeckThemeTokenSet } from "@/lib/presentation/deck-theme-tokens";
import { resolveRoleToken } from "@/lib/presentation/deck-theme-tokens";
import type { SlideThemeColors } from "@/lib/presentation/style-cascade";

import { boxStyle, renderRuns } from "./primitives";

/**
 * Computes a CSS `font-size` string that shrinks the font until the content
 * fits within the container when `fitMode === "shrink-to-fit"`.
 *
 * Uses the "adjust state during render" pattern (React docs) to reset the
 * scale on config changes — this avoids `setState` inside an effect body and
 * satisfies the `react-hooks/set-state-in-effect` lint rule.
 *
 * The measurement loop runs whenever `scale` or `enabled` changes and
 * converges in ≤ 3 renders: reducing the font always reduces `scrollHeight`,
 * and the `Math.abs` guard prevents spurious updates once settled.
 */
function useShrinkFontSizeCss(
  containerRef: RefObject<HTMLElement | null>,
  baseFontSize: number,
  fitMode: TextFitMode | undefined,
): string {
  const enabled = fitMode === "shrink-to-fit";
  const configKey = `${baseFontSize}:${fitMode ?? ""}`;
  const [sizing, setSizing] = useState({ key: configKey, scale: 1 });
  const scale = sizing.key === configKey ? sizing.scale : 1;

  if (sizing.key !== configKey) {
    setSizing({ key: configKey, scale: 1 });
  }

  useLayoutEffect(() => {
    if (!enabled) return;
    const node = containerRef.current;
    if (!node) return;
    const overflows =
      node.scrollHeight > node.clientHeight + 1 ||
      node.scrollWidth > node.clientWidth + 1;
    if (!overflows || scale <= 0.55) return;
    const nextScale = Math.max(0.55, scale * 0.88);
    setSizing((current) =>
      current.key === configKey && Math.abs(current.scale - nextScale) > 0.001
        ? { ...current, scale: nextScale }
        : current,
    );
  }, [configKey, containerRef, enabled, scale]);

  return `${baseFontSize * (enabled ? scale : 1)}cqh`;
}

export function TextElementView({
  element,
  tc,
  tokenSet,
}: {
  element: TextElement;
  tc: SlideThemeColors;
  tokenSet: DeckThemeTokenSet;
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const fontSizeCss = useShrinkFontSizeCss(
    containerRef,
    element.style.fontSize,
    element.fitMode,
  );
  // Resolve color + font from the element's semantic role token so a deck-level
  // template change propagates to inherited text (#609/#615). A local override
  // (element.style.color / .fontFamily) still wins. For built-in themes every
  // role resolves to onBg / the theme font, so existing decks are unchanged.
  const roleToken = resolveRoleToken(
    tokenSet,
    element.textRole ?? (element.role === "title" ? "h1" : "body"),
  );
  void tc;
  const color = element.style.color ?? roleToken.color;
  const roleFontFamily = element.style.fontFamily ?? roleToken.fontFamily;
  const hasRuns = element.runs !== undefined && element.runs.length > 0;
  return (
    <div
      ref={containerRef}
      style={{
        ...boxStyle(element),
        display: "flex",
        flexDirection: "column",
        justifyContent:
          element.style.verticalAlign === "top"
            ? "flex-start"
            : element.style.verticalAlign === "bottom"
              ? "flex-end"
              : "center",
        textAlign: element.style.align,
        color,
        fontSize: fontSizeCss,
        fontWeight: element.style.bold ? 700 : 400,
        fontStyle: element.style.italic ? "italic" : "normal",
        ...(element.style.underline ? { textDecoration: "underline" } : {}),
        ...(roleFontFamily ? { fontFamily: roleFontFamily } : {}),
        lineHeight: element.style.lineHeight ?? 1.15,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: "100%",
          whiteSpace: "pre-wrap",
          overflowWrap: "break-word",
          wordBreak: "normal",
          ...(element.style.paragraphSpacing
            ? { marginBottom: `${element.style.paragraphSpacing}cqh` }
            : {}),
        }}
      >
        {hasRuns ? renderRuns(element.runs!) : element.text || "\u00a0"}
      </div>
    </div>
  );
}

export function BulletsElementView({
  element,
  tc,
  accent,
  tokenSet,
}: {
  element: BulletsElement;
  tc: SlideThemeColors;
  accent: string;
  tokenSet: DeckThemeTokenSet;
}): JSX.Element {
  const containerRef = useRef<HTMLUListElement>(null);
  const fontSizeCss = useShrinkFontSizeCss(
    containerRef,
    element.style.fontSize,
    element.fitMode,
  );
  // Resolve color from the bullet role token so deck-template edits propagate
  // (#609/#615); a local override still wins. Built-in themes resolve to onBg.
  const roleToken = resolveRoleToken(tokenSet, element.textRole ?? "bullet");
  void tc;
  const color = element.style.color ?? roleToken.color;

  // Resolve the authoritative item list.
  const items = normalizeBulletItems(element);

  // Pre-compute numbering: track a per-indent counter; reset when a non-number
  // item appears at the same indent (or any indent ≤ current item's indent).
  const numbers: (number | null)[] = [];
  const counters = new Array(6).fill(0) as number[];
  for (const item of items) {
    const indent = item.indent ?? 0;
    const listType = item.listType ?? "bullet";
    if (listType === "number") {
      // Reset counters for deeper levels before incrementing this one.
      for (let d = indent + 1; d < 6; d++) counters[d] = 0;
      counters[indent]++;
      numbers.push(counters[indent]);
    } else {
      // A bullet item resets the number counter at this depth and below.
      for (let d = indent; d < 6; d++) counters[d] = 0;
      numbers.push(null);
    }
  }

  /** Bullet marker for a given indent level (bullet type). */
  function bulletMarker(indent: number): string {
    if (indent === 0) return "•";
    if (indent === 1) return "◦";
    return "–";
  }

  return (
    <ul
      ref={containerRef}
      style={{
        ...boxStyle(element),
        display: "flex",
        flexDirection: "column",
        justifyContent:
          element.style.verticalAlign === "top"
            ? "flex-start"
            : element.style.verticalAlign === "bottom"
              ? "flex-end"
              : "center",
        gap: element.bulletGap ? `${element.bulletGap}cqh` : "0.6em",
        color,
        fontSize: fontSizeCss,
        fontWeight: element.style.bold ? 700 : 400,
        fontStyle: element.style.italic ? "italic" : "normal",
        ...(element.style.underline ? { textDecoration: "underline" } : {}),
        ...(element.style.fontFamily
          ? { fontFamily: element.style.fontFamily }
          : {}),
        textAlign: element.style.align,
        lineHeight: element.style.lineHeight ?? 1.2,
        overflow: "hidden",
        margin: 0,
        padding: 0,
        listStyle: "none",
        ...(element.bulletIndent
          ? { paddingLeft: `${element.bulletIndent}cqw` }
          : {}),
      }}
    >
      {items.map((item: BulletItem, i: number) => {
        const indent = item.indent ?? 0;
        const listType = item.listType ?? "bullet";
        const num = numbers[i];
        const runs = item.runs;
        const indentEm = indent * 1.5;
        return (
          <li
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.5em",
              paddingLeft: indentEm > 0 ? `${indentEm}em` : undefined,
            }}
          >
            {listType === "number" ? (
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  color: accent,
                  minWidth: "1.2em",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {num}.
              </span>
            ) : (
              <span
                aria-hidden="true"
                style={
                  indent === 0
                    ? {
                        marginTop: "0.45em",
                        height: "0.35em",
                        width: "0.35em",
                        flexShrink: 0,
                        borderRadius: "9999px",
                        backgroundColor: accent,
                      }
                    : {
                        flexShrink: 0,
                        color: accent,
                        minWidth: "0.8em",
                        lineHeight: 1,
                      }
                }
              >
                {indent === 0 ? null : bulletMarker(indent)}
              </span>
            )}
            <span
              style={{
                minWidth: 0,
                overflowWrap: "break-word",
                wordBreak: "normal",
              }}
            >
              {runs && runs.length > 0 ? renderRuns(runs) : item.text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
