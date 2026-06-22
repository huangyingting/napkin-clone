"use client";

/**
 * Shared slide rendering primitives used by both the in-app {@link PresentMode}
 * and the public {@link PublicPresentViewer}.
 *
 * Exported from this module so that the two presentation surfaces can stay in
 * sync without duplicating layout code.
 */

import { memo, type JSX } from "react";

import type {
  BulletsElement,
  DeckTheme,
  ImageElement,
  ShapeElement,
  Slide,
  SlideElement,
  TextElement,
  TextRun,
  VisualElement,
} from "@/lib/presentation/deck";
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
  const color =
    element.style.color ??
    (element.role === "title" ? tc.titleColor : tc.bodyColor);
  const hasRuns = element.runs !== undefined && element.runs.length > 0;
  return (
    <div
      style={{
        ...boxStyle(element),
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        textAlign: element.style.align,
        color,
        fontSize: `${element.style.fontSize}cqh`,
        fontWeight: element.style.bold ? 700 : 400,
        fontStyle: element.style.italic ? "italic" : "normal",
        ...(element.style.underline ? { textDecoration: "underline" } : {}),
        ...(element.style.fontFamily
          ? { fontFamily: element.style.fontFamily }
          : {}),
        lineHeight: 1.15,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: "100%",
          whiteSpace: "pre-wrap",
          overflowWrap: "break-word",
          wordBreak: "normal",
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
  const color = element.style.color ?? tc.bodyColor;
  const bulletRuns = element.bulletRuns;
  return (
    <ul
      style={{
        ...boxStyle(element),
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: "0.6em",
        color,
        fontSize: `${element.style.fontSize}cqh`,
        fontWeight: element.style.bold ? 700 : 400,
        fontStyle: element.style.italic ? "italic" : "normal",
        ...(element.style.underline ? { textDecoration: "underline" } : {}),
        ...(element.style.fontFamily
          ? { fontFamily: element.style.fontFamily }
          : {}),
        textAlign: element.style.align,
        lineHeight: 1.2,
        overflow: "hidden",
        margin: 0,
        padding: 0,
        listStyle: "none",
      }}
    >
      {element.bullets.map((bullet, i) => {
        const runs = bulletRuns?.[i];
        return (
          <li
            key={i}
            style={{ display: "flex", alignItems: "flex-start", gap: "0.5em" }}
          >
            <span
              aria-hidden="true"
              style={{
                marginTop: "0.45em",
                height: "0.35em",
                width: "0.35em",
                flexShrink: 0,
                borderRadius: "9999px",
                backgroundColor: accent,
              }}
            />
            <span
              style={{
                minWidth: 0,
                overflowWrap: "break-word",
                wordBreak: "normal",
              }}
            >
              {runs && runs.length > 0 ? renderRuns(runs) : bullet}
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

function ShapeElementView({ element }: { element: ShapeElement }): JSX.Element {
  if (element.shape === "line") {
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
          backgroundColor: element.color,
          clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
        }}
      />
    );
  }
  return (
    <div
      style={{
        ...boxStyle(element),
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
    />
  );
}

function SlideElementView({
  element,
  tc,
  accent,
  visuals,
  editable,
}: {
  element: SlideElement;
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
      return <ShapeElementView element={element} />;
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
    .filter((element) => !hiddenElementIds?.has(element.id))
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
