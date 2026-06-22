/**
 * Canonical slide text sizes, expressed as a percent of slide height (`cqh`).
 * Keep all default text insertion paths on this scale so H1/H2/H3/body/list
 * text are predictable regardless of whether they come from the toolbar,
 * double-click insertion, or the From document panel.
 */
export const SLIDE_TEXT_FONT_SIZE = {
  h1: 6.5,
  h2: 5.5,
  h3: 5,
  text: 4,
  list: 4.5,
} as const;

export type SlideTextFontRole = keyof typeof SLIDE_TEXT_FONT_SIZE;

export function headingFontSize(level: 1 | 2 | 3 | undefined): number {
  switch (level) {
    case 1:
      return SLIDE_TEXT_FONT_SIZE.h1;
    case 2:
      return SLIDE_TEXT_FONT_SIZE.h2;
    default:
      return SLIDE_TEXT_FONT_SIZE.h3;
  }
}
