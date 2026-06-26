import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DASHBOARD_DOCUMENT_CARD_SELECT,
  listDashboardDocumentsForUser,
  searchDocumentsForUser,
} from "@/lib/document/list";

test("dashboard card select stays skinny and excludes heavy document JSON", () => {
  const select = DASHBOARD_DOCUMENT_CARD_SELECT as Record<string, unknown>;
  assert.equal(select.contentJson, undefined);
  assert.equal(select.deckJson, undefined);
  assert.equal(select.collabRecoverySnapshot, undefined);
  assert.equal(select.content, true);
  assert.deepEqual((select.visuals as { select: unknown }).select, {
    data: true,
  });
});

test("dashboard list uses two capped document queries plus tags only", async () => {
  const documentCalls: unknown[] = [];
  const tagCalls: unknown[] = [];
  const db = {
    document: {
      async findMany(args: unknown) {
        documentCalls.push(args);
        return [];
      },
    },
    tag: {
      async findMany(args: unknown) {
        tagCalls.push(args);
        return [];
      },
    },
  };

  const result = await listDashboardDocumentsForUser("user-1", {}, db as never);

  assert.equal(result.documents.length, 0);
  assert.equal(documentCalls.length, 2);
  assert.equal(tagCalls.length, 1);
  for (const call of documentCalls as Array<{
    select: Record<string, unknown>;
  }>) {
    assert.equal(call.select.contentJson, undefined);
    assert.equal(call.select.deckJson, undefined);
    assert.equal(call.select.content, true);
  }
});

test("dashboard search uses one skinny accessible document query", async () => {
  const calls: unknown[] = [];
  const db = {
    document: {
      async findMany(args: unknown) {
        calls.push(args);
        return [];
      },
    },
  };

  const result = await searchDocumentsForUser("user-1", "report", db as never);

  assert.deepEqual(result, { results: [], hasMore: false });
  assert.equal(calls.length, 1);
  const select = (calls[0] as { select: Record<string, unknown> }).select;
  assert.equal(select.contentJson, undefined);
  assert.equal(select.deckJson, undefined);
  assert.equal(select.content, true);
});
