import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveSourcePanelActions,
  resolveSourcePanelStatus,
} from "./source-panel-status";

test("standalone: no sourceRef at all", () => {
  const status = resolveSourcePanelStatus({
    hasSourceRef: false,
    unlinked: false,
  });
  assert.equal(status, "standalone");
  assert.deepEqual(resolveSourcePanelActions(status), {
    canUpdate: false,
    canUnlink: false,
    canRelink: false,
  });
});

test("linked + up to date: only unlink available", () => {
  const status = resolveSourcePanelStatus({
    hasSourceRef: true,
    unlinked: false,
  });
  assert.equal(status, "linked");
  assert.deepEqual(resolveSourcePanelActions(status), {
    canUpdate: false,
    canUnlink: true,
    canRelink: false,
  });
});

test("stale (content changed): update + unlink, no relink", () => {
  const status = resolveSourcePanelStatus({
    hasSourceRef: true,
    unlinked: false,
    staleReason: "content_changed",
  });
  assert.equal(status, "stale");
  assert.deepEqual(resolveSourcePanelActions(status), {
    canUpdate: true,
    canUnlink: true,
    canRelink: false,
  });
});

test("orphaned (block missing): unlink only, no dead update", () => {
  const status = resolveSourcePanelStatus({
    hasSourceRef: true,
    unlinked: false,
    staleReason: "block_missing",
  });
  assert.equal(status, "source_missing");
  assert.deepEqual(resolveSourcePanelActions(status), {
    canUpdate: false,
    canUnlink: true,
    canRelink: false,
  });
});

test("unlinked: relink only", () => {
  const status = resolveSourcePanelStatus({
    hasSourceRef: true,
    unlinked: true,
  });
  assert.equal(status, "unlinked");
  assert.deepEqual(resolveSourcePanelActions(status), {
    canUpdate: false,
    canUnlink: false,
    canRelink: true,
  });
});

test("unlinked wins even when a stale reason is also present", () => {
  const status = resolveSourcePanelStatus({
    hasSourceRef: true,
    unlinked: true,
    staleReason: "content_changed",
  });
  assert.equal(status, "unlinked");
});
