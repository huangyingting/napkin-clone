import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isCurrentDocumentListRequest,
  isCurrentDocumentTrashOperation,
  nextDocumentListRequestSeq,
  recordDocumentTrashOperation,
} from "./document-list-async-ordering";

test("dashboard search sequencing drops older slow responses", () => {
  let current = 0;
  const slowRequest = nextDocumentListRequestSeq(current);
  current = slowRequest;
  const fastRequest = nextDocumentListRequestSeq(current);
  current = fastRequest;

  assert.equal(isCurrentDocumentListRequest(current, slowRequest), false);
  assert.equal(isCurrentDocumentListRequest(current, fastRequest), true);
});

test("dashboard clearing search invalidates capped/result responses", () => {
  let current = 0;
  const inFlightSearch = nextDocumentListRequestSeq(current);
  current = inFlightSearch;
  const clearRequest = nextDocumentListRequestSeq(current);
  current = clearRequest;

  assert.equal(isCurrentDocumentListRequest(current, inFlightSearch), false);
});

test("optimistic trash rollback only applies to the latest document operation", () => {
  const latestByDocument = new Map<string, number>();
  let current = 0;
  const deleteOp = recordDocumentTrashOperation(
    latestByDocument,
    "doc-1",
    current,
  );
  current = deleteOp;
  const restoreOp = recordDocumentTrashOperation(
    latestByDocument,
    "doc-1",
    current,
  );

  assert.equal(
    isCurrentDocumentTrashOperation(latestByDocument, "doc-1", deleteOp),
    false,
  );
  assert.equal(
    isCurrentDocumentTrashOperation(latestByDocument, "doc-1", restoreOp),
    true,
  );
});
