"use client";

/**
 * Shared slide rendering primitives used by both the in-app {@link PresentMode}
 * and the public {@link PublicPresentViewer}.
 *
 * Exported from this module so that the two presentation surfaces can stay in
 * sync without duplicating layout code.
 */

import { memo, useLayoutEffect, useRef, useState, type JSX } from "react";

import type {
  BulletItem,
  BulletsElement,
  ConnectorElement,
  DeckTheme,
  ImageElement,
  ShapeElement,
  Slide,
  SlideElement,
  TextElement,
  TextFitMode,
  TextRun,
  VisualElement,
} from "@/lib/presentation/deck";
import { normalizeBulletItems } from "@/lib/presentation/deck";
import {
  resolveConnectorElementPoints,
  resolveConnectorEndpoint,
} from "@/lib/presentation/connector-geometry";
import { SLIDE_TEXT_FONT_SIZE } from "@/lib/presentation/text-defaults";
import type { Visual } from "@/lib/visual/schema";
import { applyTheme } from "@/lib/visual/transforms";
import { isEmptyImageSrc } from "@/lib/presentation/image-element";
import { VisualRenderer } from "@/components/visual/visual-renderer";

// ---------------------------------------------------------------------------
// Theme configuration
// ---------------------------------------------------------------------------

export type ThemeConfig = {
  accentColor: string;
  bgColor: string;
  titleColor: string;
  bodyColor: string;
  mutedColor: string;
};

export const DECK_THEMES: Record<DeckTheme, ThemeConfig> = {
  indigo: {
    accentColor: "#818cf8",
    bgColor: "#1e1b4b",
    titleColor: "#e0e7ff",
    bodyColor: "#c7d2fe",
    mutedColor: "#a5b4fc",
  },
  ocean: {
    accentColor: "#38bdf8",
    bgColor: "#0c1a2e",
    titleColor: "#e0f2fe",
    bodyColor: "#bae6fd",
    mutedColor: "#7dd3fc",
  },
  forest: {
    accentColor: "#4ade80",
    bgColor: "#052e16",
    titleColor: "#dcfce7",
    bodyColor: "#bbf7d0",
    mutedColor: "#86efac",
  },
  sunset: {
    accentColor: "#fb923c",
    bgColor: "#431407",
    titleColor: "#ffedd5",
    bodyColor: "#fed7aa",
    mutedColor: "#fdba74",
  },
  grape: {
    accentColor: "#c084fc",
    bgColor: "#2e1065",
    titleColor: "#f3e8ff",
    bodyColor: "#e9d5ff",
    mutedColor: "#d8b4fe",
  },
  default: {
    accentColor: "#a1a1aa",
    bgColor: "#09090b",
    titleColor: "#fafafa",
    bodyColor: "#d4d4d8",
    mutedColor: "#a1a1aa",
  },
};

// ---------------------------------------------------------------------------
// Slide layout components
// ---------------------------------------------------------------------------

interface SlideProps {
  slide: Slide;
  tc: ThemeConfig;
  visuals: ReadonlyMap<string, Visual>;
  /** True when this slide is rendered at reduced size (presenter preview). */
  preview?: boolean;
}

function TitleSlideLayout({ slide, tc, preview }: SlideProps): JSX.Element {
  const titleSize = preview
    ? "text-xl font-bold"
    : "text-4xl font-bold sm:text-5xl lg:text-6xl";
  const bulletSize = preview ? "text-xs" : "text-lg sm:text-xl";

  return (
    <div
      className="flex h-full flex-col items-center justify-center px-12 py-16 text-center"
      style={{ backgroundColor: tc.bgColor }}
    >
      <h1
        className={`${titleSize} leading-tight tracking-tight`}
        style={{ color: tc.titleColor }}
      >
        {slide.title || "Untitled"}
      </h1>
      {slide.bullets.length > 0 && (
        <p
          className={`mt-4 ${bulletSize} max-w-2xl`}
          style={{ color: tc.mutedColor }}
        >
          {slide.bullets[0]}
        </p>
      )}
      {!preview && (
        <div
          className="mt-8 h-1 w-16 rounded-full"
          style={{ backgroundColor: tc.accentColor }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

function SectionSlideLayout({ slide, tc, preview }: SlideProps): JSX.Element {
  const labelSize = preview
    ? "text-[9px] uppercase tracking-widest"
    : "text-xs uppercase tracking-[0.2em] sm:text-sm";
  const titleSize = preview
    ? "text-base font-semibold"
    : "text-3xl font-semibold sm:text-4xl lg:text-5xl";

  return (
    <div
      className={`flex h-full flex-col items-center justify-center px-12 py-16 text-center${!preview ? " pt-14" : ""}`}
      style={{ backgroundColor: tc.bgColor }}
    >
      <p
        className={`mb-4 font-medium ${labelSize}`}
        style={{ color: tc.accentColor }}
      >
        Section
      </p>
      <h2
        className={`${titleSize} leading-tight tracking-tight`}
        style={{ color: tc.titleColor }}
      >
        {slide.title || "Untitled"}
      </h2>
    </div>
  );
}

function ContentSlideLayout({
  slide,
  tc,
  visuals,
  preview,
}: SlideProps): JSX.Element {
  const hasVisual = slide.visualIds.length > 0;
  const visual = hasVisual ? visuals.get(slide.visualIds[0]) : undefined;

  const titleSize = preview
    ? "text-sm font-semibold"
    : "text-2xl font-semibold sm:text-3xl";
  const bulletSize = preview ? "text-[9px]" : "text-base sm:text-lg";

  return (
    <div
      className={`flex h-full flex-col${!preview ? " pt-14" : ""}`}
      style={{ backgroundColor: tc.bgColor }}
    >
      {/* Title bar */}
      <div
        className="border-b px-10 py-5"
        style={{ borderColor: tc.accentColor + "30" }}
      >
        <h2
          className={`${titleSize} leading-tight tracking-tight`}
          style={{ color: tc.titleColor }}
        >
          {slide.title}
        </h2>
      </div>

      {/* Content area */}
      <div
        className={`flex min-h-0 flex-1 ${hasVisual && visual ? "gap-6" : ""} overflow-hidden p-10`}
      >
        {/* Bullets */}
        {slide.bullets.length > 0 && (
          <ul className="min-w-0 flex-1 space-y-3">
            {slide.bullets.map((bullet, i) => (
              <li
                key={i}
                className={`flex items-start gap-3 ${bulletSize}`}
                style={{ color: tc.bodyColor }}
              >
                <span
                  className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: tc.accentColor }}
                  aria-hidden="true"
                />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Visual */}
        {hasVisual && visual && (
          <div
            className={`flex min-w-0 items-center justify-center ${slide.bullets.length > 0 ? "w-[45%] flex-shrink-0" : "w-full"}`}
          >
            <VisualRenderer
              visual={visual}
              className="h-auto max-h-full w-full object-contain"
              transparentBackground
            />
          </div>
        )}
      </div>
    </div>
  );
}

function MediaSlideLayout({
  slide,
  tc,
  visuals,
  preview,
}: SlideProps): JSX.Element {
  const hasVisual = slide.visualIds.length > 0;
  const visual = hasVisual ? visuals.get(slide.visualIds[0]) : undefined;

  const titleSize = preview
    ? "text-[10px] font-medium"
    : "text-lg font-medium sm:text-xl";

  return (
    <div
      className="flex h-full flex-col items-center justify-center p-8"
      style={{ backgroundColor: tc.bgColor }}
    >
      {slide.title && (
        <p className={`mb-4 ${titleSize}`} style={{ color: tc.mutedColor }}>
          {slide.title}
        </p>
      )}
      {hasVisual && visual ? (
        <div className="flex min-h-0 flex-1 w-full items-center justify-center overflow-hidden">
          <VisualRenderer
            visual={visual}
            className="h-auto max-h-full w-full max-w-4xl object-contain"
            transparentBackground
          />
        </div>
      ) : (
        <div className="text-sm opacity-40" style={{ color: tc.bodyColor }}>
          (no visual)
        </div>
      )}
    </div>
  );
}

function BlankSlideLayout({ slide, tc, preview }: SlideProps): JSX.Element {
  return (
    <div
      className={`flex h-full flex-col items-center justify-center px-12${!preview ? " pt-14" : ""}`}
      style={{ backgroundColor: tc.bgColor }}
    >
      {slide.title && (
        <h2
          className="text-2xl font-semibold sm:text-3xl"
          style={{ color: tc.titleColor }}
        >
          {slide.title}
        </h2>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Free-form element rendering (shared by editor, present, and public viewer)
// ---------------------------------------------------------------------------

function boxStyle(element: SlideElement): React.CSSProperties {
  return {
    position: "absolute",
    left: `${element.box.x}%`,
    top: `${element.box.y}%`,
    width: `${element.box.w}%`,
    height: `${element.box.h}%`,
    zIndex: element.zIndex,
    ...(element.opacity !== undefined && element.opacity < 1
      ? { opacity: element.opacity }
      : {}),
    ...(element.rotation
      ? { transform: `rotate(${element.rotation}deg)` }
      : {}),
    ...(element.shadow
      ? { filter: "drop-shadow(0 0.6cqmin 1.2cqmin rgba(0,0,0,0.28))" }
      : {}),
  };
}

/**
 * Renders rich-text {@link TextRun}s as inline spans, applying per-run
 * bold/italic/code/color/link styling. Line-break runs (`text === "\n"`) become
 * `<br>` so multi-line emphasis survives. Used by the text and bullets views
 * when an element carries `runs`; callers fall back to the plain string when it
 * does not.
 */
function renderRuns(runs: TextRun[]): JSX.Element[] {
  return runs.map((run, i) => {
    if (run.text === "\n") return <br key={i} />;
    const style: React.CSSProperties = {};
    if (run.bold) style.fontWeight = 700;
    if (run.italic) style.fontStyle = "italic";
    if (run.color) style.color = run.color;
    if (run.code) {
      style.fontFamily =
        "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      style.backgroundColor = "rgba(127, 127, 127, 0.18)";
      style.padding = "0 0.2em";
      style.borderRadius = "0.2em";
    }
    if (run.link) {
      return (
        <a
          key={i}
          href={run.link}
          target="_blank"
          rel="noreferrer"
          style={{ ...style, textDecoration: "underline", color: run.color }}
        >
          {run.text}
        </a>
      );
    }
    return (
      <span key={i} style={style}>
        {run.text}
      </span>
    );
  });
}

function contrastTextColor(hex: string): string {
  const raw = hex.replace("#", "");
  const expanded =
    raw.length === 3
      ? raw
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : raw;
  if (expanded.length < 6) return "#ffffff";
  const r = Number.parseInt(expanded.slice(0, 2), 16) / 255;
  const g = Number.parseInt(expanded.slice(2, 4), 16) / 255;
  const b = Number.parseInt(expanded.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.58 ? "#18181b" : "#ffffff";
}

function ShapeText({ element }: { element: ShapeElement }): JSX.Element | null {
  const text = element.text?.trim();
  if (!text || element.shape === "line") return null;
  const style = element.textStyle ?? {
    fontSize: SLIDE_TEXT_FONT_SIZE.text,
    bold: false,
    italic: false,
    align: "center" as const,
  };
  const color = style.color ?? contrastTextColor(element.color);
  return (
    <div
      style={{
        position: "absolute",
        inset: "8%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color,
        fontSize: `${style.fontSize}cqh`,
        fontWeight: style.bold ? 700 : 400,
        fontStyle: style.italic ? "italic" : "normal",
        ...(style.underline ? { textDecoration: "underline" } : {}),
        ...(style.fontFamily ? { fontFamily: style.fontFamily } : {}),
        textAlign: style.align,
        lineHeight: 1.15,
        whiteSpace: "pre-wrap",
        overflow: "hidden",
        overflowWrap: "break-word",
        wordBreak: "normal",
        pointerEvents: "none",
      }}
    >
      <div style={{ width: "100%" }}>
        {element.textRuns && element.textRuns.length > 0
          ? renderRuns(element.textRuns)
          : element.text}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shrink-to-fit hook
// ---------------------------------------------------------------------------

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
  containerRef: React.RefObject<HTMLElement | null>,
  baseFontSizePct: number,
  fitMode: TextFitMode | undefined,
): string {
  const enabled = fitMode === "shrink-to-fit";
  const [scale, setScale] = useState(1);

  // "Adjust state during render" — reset scale without a setState-in-effect.
  const [prevBaseFontSizePct, setPrevBaseFontSizePct] =
    useState(baseFontSizePct);
  const [prevFitMode, setPrevFitMode] = useState(fitMode);
  if (baseFontSizePct !== prevBaseFontSizePct || fitMode !== prevFitMode) {
    setPrevBaseFontSizePct(baseFontSizePct);
    setPrevFitMode(fitMode);
    if (scale !== 1) setScale(1);
  }

  // Measurement loop — re-runs whenever scale or mode changes, then settles.
  useLayoutEffect(() => {
    if (!enabled || !containerRef.current) return;
    const el = containerRef.current;
    const containerH = el.clientHeight;
    const contentH = el.scrollHeight;
    if (contentH > containerH && containerH > 0) {
      const newScale = Math.max(0.1, (containerH / contentH) * scale);
      if (Math.abs(newScale - scale) > 0.001) {
        setScale(newScale);
      }
    }
    // containerRef.current is intentionally excluded — ref objects are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, scale]);

  return `${baseFontSizePct * (enabled ? scale : 1)}cqh`;
}

function TextElementView({
  element,
  tc,
  accent,
}: {
  element: TextElement;
  tc: ThemeConfig;
  accent: string;
}): JSX.Element {
  void accent;
  const containerRef = useRef<HTMLDivElement>(null);
  const fontSizeCss = useShrinkFontSizeCss(
    containerRef,
    element.style.fontSize,
    element.fitMode,
  );
  const color =
    element.style.color ??
    (element.role === "title" ? tc.titleColor : tc.bodyColor);
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
        ...(element.style.fontFamily
          ? { fontFamily: element.style.fontFamily }
          : {}),
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

function BulletsElementView({
  element,
  tc,
  accent,
}: {
  element: BulletsElement;
  tc: ThemeConfig;
  accent: string;
}): JSX.Element {
  const containerRef = useRef<HTMLUListElement>(null);
  const fontSizeCss = useShrinkFontSizeCss(
    containerRef,
    element.style.fontSize,
    element.fitMode,
  );
  const color = element.style.color ?? tc.bodyColor;

  // Resolve authoritative item list (normalises legacy flat bullets on the fly)
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

function VisualElementView({
  element,
  visuals,
}: {
  element: VisualElement;
  visuals: ReadonlyMap<string, Visual>;
}): JSX.Element | null {
  const visual = visuals.get(element.visualId);
  if (!visual) {
    return null;
  }
  // Apply the optional per-element restyle here, in the one shared renderer, so
  // editor / present / public viewer all draw the visual identically.
  const styled = element.styleThemeId
    ? applyTheme(visual, element.styleThemeId)
    : visual;
  return (
    <div
      style={{
        ...boxStyle(element),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <VisualRenderer
        visual={styled}
        title={element.alt}
        className="h-full w-full object-contain"
        transparentBackground
      />
    </div>
  );
}

function ImageElementView({
  element,
  editable = false,
}: {
  element: ImageElement;
  /**
   * True only on the editing stage. Controls how an empty-source image renders:
   * editor shows an "Add image" dropzone affordance; present / public / preview
   * surfaces render a neutral box so they never show a broken image (#226).
   */
  editable?: boolean;
}): JSX.Element {
  // Never emit `<img src="">` — it shows a broken-image box and can re-request
  // the current page. Branch on the empty-source predicate instead.
  if (isEmptyImageSrc(element.src)) {
    return (
      <div
        style={{
          ...boxStyle(element),
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.5em",
          overflow: "hidden",
          ...(editable
            ? {
                color: "rgba(113, 113, 122, 0.9)",
                border: "1px dashed rgba(113, 113, 122, 0.5)",
                borderRadius: "0.5em",
                backgroundColor: "rgba(113, 113, 122, 0.06)",
                fontSize: "3.5cqh",
              }
            : {}),
        }}
      >
        {editable ? (
          <>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ height: "8cqh", width: "8cqh" }}
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
            <span>Add image</span>
          </>
        ) : null}
      </div>
    );
  }
  return (
    <div
      style={{
        ...boxStyle(element),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        ...(element.radius ? { borderRadius: `${element.radius}%` } : {}),
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={element.src}
        alt={element.alt ?? ""}
        style={{
          height: "100%",
          width: "100%",
          objectFit: element.fit ?? "contain",
        }}
      />
    </div>
  );
}

function ShapeElementView({
  element,
  elements,
}: {
  element: ShapeElement;
  elements: readonly SlideElement[];
}): JSX.Element {
  if (element.shape === "line") {
    const start = resolveConnectorEndpoint(
      element.connector?.start,
      elements,
      (candidate) => candidate.box,
    );
    const end = resolveConnectorEndpoint(
      element.connector?.end,
      elements,
      (candidate) => candidate.box,
    );
    if (start && end) {
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            inset: 0,
            height: "100%",
            width: "100%",
            overflow: "visible",
            zIndex: element.zIndex,
            ...(element.opacity !== undefined && element.opacity < 1
              ? { opacity: element.opacity }
              : {}),
          }}
        >
          <line
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            stroke={element.stroke?.color ?? element.color}
            strokeWidth={element.stroke?.width ?? 0.4}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      );
    }
    return (
      <div
        style={{
          ...boxStyle(element),
          display: "flex",
          alignItems: "center",
        }}
      >
        <div
          style={{
            height: `${element.stroke?.width ?? 0.4}cqmin`,
            width: "100%",
            backgroundColor: element.stroke?.color ?? element.color,
          }}
        />
      </div>
    );
  }
  if (element.shape === "triangle") {
    return (
      <div
        style={{
          ...boxStyle(element),
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: element.color,
            clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
          }}
        />
        <ShapeText element={element} />
      </div>
    );
  }
  return (
    <div
      style={{
        ...boxStyle(element),
        overflow: "hidden",
        backgroundColor: element.color,
        borderRadius:
          element.shape === "ellipse"
            ? "9999px"
            : element.radius !== undefined
              ? `${element.radius}%`
              : "0.25rem",
        ...(element.stroke
          ? {
              border: `${element.stroke.width}cqmin solid ${element.stroke.color}`,
            }
          : {}),
      }}
    >
      <ShapeText element={element} />
    </div>
  );
}

function ConnectorElementView({
  element,
  elements,
}: {
  element: ConnectorElement;
  elements: readonly SlideElement[];
}): JSX.Element {
  const { start, end } = resolveConnectorElementPoints(
    element,
    elements,
    (el) => el.box,
  );
  const strokeColor = element.stroke?.color ?? "#a1a1aa";
  const strokeWidth = element.stroke?.width ?? 0.4;
  const arrowEnd = element.arrowEnd ?? "arrow";
  const arrowStart = element.arrowStart ?? "none";
  const dash = element.dash ? "4 2" : undefined;
  const endMarkerId = `conn-end-${element.id}`;
  const startMarkerId = `conn-start-${element.id}`;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        inset: 0,
        height: "100%",
        width: "100%",
        overflow: "visible",
        zIndex: element.zIndex,
        ...(element.opacity !== undefined && element.opacity < 1
          ? { opacity: element.opacity }
          : {}),
      }}
    >
      <defs>
        {arrowEnd !== "none" && (
          <marker
            id={endMarkerId}
            markerWidth="8"
            markerHeight="6"
            refX="7"
            refY="3"
            orient="auto"
          >
            <polygon
              points="0 0, 8 3, 0 6"
              fill={arrowEnd === "filled" ? strokeColor : "none"}
              stroke={strokeColor}
              strokeWidth="0.8"
            />
          </marker>
        )}
        {arrowStart !== "none" && (
          <marker
            id={startMarkerId}
            markerWidth="8"
            markerHeight="6"
            refX="1"
            refY="3"
            orient="auto-start-reverse"
          >
            <polygon
              points="0 0, 8 3, 0 6"
              fill={arrowStart === "filled" ? strokeColor : "none"}
              stroke={strokeColor}
              strokeWidth="0.8"
            />
          </marker>
        )}
      </defs>
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={dash}
        vectorEffect="non-scaling-stroke"
        markerEnd={arrowEnd !== "none" ? `url(#${endMarkerId})` : undefined}
        markerStart={
          arrowStart !== "none" ? `url(#${startMarkerId})` : undefined
        }
      />
    </svg>
  );
}

function SlideElementView({
  element,
  elements,
  tc,
  accent,
  visuals,
  editable,
}: {
  element: SlideElement;
  elements: readonly SlideElement[];
  tc: ThemeConfig;
  accent: string;
  visuals: ReadonlyMap<string, Visual>;
  editable?: boolean;
}): JSX.Element | null {
  switch (element.kind) {
    case "text":
      return <TextElementView element={element} tc={tc} accent={accent} />;
    case "bullets":
      return <BulletsElementView element={element} tc={tc} accent={accent} />;
    case "visual":
      return <VisualElementView element={element} visuals={visuals} />;
    case "image":
      return <ImageElementView element={element} editable={editable} />;
    case "shape":
      return <ShapeElementView element={element} elements={elements} />;
    case "connector":
      return <ConnectorElementView element={element} elements={elements} />;
    default:
      return null;
  }
}

function ElementsSlideLayout({
  slide,
  tc,
  visuals,
  hiddenElementIds,
  editable,
}: {
  slide: Slide;
  tc: ThemeConfig;
  visuals: ReadonlyMap<string, Visual>;
  hiddenElementIds?: ReadonlySet<string>;
  editable?: boolean;
}): JSX.Element {
  const background = slide.background ?? tc.bgColor;
  const accent = slide.accent ?? tc.accentColor;
  // Background precedence: image > gradient > solid color.
  const backgroundStyle: React.CSSProperties = slide.backgroundImage
    ? {
        backgroundColor: background,
        backgroundImage: `url(${slide.backgroundImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : slide.backgroundGradient
      ? {
          backgroundImage: `linear-gradient(${
            slide.backgroundGradient.angle ?? 135
          }deg, ${slide.backgroundGradient.from}, ${slide.backgroundGradient.to})`,
        }
      : { backgroundColor: background };
  const ordered = [...(slide.elements ?? [])]
    .filter((element) => !element.hidden && !hiddenElementIds?.has(element.id))
    .sort((a, b) => a.zIndex - b.zIndex);
  return (
    <div
      style={{
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        ...backgroundStyle,
        containerType: "size",
      }}
    >
      {ordered.map((element) => (
        <SlideElementView
          key={element.id}
          element={element}
          elements={ordered}
          tc={tc}
          accent={accent}
          visuals={visuals}
          editable={editable}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SlideCanvas — selects the right layout renderer for a slide
// ---------------------------------------------------------------------------

export interface SlideCanvasProps {
  slide: Slide;
  visuals: ReadonlyMap<string, Visual>;
  /** True when rendered at reduced size (e.g. presenter next-slide preview). */
  preview?: boolean;
  /**
   * Element ids to skip rendering. Used by the editor to hide an element while
   * it is being inline-edited (the editable overlay renders it instead). Never
   * set by Present / public surfaces.
   */
  hiddenElementIds?: ReadonlySet<string>;
  /**
   * True only on the interactive editing stage. Lets empty-source image
   * elements render an "Add image" dropzone affordance; Present / public /
   * preview surfaces leave this off so an unfilled image is a neutral box
   * rather than an editing prompt or a broken `<img>` (#226).
   */
  editable?: boolean;
}

/**
 * Renders a single slide using the appropriate layout component.
 *
 * Shared between the in-app {@link PresentMode} and the public
 * {@link PublicPresentViewer} so both surfaces stay in sync.
 *
 * Wrapped with `React.memo` so the thumbnail rail skips re-rendering canvases
 * whose props (slide identity, visuals map) did not change — a drag that only
 * mutates the active slide will not re-render every thumbnail.
 */
export const SlideCanvas = memo(function SlideCanvas({
  slide,
  visuals,
  preview = false,
  hiddenElementIds,
  editable = false,
}: SlideCanvasProps): JSX.Element {
  const tc = DECK_THEMES[slide.theme] ?? DECK_THEMES.default;

  // Free-form elements are authoritative when present.
  if (slide.elements && slide.elements.length > 0) {
    return (
      <ElementsSlideLayout
        slide={slide}
        tc={tc}
        visuals={visuals}
        hiddenElementIds={hiddenElementIds}
        editable={editable}
      />
    );
  }

  const props: SlideProps = { slide, tc, visuals, preview };

  switch (slide.layout) {
    case "title":
      return <TitleSlideLayout {...props} />;
    case "section":
      return <SectionSlideLayout {...props} />;
    case "content":
      return <ContentSlideLayout {...props} />;
    case "media":
      return <MediaSlideLayout {...props} />;
    default:
      return <BlankSlideLayout {...props} />;
  }
});
