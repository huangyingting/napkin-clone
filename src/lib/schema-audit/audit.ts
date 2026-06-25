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
 * lives here (audit) and remediation lives in the migration harness (#502);
 * neither runs inside request handling.
 */

import {
  safeParseDeck,
  validateSourceRef,
} from "@/lib/presentation/deck-schema";
import { safeParseVisual } from "@/lib/visual/schema";
import { collectVisualNodes } from "@/lib/lexical/visual-nodes";

/** Schema areas the audit covers. */
export const SCHEMA_AREAS = [
  "Document.deckJson",
  "Document.contentJson:visual",
  "Visual.data",
  "SourceRef",
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

export interface AuditInput {
  documents?: readonly DocumentAuditRow[];
  visuals?: readonly VisualAuditRow[];
}

export interface AuditSummary {
  /** Total rows scanned. */
  scannedDocuments: number;
  scannedVisuals: number;
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

  if (typeof row.deckJson === "string") {
    violations.push({
      area: "Document.deckJson",
      documentId: row.id,
      rowId: row.id,
      reason:
        "Serialized deck JSON strings are persisted-schema drift; deckJson must be a parsed JSON object.",
    });
    return violations;
  }

  const parsed = safeParseDeck(row.deckJson);
  if (!parsed.success) {
    violations.push({
      area: "Document.deckJson",
      documentId: row.id,
      rowId: row.id,
      reason: parsed.error,
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
  const result = safeParseVisual(row.data);
  if (result.success) return [];
  return [
    {
      area: "Visual.data",
      documentId: row.documentId,
      rowId: row.id,
      reason: result.error,
    },
  ];
}

function emptyByArea(): Record<SchemaArea, number> {
  return {
    "Document.deckJson": 0,
    "Document.contentJson:visual": 0,
    "Visual.data": 0,
    SourceRef: 0,
  };
}

/**
 * Runs the full audit over in-memory row arrays and returns the violations plus
 * a summary. Pure — callers (CLI, tests) supply the rows.
 */
export function auditRows(input: AuditInput): AuditReport {
  const documents = input.documents ?? [];
  const visuals = input.visuals ?? [];
  const violations: SchemaViolation[] = [];

  for (const doc of documents) {
    violations.push(...auditDocumentDeck(doc));
    violations.push(...auditDocumentContentVisuals(doc));
  }
  for (const visual of visuals) {
    violations.push(...auditVisualRow(visual));
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
      `${report.summary.scannedVisuals} visual(s).`,
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
