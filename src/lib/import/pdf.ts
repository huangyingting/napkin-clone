/**
 * PDF → plain text extractor using the `pdf-parse` v2 package (`PDFParse`).
 *
 * `pdf-parse` wraps `pdfjs-dist` and runs entirely in Node.js, making it safe
 * for server-only route handlers. The parser is instantiated per-call and
 * destroyed after use to release internal worker resources.
 *
 * Server-only: `pdf-parse` must never be imported on the client.
 */
import "server-only";

import { PDFParse } from "pdf-parse";

/**
 * Extracts text from a PDF `Buffer` and returns it as a plain text string.
 * Throws when `pdf-parse` cannot load or read the document.
 */
export async function parsePdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}
