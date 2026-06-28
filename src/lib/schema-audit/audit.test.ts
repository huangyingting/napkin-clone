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
  auditAssetScope,
  auditCommentAnchor,
  auditRows,
  auditDocumentDeck,
  auditDocumentVersionRow,
  auditSubscription,
  auditTagSlug,
  auditUsageLedgerEntry,
  auditUserPlan,
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
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    canvas: { format: "16:9" },
    design: { themeId: "indigo" },
    masters: [{ id: "master-default", name: "Default", elements: [] }],
    defaultMasterId: "master-default",
    slides: [
      {
        id: "s1",
        title: SECRET,
        index: 0,
        notes: "",
        elements: [],
      },
    ],
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

  test("flags a serialized-string Document.deckJson as a violation", () => {
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
    assert.match(v?.reason ?? "", /Deck must be an object/);
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

  test("ignores malformed or unlinked raw source refs while scanning decks", () => {
    const deck = {
      slides: [
        null,
        { elements: null },
        {
          elements: [
            null,
            { sourceRef: "not-an-object" },
            { sourceRef: { unlinked: true, blockId: SECRET } },
          ],
        },
      ],
    };

    const violations = auditDocumentDeck({
      id: "doc-source-ref-skip",
      deckJson: deck,
      contentJson: null,
    });

    assert.ok(violations.some((v) => v.area === "Document.deckJson"));
    assert.ok(!violations.some((v) => v.area === "SourceRef"));
  });

  test("audits invalid document-version decks and embedded visuals", () => {
    const violations = auditDocumentVersionRow({
      id: "version-1",
      documentId: "doc-versioned",
      deckJson: { not: "a deck" },
      contentJson: contentWithVisual({ version: 1, type: "not-current" }),
    });

    assert.ok(
      violations.some(
        (v) =>
          v.area === "DocumentVersion.deckJson" &&
          v.documentId === "doc-versioned" &&
          v.rowId === "version-1",
      ),
    );
    assert.ok(
      violations.some(
        (v) =>
          v.area === "DocumentVersion.contentJson:visual" &&
          v.anchorId === "vis-1",
      ),
    );
  });

  test("audits comment anchors, tag slugs, enums, and asset scopes", () => {
    assert.deepEqual(
      auditCommentAnchor({
        id: "comment-ok",
        documentId: "doc-1",
        anchorType: "text",
        anchorText: "Selected text",
      }),
      [],
    );
    assert.equal(
      auditCommentAnchor({
        id: "comment-bad",
        documentId: "doc-1",
        elementId: "element-1",
      })[0]?.area,
      "Comment.anchor",
    );

    assert.deepEqual(
      auditTagSlug({
        id: "tag-ok",
        ownerId: "owner-1",
        name: "Launch Plan",
        slug: "launch-plan",
      }),
      [],
    );
    assert.equal(
      auditTagSlug({
        id: "tag-bad",
        ownerId: "owner-1",
        name: "Launch Plan",
        slug: "old-slug",
      })[0]?.area,
      "Tag.slug",
    );

    assert.deepEqual(auditUserPlan({ id: "user-ok", plan: "free" }), []);
    assert.equal(
      auditUserPlan({ id: "user-bad", plan: "enterprise" })[0]?.area,
      "User.plan",
    );
    assert.deepEqual(
      auditSubscription({
        id: "sub-ok",
        plan: "plus",
        status: "active",
      }),
      [],
    );
    assert.deepEqual(
      auditSubscription({
        id: "sub-bad",
        plan: "enterprise",
        status: "paused",
      }).map((v) => v.area),
      ["Subscription.plan", "Subscription.status"],
    );
    assert.deepEqual(
      auditSubscription({
        id: "sub-bad-plan",
        plan: "enterprise",
        status: "active",
      }).map((v) => v.area),
      ["Subscription.plan"],
    );
    assert.deepEqual(
      auditSubscription({
        id: "sub-bad-status",
        plan: "plus",
        status: "paused",
      }).map((v) => v.area),
      ["Subscription.status"],
    );
    assert.deepEqual(
      auditUsageLedgerEntry({ id: "usage-ok", status: "captured" }),
      [],
    );
    assert.equal(
      auditUsageLedgerEntry({ id: "usage-bad", status: "pending" })[0]?.area,
      "UsageLedgerEntry.status",
    );

    assert.deepEqual(
      auditAssetScope({
        id: "asset-active",
        documentId: "doc-1",
        workspaceId: null,
        brandId: null,
      }),
      [],
    );
    assert.deepEqual(
      auditAssetScope({
        id: "asset-deleted",
        documentId: null,
        workspaceId: null,
        brandId: null,
        deletedAt: new Date("2026-06-25T00:00:00Z"),
      }),
      [],
    );
    assert.equal(
      auditAssetScope({
        id: "asset-unscoped",
        documentId: null,
        workspaceId: null,
        brandId: null,
      })[0]?.area,
      "Asset.scope",
    );
    assert.equal(
      auditAssetScope({
        id: "asset-deleted-multiscope",
        documentId: "doc-1",
        workspaceId: "workspace-1",
        brandId: null,
        deletedAt: new Date("2026-06-25T00:00:00Z"),
      })[0]?.reason,
      "Deleted asset rows may have at most one scope.",
    );
  });

  test("summarizes every audit input collection and role area", () => {
    const report = auditRows({
      documentVersions: [
        {
          id: "version-1",
          documentId: "doc-1",
          deckJson: null,
          contentJson: null,
        },
      ],
      comments: [{ id: "comment-1", documentId: "doc-1", anchorType: "bogus" }],
      tags: [
        {
          id: "tag-1",
          ownerId: "owner-1",
          name: "Roadmap",
          slug: "old",
        },
      ],
      workspaceMembers: [{ id: "member-1", role: "ADMIN" }],
      inviteLinks: [{ id: "invite-1", role: "ADMIN" }],
      inviteLinkUses: [{ id: "invite-use-1", role: "ADMIN" }],
      users: [{ id: "user-1", plan: "enterprise" }],
      subscriptions: [{ id: "sub-1", plan: "plus", status: "paused" }],
      usageLedgerEntries: [{ id: "usage-1", status: "pending" }],
      assets: [
        {
          id: "asset-1",
          documentId: null,
          workspaceId: null,
          brandId: null,
        },
      ],
    });

    assert.equal(report.summary.scannedDocumentVersions, 1);
    assert.equal(report.summary.scannedComments, 1);
    assert.equal(report.summary.scannedTags, 1);
    assert.equal(report.summary.scannedWorkspaceMembers, 1);
    assert.equal(report.summary.scannedInviteLinks, 1);
    assert.equal(report.summary.scannedInviteLinkUses, 1);
    assert.equal(report.summary.scannedUsers, 1);
    assert.equal(report.summary.scannedSubscriptions, 1);
    assert.equal(report.summary.scannedUsageLedgerEntries, 1);
    assert.equal(report.summary.scannedAssets, 1);
    assert.equal(report.summary.byArea["WorkspaceMember.role"], 1);
    assert.equal(report.summary.byArea["InviteLink.role"], 1);
    assert.equal(report.summary.byArea["InviteLinkUse.role"], 1);
    assert.equal(report.summary.byArea["Subscription.status"], 1);
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

  test("formatAuditReport includes safe row and anchor identifiers", () => {
    const lines = formatAuditReport(
      auditRows({
        documents: [
          {
            id: "doc-1",
            deckJson: null,
            contentJson: contentWithVisual({ type: "bogus" }),
          },
        ],
      }),
    );

    assert.ok(lines.some((l) => l.includes("Found 1 violation")));
    assert.ok(
      lines.some((l) =>
        l.includes("[Document.contentJson:visual] document=doc-1 anchor=vis-1"),
      ),
    );
    assert.ok(
      lines.some((l) => l.includes("· Document.contentJson:visual: 1")),
    );
  });
});
