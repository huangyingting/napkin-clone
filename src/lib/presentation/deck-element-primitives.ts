/** Leaf presentation element primitive unions shared by schema and tokens. */

export type ElementAlign = "left" | "center" | "right";

export type ConnectorArrow = "none" | "arrow" | "filled";

export const IMAGE_FIT_MODES = ["contain", "cover", "fill", "none"] as const;
export type ImageFitMode = (typeof IMAGE_FIT_MODES)[number];

export const IMAGE_MASK_SHAPES = [
  "none",
  "circle",
  "rounded",
  "diamond",
] as const;
export type ImageMaskShape = (typeof IMAGE_MASK_SHAPES)[number];
