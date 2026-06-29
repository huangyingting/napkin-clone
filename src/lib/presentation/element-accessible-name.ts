import { normalizeTextParagraphs, type SlideElement } from "./deck-elements";
import { assertNever } from "@/lib/assert-never";

function elementContent(element: SlideElement): Record<string, any> {
  return ((element as any).content ?? {}) as Record<string, any>;
}

/**
 * Returns a concise, screen-reader–friendly accessible name for a slide
 * element.  The name is derived from the element's content rather than its
 * kind so assistive technologies announce something meaningful ("Hello world"
 * instead of "text element").
 *
 * Rules:
 * - text           → leading paragraph text (max 60 chars)
 * - image          → `alt` when set, otherwise "Image"
 * - visual         → `alt` when set, otherwise "Visual"
 * - shape          → "Shape: <kind>"
 * - table          → caption, column-label summary, or "Table"
 * - connector      → "Connector from <start> to <end>" when `allElements` is
 *                    provided and endpoints are bound; "Connector" otherwise.
 * - fallback       → "Element"
 */
export function elementAccessibleName(
  element: SlideElement,
  allElements?: readonly SlideElement[],
): string {
  switch (element.kind) {
    case "text": {
      const raw = normalizeTextParagraphs(element)
        .find((paragraph) => paragraph.text.trim() !== "")
        ?.text.trim();
      if (!raw) return "Text element";
      return raw.length > 60 ? `${raw.slice(0, 60)}…` : raw;
    }
    case "image": {
      const alt = elementContent(element).alt?.trim();
      return alt ? alt : "Image";
    }
    case "visual": {
      const alt = elementContent(element).alt?.trim();
      return alt ? alt : "Visual";
    }
    case "shape": {
      const content = elementContent(element);
      const text = content.text?.trim();
      if (text) return text.length > 60 ? `${text.slice(0, 60)}…` : text;
      return `Shape: ${content.shape}`;
    }
    case "table": {
      const content = element.content;
      const caption = content.caption?.trim();
      if (caption) {
        const label = `Table: ${caption}`;
        return label.length > 60 ? `${label.slice(0, 60)}…` : label;
      }
      const columns = content.columns
        .map((column) => column.label.trim())
        .filter((label) => label.length > 0)
        .slice(0, 3)
        .join(", ");
      if (columns) {
        const label = `Table: ${columns}`;
        return label.length > 60 ? `${label.slice(0, 60)}…` : label;
      }
      return "Table";
    }
    case "connector": {
      if (!allElements) return "Connector";
      const content = elementContent(element);
      const start = content.start;
      const end = content.end;
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
      return assertNever(element);
  }
}

/** Short label for a shape connected to a connector — used in accessible names. */
function connectorTargetLabel(element: SlideElement): string {
  switch (element.kind) {
    case "text": {
      const text = normalizeTextParagraphs(element)
        .find((paragraph) => paragraph.text.trim() !== "")
        ?.text.trim();
      return text
        ? text.length > 20
          ? `${text.slice(0, 20)}…`
          : text
        : "text";
    }
    case "image":
      return elementContent(element).alt?.trim() || "image";
    case "visual":
      return elementContent(element).alt?.trim() || "visual";
    case "shape":
      return elementContent(element).shape;
    case "table": {
      const caption = element.content.caption?.trim();
      if (caption)
        return caption.length > 20 ? `${caption.slice(0, 20)}…` : caption;
      return "table";
    }
    default:
      return "element";
  }
}
