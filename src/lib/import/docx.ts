/**
 * DOCX → plain Markdown-like text via `mammoth`.
 *
 * `mammoth` converts Word documents to HTML; we then run the result through the
 * `htmlToMarkdown` converter so the output is in the Markdown subset the editor
 * already understands (headings, bullets, paragraphs).
 *
 * Server-only: `mammoth` is a Node.js library and must never be imported on the
 * client. The route handler that calls this file already carries `runtime = 'nodejs'`.
 */
import "server-only";

import mammoth from "mammoth";

import { loadZipWithinBudget } from "./archive-budget";
import { htmlToMarkdown } from "./html";

/**
 * Extracts text from a DOCX `Buffer` and returns it as Markdown-compatible text.
 * Throws when `mammoth` cannot parse the buffer (e.g. corrupt file).
 */
export async function parseDocx(buffer: Buffer): Promise<string> {
  await loadZipWithinBudget(buffer);
  const result = await mammoth.convertToHtml({ buffer });
  return htmlToMarkdown(result.value);
}
