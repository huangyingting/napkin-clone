import { PLACEHOLDER_TYPE_LABELS, type SlideElement } from "./deck";

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
 * - connector      → "Connector from <start> to <end>" when `allElements` is
 *                    provided and endpoints are bound; "Connector" otherwise.
 * - fallback       → "Element"
 */
export function elementAccessibleName(
  element: SlideElement,
  allElements?: readonly SlideElement[],
): string {
  switch (element.kind) {
    case "placeholder": {
      const label =
        element.label?.trim() ||
        `${PLACEHOLDER_TYPE_LABELS[element.placeholderType]} placeholder`;
      return label.length > 60 ? `${label.slice(0, 60)}…` : label;
    }
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
    case "connector": {
      if (!allElements) return "Connector";
      const start = element.start;
      const end = element.end;
      const startEl =
        "elementId" in start
          ? allElements.find((el) => el.id === start.elementId)
          : null;
      const endEl =
        "elementId" in end
          ? allElements.find((el) => el.id === end.elementId)
          : null;
      const startName = startEl ? connectorTargetLabel(startEl) : "point";
      const endName = endEl ? connectorTargetLabel(endEl) : "point";
      return `Connector from ${startName} to ${endName}`;
    }
    default:
      return "Element";
  }
}

/** Short label for a shape connected to a connector — used in accessible names. */
function connectorTargetLabel(element: SlideElement): string {
  switch (element.kind) {
    case "placeholder":
      return (
        element.label?.trim() ||
        PLACEHOLDER_TYPE_LABELS[element.placeholderType]
      );
    case "text": {
      const text = element.text?.trim();
      return text
        ? text.length > 20
          ? `${text.slice(0, 20)}…`
          : text
        : "text";
    }
    case "bullets": {
      const first = element.bullets.find((b) => b.trim() !== "")?.trim();
      return first
        ? first.length > 20
          ? `${first.slice(0, 20)}…`
          : first
        : "bullets";
    }
    case "image":
      return element.alt?.trim() || "image";
    case "visual":
      return element.alt?.trim() || "visual";
    case "shape":
      return element.shape;
    default:
      return "element";
  }
}
