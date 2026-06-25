/** Leaf theme-token primitive roles shared by elements and token schema. */

export const DECK_TEXT_ROLES = [
  "h1",
  "h2",
  "h3",
  "subtitle",
  "body",
  "bullet",
  "caption",
  "footer",
  "shapeLabel",
] as const;

export type DeckTextRole = (typeof DECK_TEXT_ROLES)[number];
