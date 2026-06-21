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

test("stamps the export version and a deterministic exportedAt", () => {
  const result = buildAccountExport({
    user: baseUser,
    documents: [],
    now: NOW,
  });
  assert.equal(result.exportVersion, ACCOUNT_EXPORT_VERSION);
  assert.equal(result.exportedAt, NOW.toISOString());
});

test("serializes all dates to ISO strings, preserving null emailVerified", () => {
  const result = buildAccountExport({
    user: baseUser,
    documents: [],
    now: NOW,
  });
  assert.equal(result.user.createdAt, CREATED.toISOString());
  assert.equal(result.user.emailVerified, null);
});

test("serializes a verified timestamp when present", () => {
  const verifiedAt = new Date("2026-02-02T00:00:00.000Z");
  const result = buildAccountExport({
    user: { ...baseUser, emailVerified: verifiedAt },
    documents: [],
    now: NOW,
  });
  assert.equal(result.user.emailVerified, verifiedAt.toISOString());
});

test("maps documents and their nested visuals", () => {
  const result = buildAccountExport({
    user: baseUser,
    documents: [
      {
        id: "doc_1",
        title: "Doc",
        content: "hello",
        contentJson: { a: 1 },
        deckJson: null,
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
      },
    ],
    now: NOW,
  });

  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].id, "doc_1");
  assert.deepEqual(result.documents[0].contentJson, { a: 1 });
  assert.equal(result.documents[0].deckJson, null);
  assert.equal(result.documents[0].visuals.length, 1);
  assert.deepEqual(result.documents[0].visuals[0].data, { kind: "bar" });
  assert.equal(result.documents[0].visuals[0].createdAt, CREATED.toISOString());
});

test("produces a fully JSON-serializable object", () => {
  const result = buildAccountExport({
    user: baseUser,
    documents: [],
    now: NOW,
  });
  assert.doesNotThrow(() => JSON.stringify(result));
});
