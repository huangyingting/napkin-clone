"use client";

/**
 * Shared slide rendering primitives used by both the in-app {@link PresentMode}
 * and the public {@link PublicPresentViewer}.
 *
 * Exported from this module so that the two presentation surfaces can stay in
 * sync without duplicating layout code.
 */

import type { JSX } from "react";

import type { DeckTheme, Slide } from "@/lib/presentation/deck";
import type { Visual } from "@/lib/visual/schema";
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

export interface SlideProps {
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
// SlideCanvas — selects the right layout renderer for a slide
// ---------------------------------------------------------------------------

export interface SlideCanvasProps {
  slide: Slide;
  visuals: ReadonlyMap<string, Visual>;
  /** True when rendered at reduced size (e.g. presenter next-slide preview). */
  preview?: boolean;
}

/**
 * Renders a single slide using the appropriate layout component.
 *
 * Shared between the in-app {@link PresentMode} and the public
 * {@link PublicPresentViewer} so both surfaces stay in sync.
 */
export function SlideCanvas({
  slide,
  visuals,
  preview = false,
}: SlideCanvasProps): JSX.Element {
  const tc = DECK_THEMES[slide.theme] ?? DECK_THEMES.default;
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
}

