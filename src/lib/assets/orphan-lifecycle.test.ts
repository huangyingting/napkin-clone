import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  markOrphanedAssetIds,
  purgeExpiredAssetRows,
  selectOrphanAssetIds,
} from "@/lib/assets/orphan-lifecycle";

describe("selectOrphanAssetIds", () => {
  it("returns assets absent from the live reference set", () => {
    assert.deepEqual(
      selectOrphanAssetIds(new Set(["keep"]), [{ id: "keep" }, { id: "drop" }]),
      ["drop"],
    );
  });
});

describe("markOrphanedAssetIds", () => {
  it("soft-deletes only orphan ids through the supplied domain updater", async () => {
    const marked: string[] = [];
    const now = new Date("2026-01-01T00:00:00.000Z");

    const count = await markOrphanedAssetIds({
      domain: "slide",
      message: "assets marked as orphaned",
      logContext: { documentId: "doc1" },
      liveRefs: new Set(["active"]),
      liveAssets: [{ id: "active" }, { id: "orphan" }],
      now,
      async updateMany(args) {
        marked.push(...args.where.id.in);
        assert.equal(args.data.deletedAt, now);
        return { count: args.where.id.in.length };
      },
    });

    assert.equal(count, 1);
    assert.deepEqual(marked, ["orphan"]);
  });
});

describe("purgeExpiredAssetRows", () => {
  it("deletes storage first and keeps failed deletes in the DB", async () => {
    const deletedKeys: string[] = [];
    const deletedIds: string[] = [];

    const count = await purgeExpiredAssetRows({
      domain: "brand",
      message: "brand assets physically purged",
      logContext: {},
      expiredAssets: [
        { id: "ok", storageKey: "owner/ok.png" },
        { id: "fail", storageKey: "owner/fail.png" },
      ],
      storage: {
        async delete(key) {
          if (key.includes("fail")) throw new Error("boom");
          deletedKeys.push(key);
        },
      },
      async deleteMany(args) {
        deletedIds.push(...args.where.id.in);
        return { count: args.where.id.in.length };
      },
    });

    assert.equal(count, 1);
    assert.deepEqual(deletedKeys, ["owner/ok.png"]);
    assert.deepEqual(deletedIds, ["ok"]);
  });
});
