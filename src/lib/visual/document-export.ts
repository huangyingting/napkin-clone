/**
 * Document-level export utilities.
 *
 * Provides two public capabilities:
 *  1. `collectDocumentBlocks` — pure, headless walk of a serialised Lexical
 *     editor state that yields all text blocks (headings, paragraphs, quotes,
 *     lists, horizontal rules) and visual blocks in reading order. Testable
 *     under `node --test` without a browser.
 *  2. `exportDocumentAsPDF` / `exportDocumentAsPPTX` — browser-only assembly
 *     functions that take the block list and a callback to resolve each
 *     visual's live SVG element, then produce a single Blob.
 *
 * Design notes
 * - Text blocks are laid out in the PDF with jsPDF's text API. Headings use
 *   larger bold fonts; paragraphs and quote use body size; list items are
 *   indented with a bullet prefix. Visuals each start on a new page sized to
 *   fit the visual (matching the existing per-visual `exportPDF` contract).
 * - PPTX produces one slide per visual (with the nearest preceding heading as
 *   the slide title), matching the per-visual `exportPPTX` contract. When
 *   there are no visuals a title-only slide is emitted so the deck is never
 *   empty.
 * - The `getSvgForVisual` callback is intentionally thin: callers supply it
 *   by reading from the `VisualSvgRegistry` context (visual-svg-registry.tsx).
 *   This keeps the export logic free of React and independently testable.
 */

import { jsPDF } from "jspdf";
import PptxGenJS from "pptxgenjs";

import type { Visual } from "@/lib/visual/schema";
import { exportPNG } from "@/lib/visual/export";

// ---------------------------------------------------------------------------
// Block types
// ---------------------------------------------------------------------------

export type TextBlockKind =
  | "paragraph"
  | "heading"
  | "quote"
  | "listitem"
  | "hr";

export type DocumentTextBlock = {
  kind: "text";
  blockType: TextBlockKind;
  /** Heading level (1–3) — only present when blockType === "heading" */
  level?: 1 | 2 | 3;
  /** Plain text for the block (empty string for "hr") */
  text: string;
};

export type DocumentVisualBlock = {
  kind: "visual";
  visualId: string;
  visual: Visual;
};

export type DocumentBlock = DocumentTextBlock | DocumentVisualBlock;

// ---------------------------------------------------------------------------
// collectDocumentBlocks — pure, no browser
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Concatenates all inline text nodes under a serialised Lexical block node. */
function blockText(node: Record<string, unknown>): string {
  if (Array.isArray(node.children)) {
    return (node.children as unknown[])
      .map((child) => {
        if (!isRecord(child)) return "";
        if (child.type === "linebreak") return "\n";
        if (typeof child.text === "string") return child.text;
        return blockText(child);
      })
      .join("");
  }
  return typeof node.text === "string" ? node.text : "";
}

function walkBlocks(node: unknown, out: DocumentBlock[]): void {
  if (!isRecord(node)) return;

  const type = node.type;

  if (type === "visual") {
    if (
      typeof node.visualId === "string" &&
      node.visualId.length > 0 &&
      isRecord(node.visual)
    ) {
      out.push({
        kind: "visual",
        visualId: node.visualId,
        visual: node.visual as unknown as Visual,
      });
    }
    return;
  }

  if (type === "heading") {
    const tag = typeof node.tag === "string" ? node.tag : "";
    const level = (
      tag === "h1" ? 1 : tag === "h2" ? 2 : tag === "h3" ? 3 : 2
    ) as 1 | 2 | 3;
    out.push({
      kind: "text",
      blockType: "heading",
      level,
      text: blockText(node),
    });
    return;
  }

  if (type === "paragraph") {
    out.push({ kind: "text", blockType: "paragraph", text: blockText(node) });
    return;
  }

  if (type === "quote") {
    out.push({ kind: "text", blockType: "quote", text: blockText(node) });
    return;
  }

  if (type === "horizontalrule") {
    out.push({ kind: "text", blockType: "hr", text: "" });
    return;
  }

  // list → recurse into listitem children
  if (type === "list" && Array.isArray(node.children)) {
    for (const child of node.children as unknown[]) {
      if (!isRecord(child)) continue;
      if (child.type === "listitem") {
        out.push({
          kind: "text",
          blockType: "listitem",
          text: blockText(child),
        });
      } else {
        walkBlocks(child, out);
      }
    }
    return;
  }

  // Generic container — recurse
  if (Array.isArray(node.children)) {
    for (const child of node.children as unknown[]) {
      walkBlocks(child, out);
    }
  }
}

/**
 * Walks a serialised Lexical editor state and returns all text/visual blocks
 * in reading (document) order. Accepts the state as a JSON string or a
 * pre-parsed object; malformed input yields an empty array and never throws.
 *
 * This function is intentionally pure and browser-free so it can be tested
 * under `node --test`.
 */
export function collectDocumentBlocks(state: unknown): DocumentBlock[] {
  let parsed: unknown = state;
  if (typeof state === "string") {
    try {
      parsed = JSON.parse(state);
    } catch {
      return [];
    }
  }

  if (!isRecord(parsed)) return [];
  const root = isRecord(parsed.root) ? parsed.root : null;
  if (!root || !Array.isArray(root.children)) return [];

  const out: DocumentBlock[] = [];
  for (const child of root.children as unknown[]) {
    walkBlocks(child, out);
  }
  return out;
}

// ---------------------------------------------------------------------------
// PDF helpers (browser-only)
// ---------------------------------------------------------------------------

const PAGE_W_MM = 210; // A4 portrait width
const PAGE_H_MM = 297; // A4 portrait height
const MARGIN_MM = 20;
const BODY_W_MM = PAGE_W_MM - MARGIN_MM * 2;

/** Convert SVG element → PNG data-URL at 2× scale for quality. */
async function svgToPngDataUrl(svg: SVGSVGElement): Promise<string | null> {
  const pngBlob = await exportPNG(svg, 2);
  if (!pngBlob) return null;
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(pngBlob);
  });
}

/**
 * Render one visual block into the PDF.  Each visual gets its own A4 page
 * (landscape if wider than tall) with the PNG inset at 10 % margins.
 */
async function addVisualPage(
  pdf: jsPDF,
  svg: SVGSVGElement,
  addPage: boolean,
): Promise<void> {
  const viewBox = svg.viewBox.baseVal;
  const vw = viewBox.width;
  const vh = viewBox.height;
  if (vw === 0 || vh === 0) return;

  const pngDataUrl = await svgToPngDataUrl(svg);
  if (!pngDataUrl) return;

  const landscape = vw > vh;
  const pgW = landscape ? PAGE_H_MM : PAGE_W_MM;
  const pgH = landscape ? PAGE_W_MM : PAGE_H_MM;

  if (addPage) {
    pdf.addPage(landscape ? "landscape" : "portrait");
  }

  // Fit image within 80 % of page area
  const maxW = pgW * 0.8;
  const maxH = pgH * 0.8;
  const ratio = Math.min(maxW / vw, maxH / vh);
  const imgW = vw * ratio;
  const imgH = vh * ratio;
  const x = (pgW - imgW) / 2;
  const y = (pgH - imgH) / 2;

  pdf.addImage(pngDataUrl, "PNG", x, y, imgW, imgH);
}

/**
 * Produces a single multi-page PDF for the entire document.
 *
 * Layout:
 * - A title "page-header" is written on the first page using the document
 *   title passed in.
 * - Text blocks (headings, paragraphs, quotes, list items) are flowed onto
 *   A4 pages with automatic line-wrapping and page breaks.
 * - Each visual block starts on a new A4 page (landscape if the visual is
 *   wider than tall) sized to fit the image.
 * - An empty document (zero blocks) yields a single title page.
 *
 * @param blocks   Output of {@link collectDocumentBlocks}
 * @param title    Document title — shown as the first-page heading
 * @param getSvg   Callback to resolve a live SVGSVGElement for a given visualId
 */
export async function exportDocumentAsPDF(
  blocks: DocumentBlock[],
  title: string,
  getSvg: (visualId: string) => SVGSVGElement | null,
): Promise<Blob | null> {
  try {
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    let curY = MARGIN_MM;

    /** Write text with automatic page-break and return new Y position. */
    const writeText = (
      text: string,
      fontSize: number,
      bold: boolean,
      indent = 0,
    ) => {
      pdf.setFontSize(fontSize);
      pdf.setFont("helvetica", bold ? "bold" : "normal");
      const maxW = BODY_W_MM - indent;
      const lines = pdf.splitTextToSize(text, maxW) as string[];
      const lineH = fontSize * 0.352778 * 1.4; // pt→mm × leading
      for (const line of lines) {
        if (curY + lineH > PAGE_H_MM - MARGIN_MM) {
          pdf.addPage();
          curY = MARGIN_MM;
        }
        pdf.text(line, MARGIN_MM + indent, curY);
        curY += lineH;
      }
    };

    // Document title
    if (title) {
      writeText(title, 22, true);
      curY += 6;
    }

    let onFirstPage = true;

    for (const block of blocks) {
      if (block.kind === "visual") {
        const svg = getSvg(block.visualId);
        if (!svg) continue;
        await addVisualPage(pdf, svg, /* addPage= */ true);
        onFirstPage = false;
        // After a visual page, reset Y to top-margin for any subsequent text
        curY = MARGIN_MM;
        continue;
      }

      // Text block
      const { blockType, text, level } = block;

      if (blockType === "hr") {
        if (!onFirstPage) {
          curY += 4;
          if (curY + 1 > PAGE_H_MM - MARGIN_MM) {
            pdf.addPage();
            curY = MARGIN_MM;
          }
          pdf.setDrawColor(180);
          pdf.line(MARGIN_MM, curY, PAGE_W_MM - MARGIN_MM, curY);
          curY += 4;
        }
        continue;
      }

      if (!text.trim()) continue;

      switch (blockType) {
        case "heading": {
          const fs = level === 1 ? 18 : level === 2 ? 15 : 13;
          curY += level === 1 ? 5 : 3;
          writeText(text, fs, true);
          curY += 2;
          break;
        }
        case "quote":
          curY += 1;
          writeText(`"${text}"`, 11, false, 6);
          curY += 1;
          break;
        case "listitem":
          writeText(`• ${text}`, 11, false, 4);
          break;
        default:
          writeText(text, 11, false);
          curY += 1;
      }

      onFirstPage = false;
    }

    return pdf.output("blob");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// PPTX helpers (browser-only)
// ---------------------------------------------------------------------------

const SLIDE_W = 10; // inches
const SLIDE_H = 7.5; // inches

/** Adds a single-visual slide to the presentation. */
async function addVisualSlide(
  pptx: PptxGenJS,
  svg: SVGSVGElement,
  slideTitle: string | null,
): Promise<void> {
  const viewBox = svg.viewBox.baseVal;
  const vw = viewBox.width;
  const vh = viewBox.height;
  if (vw === 0 || vh === 0) return;

  const pngDataUrl = await svgToPngDataUrl(svg);
  if (!pngDataUrl) return;

  const slide = pptx.addSlide();

  const titleAreaH = slideTitle ? 0.9 : 0;
  const contentH = SLIDE_H - titleAreaH - 0.3;
  const contentW = SLIDE_W * 0.9;

  if (slideTitle) {
    slide.addText(slideTitle, {
      x: 0.5,
      y: 0.1,
      w: SLIDE_W - 1,
      h: titleAreaH,
      fontSize: 20,
      bold: true,
      color: "1a1a2e",
    });
  }

  const ratio = Math.min(contentW / vw, contentH / vh);
  const imgW = vw * ratio;
  const imgH = vh * ratio;
  const x = (SLIDE_W - imgW) / 2;
  const y = titleAreaH + (contentH - imgH) / 2 + 0.15;

  slide.addImage({ data: pngDataUrl, x, y, w: imgW, h: imgH });
}

/**
 * Produces a PPTX deck with one slide per visual in the document.
 *
 * The nearest preceding heading (scanning backwards from each visual) is used
 * as the slide title. If a document has no visuals, a single title-only slide
 * is emitted so the file is never empty.
 *
 * @param blocks   Output of {@link collectDocumentBlocks}
 * @param title    Document title — used for the title-only fallback slide
 * @param getSvg   Callback to resolve a live SVGSVGElement for a given visualId
 */
export async function exportDocumentAsPPTX(
  blocks: DocumentBlock[],
  title: string,
  getSvg: (visualId: string) => SVGSVGElement | null,
): Promise<Blob | null> {
  try {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";

    // Collect visuals with their nearest preceding heading
    type VisualEntry = {
      block: DocumentVisualBlock;
      heading: string | null;
    };

    const entries: VisualEntry[] = [];
    let lastHeading: string | null = null;

    for (const block of blocks) {
      if (block.kind === "text" && block.blockType === "heading") {
        lastHeading = block.text.trim() || null;
      } else if (block.kind === "visual") {
        entries.push({ block, heading: lastHeading });
      }
    }

    if (entries.length === 0) {
      // Emit a title-only slide so the deck is never empty
      const slide = pptx.addSlide();
      slide.addText(title || "Untitled document", {
        x: 1,
        y: 2.5,
        w: SLIDE_W - 2,
        h: 1.5,
        fontSize: 32,
        bold: true,
        align: "center",
        color: "1a1a2e",
      });
    } else {
      for (const { block, heading } of entries) {
        const svg = getSvg(block.visualId);
        if (!svg) continue;
        await addVisualSlide(pptx, svg, heading);
      }
    }

    const arrayBuffer = (await pptx.write({
      outputType: "arraybuffer",
    })) as ArrayBuffer;

    return new Blob([arrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
  } catch {
    return null;
  }
}
