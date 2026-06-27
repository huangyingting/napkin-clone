import type { Deck, Slide } from "@/lib/presentation/deck";
import {
  resolveSlideFormat,
  type SlideFormat,
} from "@/lib/presentation/slide-format";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function deckCanvasFormat(deck: Deck): SlideFormat {
  return resolveSlideFormat(
    record((deck as { canvas?: unknown }).canvas).format as
      | SlideFormat
      | undefined,
  );
}

export function deckPresentationThemeId(deck: Deck): string {
  const design = record((deck as { design?: unknown }).design);
  return typeof design.themeId === "string" ? design.themeId : "default";
}

export function deckHasThemeOverrides(deck: Deck): boolean {
  const design = record((deck as { design?: unknown }).design);
  const overrides = record(design.themeOverrides);
  return Object.keys(overrides).length > 0;
}

function colorRefLiteral(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  const ref = record(value);
  return typeof ref.value === "string" ? ref.value : undefined;
}

export function slideDesignOverrides(slide: Slide): Record<string, unknown> {
  return record((slide as { designOverrides?: unknown }).designOverrides);
}

export function slideSolidBackgroundValue(slide: Slide): string | undefined {
  const background = record(slideDesignOverrides(slide).background);
  return background.type === "solid"
    ? colorRefLiteral(background.color)
    : undefined;
}

export function slideBackgroundGradientValue(
  slide: Slide,
): { from: string; to: string; angle?: number } | undefined {
  const background = record(slideDesignOverrides(slide).background);
  if (background.type !== "gradient") return undefined;
  const from = colorRefLiteral(background.from);
  const to = colorRefLiteral(background.to);
  if (!from || !to) return undefined;
  return {
    from,
    to,
    ...(typeof background.angle === "number"
      ? { angle: background.angle }
      : {}),
  };
}

export function slideBackgroundImageValue(slide: Slide): string | undefined {
  const background = record(slideDesignOverrides(slide).background);
  return background.type === "image" && typeof background.url === "string"
    ? background.url
    : undefined;
}

export function slideAccentValue(slide: Slide): string | undefined {
  return colorRefLiteral(slideDesignOverrides(slide).accent);
}
