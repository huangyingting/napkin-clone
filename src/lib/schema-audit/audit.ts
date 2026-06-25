/**
 * Persisted-payload schema audit (#501).
 *
 * Pure, DB-free auditing of the persisted shapes that the runtime trusts:
 *  - `Document.deckJson`          → {@link safeParseDeck}
 *  - `Document.contentJson` visuals → {@link safeParseVisual} per visual node
 *  - `Visual.data`                → {@link safeParseVisual}
 *  - active `SourceRef` fields    → {@link validateSourceRef}
 *
 * The audit reports ONLY safe identifiers and an opaque validator reason — row
 * id / document id / schema area / failure reason — and NEVER any document
 * content. This module is the testable core; the CLI in
 * `src/scripts/audit-persisted-schema.ts` is a thin DB-reading wrapper.
 *
 * Why a separate module (no runtime compat layer): per AGENTS.md the runtime
 * render/export paths must not branch on superseded shapes. Detection of drift
 * lives here (audit); remediation is an explicit operator repair step and never
 * runs inside request handling.
 */

import { validateSourceRef } from "@/lib/presentation/deck-schema";
import { safeParseVisual } from "@/lib/visual/schema";
import { collectVisualNodes } from "@/lib/lexical/visual-nodes";
import {
  parsePlanLiteral,
  parseSubscriptionStatusLiteral,
  parseUsageLedgerStatusLiteral,
  parseWorkspaceRoleLiteral,
} from "@/lib/data-contracts/literals";
import { getPersistedJsonContract } from "@/lib/data-contracts/persisted-json";
import { isCurrentTagSlug } from "@/lib/data-contracts/prisma-row-mappers";

/** Schema areas the audit covers. */
export const SCHEMA_AREAS = [
  "Document.deckJson",
  "Document.contentJson:visual",
  "DocumentVersion.deckJson",
  "DocumentVersion.contentJson:visual",
  "Visual.data",
  "SourceRef",
  "Comment.anchor",
  "Tag.slug",
  "WorkspaceMember.role",
  "InviteLink.role",
  "InviteLinkUse.role",
  "User.plan",
  "Subscription.plan",
  "Subscription.status",
  "UsageLedgerEntry.status",
  "Asset.scope",
] as const;

export type SchemaArea = (typeof SCHEMA_AREAS)[number];

/**
 * A single schema violation. Carries ONLY safe identifiers and an opaque
 * validator reason — never document content.
 */
export interface SchemaViolation {
  area: SchemaArea;
  /** Document the violation belongs to (when known). */
  documentId?: string;
  /** Primary key of the offending row (when known). */
  rowId?: string;
  /** Anchor/visual id implicated (when known). */
  anchorId?: string;
  /** Opaque validator failure reason (describes schema, not content). */
  reason: string;
}

/** Minimal projection of a `Document` row needed for the audit. */
export interface DocumentAuditRow {
  id: string;
  deckJson: unknown;
  contentJson: unknown;
}

/** Minimal projection of a `Visual` row needed for the audit. */
export interface VisualAuditRow {
  id: string;
  documentId: string;
  data: unknown;
}

export interface DocumentVersionAuditRow {
  id: string;
  documentId: string;
  deckJson: unknown;
  contentJson: unknown;
}

export interface CommentAuditRow {
  id: string;
  documentId: string;
  anchorType?: string | null;
  anchorText?: string | null;
  anchorNodeId?: string | null;
  slideId?: string | null;
  elementId?: string | null;
  anchorGeometry?: unknown;
}

export interface TagAuditRow {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
}

export interface WorkspaceRoleAuditRow {
  id: string;
  role: string;
}

export interface UserPlanAuditRow {
  id: string;
  plan: string;
}

export interface SubscriptionAuditRow {
  id: string;
  plan: string;
  status: string;
}

export interface UsageLedgerAuditRow {
  id: string;
  status: string;
}

export interface AssetAuditRow {
  id: string;
  documentId: string | null;
  workspaceId: string | null;
  brandId: string | null;
  deletedAt?: Date | null;
}

export interface AuditInput {
  documents?: readonly DocumentAuditRow[];
  visuals?: readonly VisualAuditRow[];
  documentVersions?: readonly DocumentVersionAuditRow[];
  comments?: readonly CommentAuditRow[];
  tags?: readonly TagAuditRow[];
  workspaceMembers?: readonly WorkspaceRoleAuditRow[];
  inviteLinks?: readonly WorkspaceRoleAuditRow[];
  inviteLinkUses?: readonly WorkspaceRoleAuditRow[];
  users?: readonly UserPlanAuditRow[];
  subscriptions?: readonly SubscriptionAuditRow[];
  usageLedgerEntries?: readonly UsageLedgerAuditRow[];
  assets?: readonly AssetAuditRow[];
}

export interface AuditSummary {
  /** Total rows scanned. */
  scannedDocuments: number;
  scannedVisuals: number;
  scannedDocumentVersions: number;
  scannedComments: number;
  scannedTags: number;
  scannedWorkspaceMembers: number;
  scannedInviteLinks: number;
  scannedInviteLinkUses: number;
  scannedUsers: number;
  scannedSubscriptions: number;
  scannedUsageLedgerEntries: number;
  scannedAssets: number;
  /** Total violations found. */
  violations: number;
  /** Violation counts keyed by schema area. */
  byArea: Record<SchemaArea, number>;
}

export interface AuditReport {
  violations: SchemaViolation[];
  summary: AuditSummary;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function contractViolation(
  area: Extract<
    SchemaArea,
    | "Document.deckJson"
    | "Document.contentJson:visual"
    | "DocumentVersion.deckJson"
    | "DocumentVersion.contentJson:visual"
    | "Visual.data"
    | "Comment.anchor"
  >,
  value: unknown,
): string | null {
  const result = getPersistedJsonContract(area).validate(value);
  return result.success ? null : result.error;
}

/**
 * Collects active (`unlinked !== true`) `sourceRef` objects from a raw deck
 * JSON structure WITHOUT trusting the deck schema, so source-ref issues are
 * caught even when the surrounding deck fails to parse for unrelated reasons.
 */
function collectRawSourceRefs(rawDeck: unknown): unknown[] {
  const refs: unknown[] = [];
  if (!isRecord(rawDeck) || !Array.isArray(rawDeck.slides)) return refs;
  for (const slide of rawDeck.slides) {
    if (!isRecord(slide) || !Array.isArray(slide.elements)) continue;
    for (const element of slide.elements) {
      if (!isRecord(element)) continue;
      const ref = element.sourceRef;
      if (ref !== undefined && isRecord(ref) && ref.unlinked !== true) {
        refs.push(ref);
      }
    }
  }
  return refs;
}

/** Audits a single `Document.deckJson` value (deck + active source refs). */
export function auditDocumentDeck(row: DocumentAuditRow): SchemaViolation[] {
  const violations: SchemaViolation[] = [];
  if (row.deckJson == null) return violations;

  const deckError = contractViolation("Document.deckJson", row.deckJson);
  if (deckError) {
    violations.push({
      area: "Document.deckJson",
      documentId: row.id,
      rowId: row.id,
      reason: deckError,
    });
  }

  // Independently validate every active source ref.
  collectRawSourceRefs(row.deckJson).forEach((ref, index) => {
    try {
      validateSourceRef(ref, `Document.deckJson sourceRef[${index}]`);
    } catch (error) {
      violations.push({
        area: "SourceRef",
        documentId: row.id,
        rowId: row.id,
        reason: error instanceof Error ? error.message : "Invalid source ref",
      });
    }
  });

  return violations;
}

/** Audits every embedded visual node inside a `Document.contentJson` value. */
export function auditDocumentContentVisuals(
  row: DocumentAuditRow,
): SchemaViolation[] {
  const violations: SchemaViolation[] = [];
  if (row.contentJson == null) return violations;

  for (const node of collectVisualNodes(row.contentJson)) {
    const result = safeParseVisual(node.visual);
    if (!result.success) {
      violations.push({
        area: "Document.contentJson:visual",
        documentId: row.id,
        rowId: row.id,
        anchorId: node.visualId,
        reason: result.error,
      });
    }
  }

  return violations;
}

/** Audits a single `Visual.data` row. */
export function auditVisualRow(row: VisualAuditRow): SchemaViolation[] {
  const result = contractViolation("Visual.data", row.data);
  if (!result) return [];
  return [
    {
      area: "Visual.data",
      documentId: row.documentId,
      rowId: row.id,
      reason: result,
    },
  ];
}

export function auditDocumentVersionRow(
  row: DocumentVersionAuditRow,
): SchemaViolation[] {
  const violations: SchemaViolation[] = [];
  if (row.deckJson != null) {
    const deckError = contractViolation(
      "DocumentVersion.deckJson",
      row.deckJson,
    );
    if (deckError) {
      violations.push({
        area: "DocumentVersion.deckJson",
        documentId: row.documentId,
        rowId: row.id,
        reason: deckError,
      });
    }
  }
  if (row.contentJson != null) {
    for (const node of collectVisualNodes(row.contentJson)) {
      const result = safeParseVisual(node.visual);
      if (!result.success) {
        violations.push({
          area: "DocumentVersion.contentJson:visual",
          documentId: row.documentId,
          rowId: row.id,
          anchorId: node.visualId,
          reason: result.error,
        });
      }
    }
  }
  return violations;
}

export function auditCommentAnchor(row: CommentAuditRow): SchemaViolation[] {
  const result = contractViolation("Comment.anchor", row);
  return result
    ? [
        {
          area: "Comment.anchor",
          documentId: row.documentId,
          rowId: row.id,
          reason: result,
        },
      ]
    : [];
}

export function auditTagSlug(row: TagAuditRow): SchemaViolation[] {
  if (isCurrentTagSlug(row.name, row.slug)) return [];
  return [
    {
      area: "Tag.slug",
      rowId: row.id,
      reason: "Tag slug must be derived from the current normalized tag name.",
    },
  ];
}

function auditWorkspaceRole(
  area: Extract<
    SchemaArea,
    "WorkspaceMember.role" | "InviteLink.role" | "InviteLinkUse.role"
  >,
  row: WorkspaceRoleAuditRow,
): SchemaViolation[] {
  const role = parseWorkspaceRoleLiteral(row.role);
  return role.success ? [] : [{ area, rowId: row.id, reason: role.error }];
}

export function auditUserPlan(row: UserPlanAuditRow): SchemaViolation[] {
  const plan = parsePlanLiteral(row.plan);
  return plan.success
    ? []
    : [{ area: "User.plan", rowId: row.id, reason: plan.error }];
}

export function auditSubscription(
  row: SubscriptionAuditRow,
): SchemaViolation[] {
  const violations: SchemaViolation[] = [];
  const plan = parsePlanLiteral(row.plan);
  if (!plan.success) {
    violations.push({
      area: "Subscription.plan",
      rowId: row.id,
      reason: plan.error,
    });
  }
  const status = parseSubscriptionStatusLiteral(row.status);
  if (!status.success) {
    violations.push({
      area: "Subscription.status",
      rowId: row.id,
      reason: status.error,
    });
  }
  return violations;
}

export function auditUsageLedgerEntry(
  row: UsageLedgerAuditRow,
): SchemaViolation[] {
  const status = parseUsageLedgerStatusLiteral(row.status);
  return status.success
    ? []
    : [
        {
          area: "UsageLedgerEntry.status",
          rowId: row.id,
          reason: status.error,
        },
      ];
}

export function auditAssetScope(row: AssetAuditRow): SchemaViolation[] {
  const scopeCount = [row.documentId, row.workspaceId, row.brandId].filter(
    (value) => value != null,
  ).length;
  const deleted = row.deletedAt != null;
  if ((deleted && scopeCount <= 1) || (!deleted && scopeCount === 1)) {
    return [];
  }
  return [
    {
      area: "Asset.scope",
      rowId: row.id,
      reason: deleted
        ? "Deleted asset rows may have at most one scope."
        : "Active asset rows must have exactly one document, workspace, or brand scope.",
    },
  ];
}

function emptyByArea(): Record<SchemaArea, number> {
  return {
    "Document.deckJson": 0,
    "Document.contentJson:visual": 0,
    "DocumentVersion.deckJson": 0,
    "DocumentVersion.contentJson:visual": 0,
    "Visual.data": 0,
    SourceRef: 0,
    "Comment.anchor": 0,
    "Tag.slug": 0,
    "WorkspaceMember.role": 0,
    "InviteLink.role": 0,
    "InviteLinkUse.role": 0,
    "User.plan": 0,
    "Subscription.plan": 0,
    "Subscription.status": 0,
    "UsageLedgerEntry.status": 0,
    "Asset.scope": 0,
  };
}

/**
 * Runs the full audit over in-memory row arrays and returns the violations plus
 * a summary. Pure — callers (CLI, tests) supply the rows.
 */
export function auditRows(input: AuditInput): AuditReport {
  const documents = input.documents ?? [];
  const visuals = input.visuals ?? [];
  const documentVersions = input.documentVersions ?? [];
  const comments = input.comments ?? [];
  const tags = input.tags ?? [];
  const workspaceMembers = input.workspaceMembers ?? [];
  const inviteLinks = input.inviteLinks ?? [];
  const inviteLinkUses = input.inviteLinkUses ?? [];
  const users = input.users ?? [];
  const subscriptions = input.subscriptions ?? [];
  const usageLedgerEntries = input.usageLedgerEntries ?? [];
  const assets = input.assets ?? [];
  const violations: SchemaViolation[] = [];

  for (const doc of documents) {
    violations.push(...auditDocumentDeck(doc));
    violations.push(...auditDocumentContentVisuals(doc));
  }
  for (const visual of visuals) {
    violations.push(...auditVisualRow(visual));
  }
  for (const version of documentVersions) {
    violations.push(...auditDocumentVersionRow(version));
  }
  for (const comment of comments) {
    violations.push(...auditCommentAnchor(comment));
  }
  for (const tag of tags) {
    violations.push(...auditTagSlug(tag));
  }
  for (const member of workspaceMembers) {
    violations.push(...auditWorkspaceRole("WorkspaceMember.role", member));
  }
  for (const link of inviteLinks) {
    violations.push(...auditWorkspaceRole("InviteLink.role", link));
  }
  for (const use of inviteLinkUses) {
    violations.push(...auditWorkspaceRole("InviteLinkUse.role", use));
  }
  for (const user of users) {
    violations.push(...auditUserPlan(user));
  }
  for (const subscription of subscriptions) {
    violations.push(...auditSubscription(subscription));
  }
  for (const entry of usageLedgerEntries) {
    violations.push(...auditUsageLedgerEntry(entry));
  }
  for (const asset of assets) {
    violations.push(...auditAssetScope(asset));
  }

  const byArea = emptyByArea();
  for (const violation of violations) {
    byArea[violation.area] += 1;
  }

  return {
    violations,
    summary: {
      scannedDocuments: documents.length,
      scannedVisuals: visuals.length,
      scannedDocumentVersions: documentVersions.length,
      scannedComments: comments.length,
      scannedTags: tags.length,
      scannedWorkspaceMembers: workspaceMembers.length,
      scannedInviteLinks: inviteLinks.length,
      scannedInviteLinkUses: inviteLinkUses.length,
      scannedUsers: users.length,
      scannedSubscriptions: subscriptions.length,
      scannedUsageLedgerEntries: usageLedgerEntries.length,
      scannedAssets: assets.length,
      violations: violations.length,
      byArea,
    },
  };
}

/**
 * Formats an audit report as human-readable lines (safe identifiers only).
 * Used by the CLI; kept here so the format is unit-testable and guaranteed not
 * to interpolate document content.
 */
export function formatAuditReport(report: AuditReport): string[] {
  const lines: string[] = [];
  lines.push(
    `Scanned ${report.summary.scannedDocuments} document(s), ` +
      `${report.summary.scannedVisuals} visual(s), ` +
      `${report.summary.scannedDocumentVersions} document version(s), ` +
      `${report.summary.scannedComments} comment(s), ` +
      `${report.summary.scannedTags} tag(s), ` +
      `${report.summary.scannedAssets} asset(s).`,
  );
  if (report.violations.length === 0) {
    lines.push("No schema violations found.");
    return lines;
  }
  lines.push(`Found ${report.summary.violations} violation(s):`);
  for (const v of report.violations) {
    const ids = [
      v.documentId ? `document=${v.documentId}` : null,
      v.rowId && v.rowId !== v.documentId ? `row=${v.rowId}` : null,
      v.anchorId ? `anchor=${v.anchorId}` : null,
    ]
      .filter(Boolean)
      .join(" ");
    lines.push(`  [${v.area}] ${ids} — ${v.reason}`);
  }
  for (const area of SCHEMA_AREAS) {
    const count = report.summary.byArea[area];
    if (count > 0) lines.push(`  · ${area}: ${count}`);
  }
  return lines;
}
