/** Leaf reusable layout primitive unions shared by elements and layouts. */

export const PLACEHOLDER_TYPES = [
  "title",
  "subtitle",
  "body",
  "visual",
  "footer",
] as const;

export type PlaceholderType = (typeof PLACEHOLDER_TYPES)[number];

export const PLACEHOLDER_TYPE_LABELS: Record<PlaceholderType, string> = {
  title: "Title",
  subtitle: "Subtitle",
  body: "Body",
  visual: "Visual",
  footer: "Footer",
};
