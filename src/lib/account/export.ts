/**
 * Pure shaping for the "Download my data" export (#162).
 *
 * I/O-free so it can be unit-tested DOM-free: the route handler does the Prisma
 * reads and JSON serialization; this module decides the shape and is the single
 * source of truth for what an export contains. Keeping it pure also guarantees
 * we never accidentally include another user's data — the function only ever
 * sees the already-owner-scoped rows passed in.
 */

export const ACCOUNT_EXPORT_VERSION = 1;

export interface ExportUserInput {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: Date | null;
  plan: string;
  createdAt: Date;
}

interface ExportVisualInput {
  id: string;
  type: string;
  title: string | null;
  anchorBlockId: string | null;
  orderIndex: number;
  data: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExportDocumentInput {
  id: string;
  title: string;
  content: string;
  contentJson: unknown;
  deckJson: unknown;
  createdAt: Date;
  updatedAt: Date;
  visuals: ExportVisualInput[];
}

export interface AccountExport {
  exportVersion: number;
  exportedAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    emailVerified: string | null;
    plan: string;
    createdAt: string;
  };
  documents: Array<{
    id: string;
    title: string;
    content: string;
    contentJson: unknown;
    deckJson: unknown;
    createdAt: string;
    updatedAt: string;
    visuals: Array<{
      id: string;
      type: string;
      title: string | null;
      anchorBlockId: string | null;
      orderIndex: number;
      data: unknown;
      createdAt: string;
      updatedAt: string;
    }>;
  }>;
}

/** Serializes a Date to ISO, preserving null. */
function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

/**
 * Builds a self-contained JSON-serializable snapshot of the user's account and
 * content. Dates are normalized to ISO strings so the output is stable and
 * portable. `now` is injected so the export timestamp is deterministic in tests.
 */
export function buildAccountExport(input: {
  user: ExportUserInput;
  documents: ExportDocumentInput[];
  now: Date;
}): AccountExport {
  const { user, documents, now } = input;

  return {
    exportVersion: ACCOUNT_EXPORT_VERSION,
    exportedAt: now.toISOString(),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      emailVerified: iso(user.emailVerified),
      plan: user.plan,
      createdAt: user.createdAt.toISOString(),
    },
    documents: documents.map((doc) => ({
      id: doc.id,
      title: doc.title,
      content: doc.content,
      contentJson: doc.contentJson ?? null,
      deckJson: doc.deckJson ?? null,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      visuals: doc.visuals.map((v) => ({
        id: v.id,
        type: v.type,
        title: v.title,
        anchorBlockId: v.anchorBlockId,
        orderIndex: v.orderIndex,
        data: v.data ?? null,
        createdAt: v.createdAt.toISOString(),
        updatedAt: v.updatedAt.toISOString(),
      })),
    })),
  };
}
