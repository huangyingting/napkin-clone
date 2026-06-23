/**
 * Persisted-payload schema audit CLI (#501).
 *
 * Thin DB-reading wrapper around the pure audit core in
 * `src/lib/schema-audit/audit.ts`. Connects via the app Prisma client (honoring
 * `DB_PROVIDER` / `DATABASE_URL`), scans every `Document.deckJson`, embedded
 * `Document.contentJson` visual, `Visual.data` row, and active `SourceRef`, and
 * reports violations using SAFE identifiers only (row id / document id / schema
 * area / failure reason) — never document content.
 *
 * Usage:
 *   node --import tsx src/scripts/audit-persisted-schema.ts            # summary, exit 0
 *   node --import tsx src/scripts/audit-persisted-schema.ts --ci       # exit 1 on any violation
 *   node --import tsx src/scripts/audit-persisted-schema.ts --json     # machine-readable JSON
 *
 * npm script: `npm run audit:schema -- [--ci] [--json]`.
 *
 * Run as part of the release gate (see docs/operations/release-gate.md) with
 * `--ci` so any persisted-schema drift blocks the release.
 */

import { prisma } from "@/lib/prisma";
import { resolveProvider } from "@/lib/db-provider";
import {
  auditRows,
  formatAuditReport,
  type DocumentAuditRow,
  type VisualAuditRow,
} from "@/lib/schema-audit/audit";

const PAGE_SIZE = 500;

async function loadDocuments(): Promise<DocumentAuditRow[]> {
  const rows: DocumentAuditRow[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await prisma.document.findMany({
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, deckJson: true, contentJson: true },
    });
    if (page.length === 0) break;
    for (const row of page) {
      rows.push({
        id: row.id,
        deckJson: row.deckJson,
        contentJson: row.contentJson,
      });
    }
    if (page.length < PAGE_SIZE) break;
    cursor = page[page.length - 1].id;
  }
  return rows;
}

async function loadVisuals(): Promise<VisualAuditRow[]> {
  const rows: VisualAuditRow[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await prisma.visual.findMany({
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, documentId: true, data: true },
    });
    if (page.length === 0) break;
    for (const row of page) {
      rows.push({ id: row.id, documentId: row.documentId, data: row.data });
    }
    if (page.length < PAGE_SIZE) break;
    cursor = page[page.length - 1].id;
  }
  return rows;
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const ci = args.has("--ci") || args.has("--strict");
  const json = args.has("--json");

  const [documents, visuals] = await Promise.all([
    loadDocuments(),
    loadVisuals(),
  ]);

  const report = auditRows({ documents, visuals });

  if (json) {
    console.log(
      JSON.stringify({ provider: resolveProvider(), ...report }, null, 2),
    );
  } else {
    console.log(`Persisted schema audit (provider: ${resolveProvider()})`);
    for (const line of formatAuditReport(report)) {
      console.log(line);
    }
  }

  if (ci && report.summary.violations > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(
      `Schema audit failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
