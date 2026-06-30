import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveVisualPanelActions,
  resolveVisualPanelStatus,
} from "./visual-panel-status";

test("standalone: no sourceRef at all", () => {
  const status = resolveVisualPanelStatus({
    hasSourceRef: false,
    unlinked: false,
  });
  assert.equal(status, "standalone");
  assert.deepEqual(resolveVisualPanelActions(status), {
    canUpdate: false,
    canUnlink: false,
    canRelink: false,
  });
});

test("linked + up to date: only unlink available", () => {
  const status = resolveVisualPanelStatus({
    hasSourceRef: true,
    unlinked: false,
  });
  assert.equal(status, "linked");
  assert.deepEqual(resolveVisualPanelActions(status), {
    canUpdate: false,
    canUnlink: true,
    canRelink: false,
  });
});

test("stale (content changed): update + unlink, no relink", () => {
  const status = resolveVisualPanelStatus({
    hasSourceRef: true,
    unlinked: false,
    staleReason: "content_changed",
  });
  assert.equal(status, "stale");
  assert.deepEqual(resolveVisualPanelActions(status), {
    canUpdate: true,
    canUnlink: true,
    canRelink: false,
  });
});

test("orphaned (block missing): unlink only, no dead update", () => {
  const status = resolveVisualPanelStatus({
    hasSourceRef: true,
    unlinked: false,
    staleReason: "block_missing",
  });
  assert.equal(status, "visual_missing");
  assert.deepEqual(resolveVisualPanelActions(status), {
    canUpdate: false,
    canUnlink: true,
    canRelink: false,
  });
});

test("unlinked: relink only", () => {
  const status = resolveVisualPanelStatus({
    hasSourceRef: true,
    unlinked: true,
  });
  assert.equal(status, "unlinked");
  assert.deepEqual(resolveVisualPanelActions(status), {
    canUpdate: false,
    canUnlink: false,
    canRelink: true,
  });
});

test("unlinked wins even when a stale reason is also present", () => {
  const status = resolveVisualPanelStatus({
    hasSourceRef: true,
    unlinked: true,
    staleReason: "content_changed",
  });
  assert.equal(status, "unlinked");
});
