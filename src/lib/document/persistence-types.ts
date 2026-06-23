export type SaveDeckResult =
  | { ok: true; revisionToken: string }
  | { ok: "conflict"; serverRevisionToken: string | null }
  | { ok: false; error: string };

export type SaveDeckPatchResult =
  | { ok: true; revisionToken: string }
  | { ok: "conflict"; serverRevisionToken: string | null }
  | { ok: "fallback" }
  | { ok: false; error: string };

export type RestoredDocumentVersion = {
  documentId: string;
  contentJson: unknown;
};

export type DocumentVersionSummary = {
  id: string;
  createdAt: string;
  label: string | null;
  /** Display name of the user who triggered the snapshot, when known. */
  authorName: string | null;
  /** Whether this snapshot carries a presentation deck alongside the document. */
  hasDeck: boolean;
};

export type ShareSettings = {
  isShared: boolean;
  shareId: string | null;
  slug: string | null;
  shareUrl: string | null;
  /** ISO-8601 expiry, or `null` when the link never expires. */
  expiresAt: string | null;
  embedEnabled: boolean;
  presentEnabled: boolean;
};
