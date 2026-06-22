import type { SlideElement } from "./deck";

/**
 * Returns a concise, screen-reader–friendly accessible name for a slide
 * element.  The name is derived from the element's content rather than its
 * kind so assistive technologies announce something meaningful ("Hello world"
 * instead of "text element").
 *
 * Rules:
 * - text / bullets → leading text of the content (max 60 chars)
 * - image          → `alt` when set, otherwise "Image"
 * - visual         → `alt` when set, otherwise "Visual"
 * - shape          → "Shape: <kind>"
 * - fallback       → "Element"
 */
export function elementAccessibleName(element: SlideElement): string {
  switch (element.kind) {
    case "text": {
      const raw = element.text?.trim();
      if (!raw) return "Text element";
      return raw.length > 60 ? `${raw.slice(0, 60)}…` : raw;
    }
    case "bullets": {
      const first = element.bullets.find((b) => b.trim() !== "")?.trim();
      if (!first) return "Bullets element";
      return first.length > 60 ? `${first.slice(0, 60)}…` : first;
    }
    case "image": {
      const alt = element.alt?.trim();
      return alt ? alt : "Image";
    }
    case "visual": {
      const alt = element.alt?.trim();
      return alt ? alt : "Visual";
    }
    case "shape": {
      const text = element.text?.trim();
      if (text) return text.length > 60 ? `${text.slice(0, 60)}…` : text;
      return `Shape: ${element.shape}`;
    }
    default:
      return "Element";
  }
}
