import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCOUNT_EXPORT_VERSION,
  buildAccountExport,
} from "@/lib/account/export";

const NOW = new Date("2026-06-21T09:00:00.000Z");
const CREATED = new Date("2026-01-01T00:00:00.000Z");

const baseUser = {
  id: "user_1",
  email: "a@example.com",
  name: "Ada",
  image: null,
  emailVerified: null,
  plan: "free",
  createdAt: CREATED,
};

/** Minimal input with all new required fields set to empty arrays / null. */
function minimalInput() {
  return {
    user: baseUser,
    documents: [],
    workspacesOwned: [],
    workspaceMemberships: [],
    comments: [],
    tags: [],
    brands: [],
    assets: [],
    subscription: null,
    now: NOW,
  };
}

test("stamps the export version and a deterministic exportedAt", () => {
  const result = buildAccountExport(minimalInput());
  assert.equal(result.exportVersion, ACCOUNT_EXPORT_VERSION);
  assert.equal(result.exportedAt, NOW.toISOString());
});

test("export version is 2", () => {
  assert.equal(ACCOUNT_EXPORT_VERSION, 2);
});

test("includes a compliance scope block", () => {
  const result = buildAccountExport(minimalInput());
  assert.ok(result.scope, "should have scope field");
  assert.ok(typeof result.scope.description === "string");
  assert.ok(Array.isArray(result.scope.includedEntities));
  assert.ok(Array.isArray(result.scope.excludedEntities));
});

test("serializes all dates to ISO strings, preserving null emailVerified", () => {
  const result = buildAccountExport(minimalInput());
  assert.equal(result.user.createdAt, CREATED.toISOString());
  assert.equal(result.user.emailVerified, null);
});

test("serializes a verified timestamp when present", () => {
  const verifiedAt = new Date("2026-02-02T00:00:00.000Z");
  const result = buildAccountExport({
    ...minimalInput(),
    user: { ...baseUser, emailVerified: verifiedAt },
  });
  assert.equal(result.user.emailVerified, verifiedAt.toISOString());
});

test("maps documents and their nested visuals and versions", () => {
  const result = buildAccountExport({
    ...minimalInput(),
    documents: [
      {
        id: "doc_1",
        title: "Doc",
        content: "hello",
        contentJson: { a: 1 },
        deckJson: null,
        workspaceId: null,
        isShared: false,
        createdAt: CREATED,
        updatedAt: NOW,
        visuals: [
          {
            id: "vis_1",
            type: "chart",
            title: "Chart",
            anchorBlockId: "block_1",
            orderIndex: 0,
            data: { kind: "bar" },
            createdAt: CREATED,
            updatedAt: NOW,
          },
        ],
        versions: [
          {
            id: "ver_1",
            label: "v1",
            createdAt: CREATED,
          },
        ],
      },
    ],
  });

  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].id, "doc_1");
  assert.deepEqual(result.documents[0].contentJson, { a: 1 });
  assert.equal(result.documents[0].deckJson, null);
  assert.equal(result.documents[0].visuals.length, 1);
  assert.deepEqual(result.documents[0].visuals[0].data, { kind: "bar" });
  assert.equal(result.documents[0].visuals[0].createdAt, CREATED.toISOString());
  assert.equal(result.documents[0].versions.length, 1);
  assert.equal(result.documents[0].versions[0].id, "ver_1");
  assert.equal(result.documents[0].versions[0].label, "v1");
});

test("maps workspacesOwned", () => {
  const result = buildAccountExport({
    ...minimalInput(),
    workspacesOwned: [
      { id: "ws_1", name: "Team", createdAt: CREATED, updatedAt: NOW },
    ],
  });
  assert.equal(result.workspacesOwned.length, 1);
  assert.equal(result.workspacesOwned[0].id, "ws_1");
  assert.equal(result.workspacesOwned[0].name, "Team");
  assert.equal(result.workspacesOwned[0].createdAt, CREATED.toISOString());
});

test("maps workspaceMemberships", () => {
  const result = buildAccountExport({
    ...minimalInput(),
    workspaceMemberships: [
      { id: "mem_1", workspaceId: "ws_2", role: "EDITOR", createdAt: CREATED },
    ],
  });
  assert.equal(result.workspaceMemberships.length, 1);
  assert.equal(result.workspaceMemberships[0].role, "EDITOR");
});

test("maps comments", () => {
  const result = buildAccountExport({
    ...minimalInput(),
    comments: [
      {
        id: "c_1",
        documentId: "doc_1",
        body: "Nice doc",
        resolved: false,
        parentId: null,
        createdAt: CREATED,
        updatedAt: NOW,
      },
    ],
  });
  assert.equal(result.comments.length, 1);
  assert.equal(result.comments[0].body, "Nice doc");
});

test("maps tags", () => {
  const result = buildAccountExport({
    ...minimalInput(),
    tags: [
      {
        id: "tag_1",
        name: "design",
        slug: "design",
        createdAt: CREATED,
        updatedAt: NOW,
      },
    ],
  });
  assert.equal(result.tags.length, 1);
  assert.equal(result.tags[0].slug, "design");
});

test("maps brands", () => {
  const result = buildAccountExport({
    ...minimalInput(),
    brands: [
      { id: "brand_1", name: "Acme", createdAt: CREATED, updatedAt: NOW },
    ],
  });
  assert.equal(result.brands.length, 1);
  assert.equal(result.brands[0].name, "Acme");
});

test("maps assets (metadata only)", () => {
  const result = buildAccountExport({
    ...minimalInput(),
    assets: [
      {
        id: "asset_1",
        mimeType: "image/png",
        byteSize: 1024,
        checksum: "abc123",
        createdAt: CREATED,
      },
    ],
  });
  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].mimeType, "image/png");
  assert.equal(result.assets[0].byteSize, 1024);
});

test("subscription null when not present", () => {
  const result = buildAccountExport(minimalInput());
  assert.equal(result.subscription, null);
});

test("maps subscription when present", () => {
  const result = buildAccountExport({
    ...minimalInput(),
    subscription: {
      id: "sub_1",
      plan: "pro",
      status: "active",
      currentPeriodStart: CREATED,
      currentPeriodEnd: NOW,
      cancelAtPeriodEnd: false,
      createdAt: CREATED,
      updatedAt: NOW,
    },
  });
  assert.ok(result.subscription !== null);
  assert.equal(result.subscription!.plan, "pro");
  assert.equal(result.subscription!.status, "active");
  assert.equal(result.subscription!.cancelAtPeriodEnd, false);
});

test("produces a fully JSON-serializable object", () => {
  const result = buildAccountExport(minimalInput());
  assert.doesNotThrow(() => JSON.stringify(result));
});
