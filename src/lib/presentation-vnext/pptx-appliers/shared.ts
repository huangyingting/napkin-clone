import type PptxGenJS from "pptxgenjs";

export type PptxSlide = ReturnType<PptxGenJS["addSlide"]>;
export type PptxCoord = number | `${number}%`;

export function stripHash(color: string): string {
  return color.startsWith("#")
    ? color.slice(1).toUpperCase()
    : color.toUpperCase();
}
