import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { FIXTURES } from "@/lib/visual/fixtures";
import { VISUAL_KIND_TO_PRISMA } from "@/lib/visual/schema";

/** Title of the first-run sample document seeded for new users. */
export const SAMPLE_DOCUMENT_TITLE = "Welcome to Napkin Clone";

/**
 * Example Markdown for the first-run sample document. Uses only the block kinds
 * the editor supports (headings, bullet lists, paragraphs) and keeps blocks
 * blank-line separated so {@link parseMarkdown} renders them distinctly.
 */
const SAMPLE_DOCUMENT_CONTENT = `# Welcome to Napkin Clone 👋

This is your first document. Napkin Clone turns plain text into clean, shareable visuals — no design tools required.

## How it works

- Write or paste your ideas as simple Markdown on the left
- Generate a visual — flowchart, mind map, chart, and more
- Customize colors, icons, and layout, then export or share

## Try it yourself

Edit this text, then open the visual panel on the right to generate something new. The flowchart already attached to this document shows what a finished visual looks like.`;

/**
 * Seeds a single first-run sample document (with one pre-attached visual) for a
 * brand-new user.
 *
 * Idempotent and guarded: it only seeds when the user has no documents at all,
 * so an existing user is never re-seeded and a user gets at most one sample,
 * even if this runs more than once. It is also best-effort — any failure is
 * swallowed (and logged) so a seeding hiccup can never block sign-up or first
 * login.
 */
export async function seedSampleDocument(userId: string): Promise<void> {
  try {
    // Guard: never re-seed a user who already has documents (existing accounts
    // or a previous seed). Include soft-deleted rows so a user who deleted the
    // sample is not re-seeded.
    const existing = await prisma.document.findFirst({
      where: { ownerId: userId },
      select: { id: true },
    });
    if (existing) {
      return;
    }

    const sampleVisual = FIXTURES.flowchart;

    await prisma.document.create({
      data: {
        title: SAMPLE_DOCUMENT_TITLE,
        content: SAMPLE_DOCUMENT_CONTENT,
        ownerId: userId,
        // Attach a document-level visual (anchorBlockId = null) so it renders in
        // the editor's right-hand visual panel out of the box.
        visuals: {
          create: {
            anchorBlockId: null,
            type: VISUAL_KIND_TO_PRISMA[sampleVisual.type],
            title: sampleVisual.title ?? null,
            data: sampleVisual as unknown as Prisma.InputJsonValue,
          },
        },
      },
    });
  } catch (error) {
    // Seeding is a nice-to-have; never let it break authentication.
    console.error("Failed to seed first-run sample document", error);
  }
}
