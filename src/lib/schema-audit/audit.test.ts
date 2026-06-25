/**
 * Tests for the persisted-payload schema audit core (#501).
 *
 * The audit must (a) detect violations across all four schema areas and
 * (b) NEVER include document content in its output — only safe identifiers and
 * the opaque validator reason. Both properties are asserted here.
 */

import assert from "node:assert/strict";
import { test, describe } from "node:test";

import { CURRENT_DECK_SCHEMA_VERSION } from "@/lib/presentation/deck";
import {
  auditRows,
  auditDocumentDeck,
  formatAuditReport,
  type DocumentAuditRow,
  type VisualAuditRow,
} from "./audit";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SECRET = "TopSecretConfidentialBodyText";

function validDeck(): unknown {
  return {
    slides: [
      {
        id: "s1",
        title: SECRET,
        bullets: [],
        index: 0,
        visualIds: [],
        layout: "content",
        notes: "",
        themeId: "indigo",
        elements: [],
      },
    ],
    themeId: "indigo",
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
  };
}

function validVisual(): unknown {
  return {
    version: 1,
    type: "flowchart",
    width: 760,
    height: 480,
    nodes: [{ id: "n1", label: SECRET }],
    edges: [],
  };
}

function contentWithVisual(visual: unknown): unknown {
  return {
    root: {
      children: [{ type: "visual", visualId: "vis-1", visual }],
      direction: "ltr",
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  };
}

// ---------------------------------------------------------------------------
// Valid rows
// ---------------------------------------------------------------------------

describe("auditRows — valid rows", () => {
  test("reports no violations for valid documents and visuals", () => {
    const documents: DocumentAuditRow[] = [
      {
        id: "doc-1",
        deckJson: validDeck(),
        contentJson: contentWithVisual(validVisual()),
      },
    ];
    const visuals: VisualAuditRow[] = [
      { id: "v-1", documentId: "doc-1", data: validVisual() },
    ];
    const report = auditRows({ documents, visuals });
    assert.equal(report.summary.violations, 0);
    assert.equal(report.summary.scannedDocuments, 1);
    assert.equal(report.summary.scannedVisuals, 1);
  });

  test("null deckJson / contentJson are skipped, not flagged", () => {
    const report = auditRows({
      documents: [{ id: "doc-1", deckJson: null, contentJson: null }],
    });
    assert.equal(report.summary.violations, 0);
  });
});

// ---------------------------------------------------------------------------
// Invalid rows — one per schema area
// ---------------------------------------------------------------------------

describe("auditRows — invalid rows", () => {
  test("flags an invalid Document.deckJson", () => {
    const report = auditRows({
      documents: [
        {
          id: "doc-bad",
          deckJson: { not: "a deck", body: SECRET },
          contentJson: null,
        },
      ],
    });
    const v = report.violations.find((x) => x.area === "Document.deckJson");
    assert.ok(v);
    assert.equal(v?.documentId, "doc-bad");
  });

  test("flags serialized string Document.deckJson as persisted-schema drift", () => {
    const report = auditRows({
      documents: [
        {
          id: "doc-string",
          deckJson: JSON.stringify(validDeck()),
          contentJson: null,
        },
      ],
    });
    const v = report.violations.find((x) => x.area === "Document.deckJson");
    assert.ok(v);
    assert.equal(v?.documentId, "doc-string");
    assert.match(v?.reason ?? "", /persisted-schema drift/);
    assert.match(v?.reason ?? "", /parsed JSON object/);
    assert.equal(report.summary.byArea["Document.deckJson"], 1);
  });

  test("flags an invalid embedded content visual with its anchor id", () => {
    const report = auditRows({
      documents: [
        {
          id: "doc-1",
          deckJson: null,
          contentJson: contentWithVisual({
            version: 1,
            type: "not-a-real-kind",
            secret: SECRET,
          }),
        },
      ],
    });
    const v = report.violations.find(
      (x) => x.area === "Document.contentJson:visual",
    );
    assert.ok(v);
    assert.equal(v?.anchorId, "vis-1");
  });

  test("flags an invalid Visual.data row", () => {
    const report = auditRows({
      visuals: [{ id: "v-bad", documentId: "doc-1", data: { type: "nope" } }],
    });
    const v = report.violations.find((x) => x.area === "Visual.data");
    assert.ok(v);
    assert.equal(v?.rowId, "v-bad");
    assert.equal(v?.documentId, "doc-1");
  });

  test("flags an invalid active SourceRef inside a deck", () => {
    const deck = validDeck() as { slides: { elements: unknown[] }[] };
    deck.slides[0].elements = [
      {
        id: "e1",
        kind: "text",
        text: SECRET,
        box: { x: 0, y: 0, w: 1, h: 1 },
        zIndex: 0,
        sourceRef: {
          // missing documentId / linkedAt / blockKind → invalid
          blockId: "block-1",
        },
      },
    ];
    const violations = auditDocumentDeck({
      id: "doc-1",
      deckJson: deck,
      contentJson: null,
    });
    assert.ok(violations.some((v) => v.area === "SourceRef"));
  });

  test("counts violations by area in the summary", () => {
    const report = auditRows({
      documents: [
        { id: "doc-a", deckJson: { bad: 1 }, contentJson: null },
        { id: "doc-b", deckJson: { bad: 1 }, contentJson: null },
      ],
      visuals: [{ id: "v-x", documentId: "doc-a", data: { bad: 1 } }],
    });
    assert.equal(report.summary.byArea["Document.deckJson"], 2);
    assert.equal(report.summary.byArea["Visual.data"], 1);
    assert.equal(report.summary.violations, 3);
  });
});

// ---------------------------------------------------------------------------
// No-content-leak guarantee
// ---------------------------------------------------------------------------

describe("audit output never contains document content", () => {
  test("violations and formatted report exclude any body text", () => {
    const report = auditRows({
      documents: [
        {
          id: "doc-1",
          deckJson: { slides: SECRET, body: SECRET },
          contentJson: contentWithVisual({ type: "bogus", secret: SECRET }),
        },
      ],
      visuals: [
        { id: "v-1", documentId: "doc-1", data: { type: "bogus", x: SECRET } },
      ],
    });
    assert.ok(report.violations.length > 0);
    const serializedViolations = JSON.stringify(report.violations);
    assert.ok(
      !serializedViolations.includes(SECRET),
      "violations must not include document content",
    );
    const formatted = formatAuditReport(report).join("\n");
    assert.ok(
      !formatted.includes(SECRET),
      "formatted report must not include document content",
    );
  });

  test("formatAuditReport summarizes a clean scan", () => {
    const lines = formatAuditReport(
      auditRows({
        documents: [{ id: "d", deckJson: null, contentJson: null }],
      }),
    );
    assert.ok(lines.some((l) => l.includes("No schema violations found")));
  });
});
