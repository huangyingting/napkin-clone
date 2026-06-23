/**
 * Pure shaping for the "Download my data" export (#162, #484).
 *
 * I/O-free so it can be unit-tested DOM-free: the route handler does the Prisma
 * reads and JSON serialization; this module decides the shape and is the single
 * source of truth for what an export contains. Keeping it pure also guarantees
 * we never accidentally include another user's data — the function only ever
 * sees the already-owner-scoped rows passed in.
 *
 * ---------------------------------------------------------------------------
 * Compliance boundary (issue #484)
 * ---------------------------------------------------------------------------
 *
 * The export is scoped to the **authenticated user** only. No other user's data
 * is ever included.  Specifically the export includes:
 *
 *   INCLUDED:
 *   - user profile (id, email, name, image, emailVerified, plan, createdAt)
 *   - documents owned by the user (not deleted) + their visuals
 *   - document versions for owned documents
 *   - workspaces owned by the user
 *   - workspace memberships where the user is a non-owner member
 *   - comments authored by the user (body, timestamps; document id for context)
 *   - tags owned by the user
 *   - brands owned by the user (incl. logo/font asset references — ids only)
 *   - assets owned by the user via documents, workspaces, OR brands (metadata
 *     only — mimeType/byteSize/checksum/createdAt; NOT the raw file bytes)
 *   - active subscription (if any)
 *
 *   EXCLUDED:
 *   - other users' data (docs, comments, profiles)
 *   - soft-deleted documents (deletedAt != null)
 *   - raw file bytes for assets, including brand logo/font bytes (referenced by
 *     storageKey / asset id, never inlined)
 *   - Stripe webhook events, rate-limit hits, and other operational tables
 *   - invite-link tokens (security — tokens are not user data)
 *
 * The export is a point-in-time snapshot; real-time consistency within a
 * single request is the responsibility of the caller (route handler). Dates
 * are normalized to ISO 8601 UTC strings for portability.
 */

export const ACCOUNT_EXPORT_VERSION = 2;

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

interface ExportDocumentVersionInput {
  id: string;
  label: string | null;
  createdAt: Date;
}

export interface ExportDocumentInput {
  id: string;
  title: string;
  content: string;
  contentJson: unknown;
  deckJson: unknown;
  workspaceId: string | null;
  isShared: boolean;
  createdAt: Date;
  updatedAt: Date;
  visuals: ExportVisualInput[];
  versions: ExportDocumentVersionInput[];
}

export interface ExportWorkspaceInput {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExportMembershipInput {
  id: string;
  workspaceId: string;
  role: string;
  createdAt: Date;
}

export interface ExportCommentInput {
  id: string;
  documentId: string;
  body: string;
  resolved: boolean;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExportTagInput {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExportBrandInput {
  id: string;
  name: string;
  /** Asset reference for the brand logo, when set (Epic #496). Metadata only. */
  logoAssetId?: string | null;
  /** Asset reference for the brand font, when set (Epic #496). Metadata only. */
  fontAssetId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExportAssetInput {
  id: string;
  mimeType: string;
  byteSize: number;
  checksum: string;
  createdAt: Date;
}

export interface ExportSubscriptionInput {
  id: string;
  plan: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountExport {
  exportVersion: number;
  exportedAt: string;
  /** Compliance scope: describes what is and is not included. */
  scope: {
    description: string;
    includedEntities: string[];
    excludedEntities: string[];
  };
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
    workspaceId: string | null;
    isShared: boolean;
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
    versions: Array<{
      id: string;
      label: string | null;
      createdAt: string;
    }>;
  }>;
  workspacesOwned: Array<{
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  }>;
  workspaceMemberships: Array<{
    id: string;
    workspaceId: string;
    role: string;
    createdAt: string;
  }>;
  comments: Array<{
    id: string;
    documentId: string;
    body: string;
    resolved: boolean;
    parentId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  tags: Array<{
    id: string;
    name: string;
    slug: string;
    createdAt: string;
    updatedAt: string;
  }>;
  brands: Array<{
    id: string;
    name: string;
    logoAssetId: string | null;
    fontAssetId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  assets: Array<{
    id: string;
    mimeType: string;
    byteSize: number;
    checksum: string;
    createdAt: string;
  }>;
  subscription: {
    id: string;
    plan: string;
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    createdAt: string;
    updatedAt: string;
  } | null;
}

const EXPORT_SCOPE: {
  description: string;
  includedEntities: string[];
  excludedEntities: string[];
} = {
  description:
    "Point-in-time snapshot of all data owned by or attributed to the authenticated user. " +
    "Scoped strictly to the requesting user — no other user's data is ever included.",
  includedEntities: [
    "user profile",
    "owned documents (non-deleted) + visuals + versions",
    "owned workspaces",
    "workspace memberships (non-owner member rows)",
    "authored comments",
    "owned tags",
    "owned brands (logo/font asset references — ids only)",
    "owned assets via documents/workspaces/brands (metadata only, not raw file bytes)",
    "active subscription",
  ],
  excludedEntities: [
    "soft-deleted documents",
    "other users' documents, comments, or profile data",
    "raw asset file bytes (incl. brand logo/font bytes)",
    "invite-link tokens",
    "Stripe webhook events",
    "operational rate-limit records",
  ],
};

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
  workspacesOwned: ExportWorkspaceInput[];
  workspaceMemberships: ExportMembershipInput[];
  comments: ExportCommentInput[];
  tags: ExportTagInput[];
  brands: ExportBrandInput[];
  assets: ExportAssetInput[];
  subscription: ExportSubscriptionInput | null;
  now: Date;
}): AccountExport {
  const {
    user,
    documents,
    workspacesOwned,
    workspaceMemberships,
    comments,
    tags,
    brands,
    assets,
    subscription,
    now,
  } = input;

  return {
    exportVersion: ACCOUNT_EXPORT_VERSION,
    exportedAt: now.toISOString(),
    scope: EXPORT_SCOPE,
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
      workspaceId: doc.workspaceId,
      isShared: doc.isShared,
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
      versions: doc.versions.map((ver) => ({
        id: ver.id,
        label: ver.label,
        createdAt: ver.createdAt.toISOString(),
      })),
    })),
    workspacesOwned: workspacesOwned.map((ws) => ({
      id: ws.id,
      name: ws.name,
      createdAt: ws.createdAt.toISOString(),
      updatedAt: ws.updatedAt.toISOString(),
    })),
    workspaceMemberships: workspaceMemberships.map((m) => ({
      id: m.id,
      workspaceId: m.workspaceId,
      role: m.role,
      createdAt: m.createdAt.toISOString(),
    })),
    comments: comments.map((c) => ({
      id: c.id,
      documentId: c.documentId,
      body: c.body,
      resolved: c.resolved,
      parentId: c.parentId,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
    tags: tags.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })),
    brands: brands.map((b) => ({
      id: b.id,
      name: b.name,
      logoAssetId: b.logoAssetId ?? null,
      fontAssetId: b.fontAssetId ?? null,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
    })),
    assets: assets.map((a) => ({
      id: a.id,
      mimeType: a.mimeType,
      byteSize: a.byteSize,
      checksum: a.checksum,
      createdAt: a.createdAt.toISOString(),
    })),
    subscription: subscription
      ? {
          id: subscription.id,
          plan: subscription.plan,
          status: subscription.status,
          currentPeriodStart: subscription.currentPeriodStart.toISOString(),
          currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          createdAt: subscription.createdAt.toISOString(),
          updatedAt: subscription.updatedAt.toISOString(),
        }
      : null,
  };
}
