/**
 * PPTX → plain text extractor.
 *
 * PPTX files are ZIP archives containing XML slide files. We unzip the archive
 * with `jszip`, parse each `ppt/slides/slide*.xml` file, and extract the text
 * from `<a:t>` elements. Slide titles (inside `<p:sp>` elements whose
 * `<p:ph>` attribute carries `type="title"` or `type="ctrTitle"`) are promoted
 * to headings so the result has some structure.
 *
 * Server-only: `jszip` and XML processing run in Node.js only.
 */
import "server-only";

import { loadZipWithinBudget } from "./archive-budget";

/** Regex to match all `<a:t>…</a:t>` text runs. */
const TEXT_RE = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;

/** Regex to detect a placeholder shape that is a title. */
const TITLE_PH_RE = /<p:ph\s[^>]*type="(title|ctrTitle)"[^>]*\/?>/i;

/** Regex to split the XML into individual shapes (`<p:sp>…</p:sp>`). */
const SHAPE_RE = /<p:sp[\s\S]*?<\/p:sp>/g;

/** Decodes basic XML character entities. */
function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** Extracts all text runs from an XML snippet. */
function extractText(xml: string): string {
  const parts: string[] = [];
  let m;
  TEXT_RE.lastIndex = 0;
  while ((m = TEXT_RE.exec(xml)) !== null) {
    const t = decodeXml(m[1]).trim();
    if (t) parts.push(t);
  }
  return parts.join(" ");
}

/**
 * Extracts slide text from a PPTX `Buffer` and returns a structured plain-text
 * outline (each slide separated by a blank line, titles as `## Heading`).
 */
export async function parsePptx(buffer: Buffer): Promise<string> {
  const zip = await loadZipWithinBudget(buffer);

  // Collect slide XML files in sorted order so slides appear in sequence.
  const slideEntries = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ""), 10);
      const nb = parseInt(b.replace(/\D/g, ""), 10);
      return na - nb;
    });

  const slideBlocks: string[] = [];

  for (const slideName of slideEntries) {
    const xml = await zip.files[slideName]!.async("string");
    const lines: string[] = [];

    // Process shape-by-shape so titles can be prefixed with `##`.
    let shapeMatch;
    SHAPE_RE.lastIndex = 0;
    while ((shapeMatch = SHAPE_RE.exec(xml)) !== null) {
      const shapeXml = shapeMatch[0];
      const text = extractText(shapeXml);
      if (!text) continue;
      if (TITLE_PH_RE.test(shapeXml)) {
        lines.push(`## ${text}`);
      } else {
        lines.push(text);
      }
    }

    if (lines.length > 0) {
      slideBlocks.push(lines.join("\n"));
    }
  }

  return slideBlocks.join("\n\n");
}
