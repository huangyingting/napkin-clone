import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Prisma } from "@/generated/prisma/client";
import { snapshotDocumentVersion } from "@/lib/document/persistence/helpers";

type SnapshotTx = Prisma.TransactionClient & {
  created: unknown[];
  deleted: unknown[];
  findManyCalls: number;
};

function makeSnapshotTx(options: {
  last?: { createdAt: Date; contentJson: unknown; deckJson: unknown } | null;
  doc?: { contentJson: unknown; deckJson: unknown } | null;
  ids?: string[];
}): SnapshotTx {
  const created: unknown[] = [];
  const deleted: unknown[] = [];
  const tx = {
    documentVersion: {
      async findFirst() {
        return options.last ?? null;
      },
      async create(args: unknown) {
        created.push(args);
        return {};
      },
      async findMany() {
        tx.findManyCalls += 1;
        return (options.ids ?? []).map((id) => ({ id }));
      },
      async deleteMany(args: unknown) {
        deleted.push(args);
        return {};
      },
    },
    document: {
      async findUnique() {
        return options.doc ?? null;
      },
    },
    created,
    deleted,
    findManyCalls: 0,
  };
  return tx as unknown as SnapshotTx;
}

describe("snapshotDocumentVersion helper coverage", () => {
  it("skips duplicate snapshots using stable JSON key order", async () => {
    const tx = makeSnapshotTx({
      last: {
        createdAt: new Date("2000-01-01T00:00:00.000Z"),
        contentJson: { b: 2, a: [{ z: true, y: null }] },
        deckJson: { slides: [{ title: "One", id: "s1" }] },
      },
      doc: {
        contentJson: { a: [{ y: null, z: true }], b: 2 },
        deckJson: { slides: [{ id: "s1", title: "One" }] },
      },
    });

    await snapshotDocumentVersion("doc-duplicate", { tx });

    assert.deepEqual(tx.created, []);
    assert.equal(tx.findManyCalls, 0);
  });

  it("uses the supplied transaction and normalizes null deck JSON", async () => {
    const tx = makeSnapshotTx({
      doc: { contentJson: { root: { children: [] } }, deckJson: null },
      ids: ["v-new"],
    });

    await snapshotDocumentVersion("doc-new", {
      tx,
      force: true,
      userId: "user-1",
      label: "Manual save",
    });

    assert.equal(tx.created.length, 1);
    assert.deepEqual(tx.created[0], {
      data: {
        documentId: "doc-new",
        contentJson: { root: { children: [] } },
        deckJson: Prisma.DbNull,
        label: "Manual save",
        createdById: "user-1",
      },
    });
    assert.equal(tx.findManyCalls, 1);
    assert.deepEqual(tx.deleted, []);
  });
});
