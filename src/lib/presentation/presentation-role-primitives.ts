/** Leaf theme-token primitive roles shared by elements and token schema. */

export const PRESENTATION_ROLES = [
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

export type PresentationRole = (typeof PRESENTATION_ROLES)[number];
