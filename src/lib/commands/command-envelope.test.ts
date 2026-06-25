import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CURRENT_COMMAND_SCHEMA_VERSION,
  acceptDeckCommandEnvelope,
  adaptSlideCommandResult,
  makeSideEffects,
  validateCommandEnvelope,
  type CommandEnvelope,
} from "@/lib/commands/command-envelope";
import type { Deck } from "@/lib/presentation/deck";
import type { SlideCommand } from "@/lib/presentation/slide-commands";
import { executeCommand } from "@/lib/presentation/slide-commands";

const ACTOR = { id: "user-1", sessionId: "session-1" };
const BASE_TIMESTAMP = "2026-06-23T00:00:00.000Z";

function commandId(suffix: string): string {
  return `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
}

function makeDeck(slideIds: string[]): Deck {
  return {
    themeId: "default",
    slides: slideIds.map((id, index) => ({
      id,
      index,
      title: `Slide ${index + 1}`,
      bullets: [],
      visualIds: [],
      layout: "blank",
      notes: "",
      themeId: "default",
    })),
  };
}

test("validateCommandEnvelope accepts a valid visual envelope", () => {
  const envelope: CommandEnvelope = {
    id: commandId("1"),
    schemaVersion: CURRENT_COMMAND_SCHEMA_VERSION,
    type: "visual.set_style",
    timestamp: BASE_TIMESTAMP,
    actor: ACTOR,
    target: {
      surface: "visual",
      documentId: "doc-1",
      visualId: "vis-1",
      expectedRevision: "rev-1",
    },
    payload: {
      op: "visual.set_style",
      patch: { background: "#111111", fontWeight: 700 },
    },
    coalesceKey: "visual-style:vis-1",
    source: "user",
  };

  const validation = validateCommandEnvelope(envelope);
  assert.equal(validation.valid, true);
  assert.deepEqual(
    makeSideEffects(
      { kind: "render_invalidation", visualId: "vis-1" },
      { kind: "render_invalidation", visualId: "vis-1" },
      { kind: "visual_mirror_rebuild", visualId: "vis-1" },
    ),
    [
      { kind: "render_invalidation", visualId: "vis-1" },
      { kind: "visual_mirror_rebuild", visualId: "vis-1" },
    ],
  );
});

test("validateCommandEnvelope reports invalid ids, targets, and payload mismatches", () => {
  const invalid = {
    id: "not-a-uuid",
    schemaVersion: 0,
    type: "visual.set_style",
    timestamp: "not-a-date",
    actor: { id: "" },
    target: { surface: "visual" },
    payload: {
      op: "visual.set_node_style",
      nodeId: "n1",
      field: "fill",
      value: 42,
    },
  } as unknown as CommandEnvelope;

  const validation = validateCommandEnvelope(invalid);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes("UUID v4")));
  assert.ok(validation.errors.some((error) => error.includes("schemaVersion")));
  assert.ok(validation.errors.some((error) => error.includes("timestamp")));
  assert.ok(validation.errors.some((error) => error.includes("actor.id")));
  assert.ok(validation.errors.some((error) => error.includes("visualId")));
  assert.ok(
    validation.errors.some((error) => error.includes("payload.op must match")),
  );
});

test("validateCommandEnvelope accepts the new edge flip/toggle + label ops", () => {
  const base = {
    id: commandId("4"),
    schemaVersion: CURRENT_COMMAND_SCHEMA_VERSION,
    timestamp: BASE_TIMESTAMP,
    actor: ACTOR,
    target: { surface: "visual" as const, visualId: "vis-3" },
    source: "user" as const,
  };

  const payloads = [
    { op: "visual.flip_edge", edgeId: "e1" },
    { op: "visual.toggle_edge_directed", edgeId: "e1" },
    { op: "visual.toggle_edge_style", edgeId: "e1" },
    { op: "visual.set_edge_label", edgeId: "e1", label: "Yes" },
  ] as const;

  for (const payload of payloads) {
    const envelope = {
      ...base,
      type: payload.op,
      payload,
    } as unknown as CommandEnvelope;
    const validation = validateCommandEnvelope(envelope);
    assert.equal(validation.valid, true, `${payload.op} should validate`);
  }
});

test("validateCommandEnvelope rejects edge ops with a missing/blank edgeId", () => {
  const flip = {
    id: commandId("5"),
    schemaVersion: CURRENT_COMMAND_SCHEMA_VERSION,
    type: "visual.flip_edge",
    timestamp: BASE_TIMESTAMP,
    actor: ACTOR,
    target: { surface: "visual", visualId: "vis-3" },
    payload: { op: "visual.flip_edge", edgeId: "" },
    source: "user",
  } as unknown as CommandEnvelope;

  const flipValidation = validateCommandEnvelope(flip);
  assert.equal(flipValidation.valid, false);
  assert.ok(
    flipValidation.errors.some((error) => error.includes("payload.edgeId")),
  );

  const label = {
    id: commandId("6"),
    schemaVersion: CURRENT_COMMAND_SCHEMA_VERSION,
    type: "visual.set_edge_label",
    timestamp: BASE_TIMESTAMP,
    actor: ACTOR,
    target: { surface: "visual", visualId: "vis-3" },
    payload: { op: "visual.set_edge_label", edgeId: "e1", label: 7 },
    source: "user",
  } as unknown as CommandEnvelope;

  const labelValidation = validateCommandEnvelope(label);
  assert.equal(labelValidation.valid, false);
  assert.ok(
    labelValidation.errors.some((error) => error.includes("payload.label")),
  );
});

test("command envelopes remain JSON-serializable", () => {
  const envelope: CommandEnvelope = {
    id: commandId("2"),
    schemaVersion: CURRENT_COMMAND_SCHEMA_VERSION,
    type: "visual.set_effect",
    timestamp: BASE_TIMESTAMP,
    actor: ACTOR,
    target: { surface: "visual", visualId: "vis-2" },
    payload: {
      op: "visual.set_effect",
      effect: { kind: "shadow", dx: 4, dy: 6, blur: 8 },
    },
    source: "ai",
  };

  assert.deepEqual(JSON.parse(JSON.stringify(envelope)), envelope);
});

test("deck envelopes stay compatible with existing slide metadata", () => {
  const payload: SlideCommand = {
    type: "UPDATE_SLIDE_TITLE",
    slideId: "s1",
    title: "Reframed title",
    coalesceKey: "title:s1",
  };
  const envelope: CommandEnvelope<SlideCommand> = {
    id: commandId("3"),
    schemaVersion: CURRENT_COMMAND_SCHEMA_VERSION,
    type: "deck.slide_command",
    timestamp: BASE_TIMESTAMP,
    actor: ACTOR,
    target: { surface: "deck", documentId: "doc-9", slideId: "s1" },
    payload,
    coalesceKey: payload.coalesceKey,
    source: "user",
  };

  assert.equal(validateCommandEnvelope(envelope).valid, true);

  const deck = makeDeck(["s1"]);
  const result = executeCommand(deck, payload);
  const adapted = adaptSlideCommandResult(result, {
    documentId: envelope.target.documentId,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(adapted.affectedIds.documentIds, ["doc-9"]);
  assert.deepEqual(adapted.affectedIds.slideIds, ["s1"]);
  assert.equal(adapted.coalesceKey, "title:s1");
  assert.deepEqual(adapted.patches, result.patches);
});

// ---------------------------------------------------------------------------
// Server-side acceptance boundary (#508)
// ---------------------------------------------------------------------------

function deckEnvelope(
  payload: SlideCommand,
  overrides: Partial<CommandEnvelope<SlideCommand>> = {},
): CommandEnvelope<SlideCommand> {
  return {
    id: commandId("a"),
    schemaVersion: CURRENT_COMMAND_SCHEMA_VERSION,
    type: "deck.slide_command",
    timestamp: BASE_TIMESTAMP,
    actor: ACTOR,
    target: { surface: "deck", documentId: "doc-1" },
    payload,
    source: "user",
    ...overrides,
  };
}

const SOURCE_REF = {
  documentId: "doc-1",
  blockId: "blk-1",
  contentHash: "hash-1",
  linkedAt: BASE_TIMESTAMP,
  blockKind: "text" as const,
};

test("acceptDeckCommandEnvelope accepts a well-formed deck command for the target document", () => {
  const envelope = deckEnvelope({
    type: "UNLINK_ELEMENT_SOURCE",
    slideId: "s1",
    elementId: "el-1",
  });
  const acceptance = acceptDeckCommandEnvelope(envelope, {
    documentId: "doc-1",
  });
  assert.equal(acceptance.ok, true);
  assert.equal(acceptance.code, undefined);
  assert.deepEqual(acceptance.errors, []);
});

test("acceptDeckCommandEnvelope accepts source-ref commands carrying a valid sourceRef", () => {
  const refresh = deckEnvelope({
    type: "REFRESH_ELEMENT_FROM_SOURCE",
    slideId: "s1",
    elementId: "el-1",
    sourceRef: SOURCE_REF,
    text: "fresh",
  });
  const relink = deckEnvelope({
    type: "RELINK_ELEMENT_SOURCE",
    slideId: "s1",
    elementId: "el-1",
    sourceRef: { ...SOURCE_REF, blockId: "blk-2" },
  });
  assert.equal(
    acceptDeckCommandEnvelope(refresh, { documentId: "doc-1" }).ok,
    true,
  );
  assert.equal(
    acceptDeckCommandEnvelope(relink, { documentId: "doc-1" }).ok,
    true,
  );
});

test("acceptDeckCommandEnvelope rejects a source-ref command with a malformed sourceRef", () => {
  const envelope = deckEnvelope({
    type: "RELINK_ELEMENT_SOURCE",
    slideId: "s1",
    elementId: "el-1",
    // Missing required blockId / linkedAt and invalid blockKind.
    sourceRef: { documentId: "doc-1", blockKind: "bogus" },
  } as unknown as SlideCommand);
  const acceptance = acceptDeckCommandEnvelope(envelope, {
    documentId: "doc-1",
  });
  assert.equal(acceptance.ok, false);
  assert.equal(acceptance.code, "malformed");
  assert.ok(
    acceptance.errors.some((e) => e.includes("payload.sourceRef.blockId")),
  );
  assert.ok(
    acceptance.errors.some((e) => e.includes("payload.sourceRef.blockKind")),
  );
});

test("acceptDeckCommandEnvelope rejects a malformed envelope", () => {
  const bad = {
    id: "not-a-uuid",
    schemaVersion: CURRENT_COMMAND_SCHEMA_VERSION,
    type: "deck.slide_command",
    timestamp: BASE_TIMESTAMP,
    actor: ACTOR,
    target: { surface: "deck", documentId: "doc-1" },
    payload: { type: "UNLINK_ELEMENT_SOURCE", slideId: "s1" },
  } as unknown as CommandEnvelope<SlideCommand>;
  const acceptance = acceptDeckCommandEnvelope(bad, { documentId: "doc-1" });
  assert.equal(acceptance.ok, false);
  assert.equal(acceptance.code, "malformed");
  assert.ok(acceptance.errors.some((e) => e.includes("UUID v4")));
  assert.ok(acceptance.errors.some((e) => e.includes("elementId")));
});

test("acceptDeckCommandEnvelope rejects an unsupported (future) schema version", () => {
  const envelope = deckEnvelope(
    { type: "UNLINK_ELEMENT_SOURCE", slideId: "s1", elementId: "el-1" },
    { schemaVersion: CURRENT_COMMAND_SCHEMA_VERSION + 1 },
  );
  const acceptance = acceptDeckCommandEnvelope(envelope, {
    documentId: "doc-1",
  });
  assert.equal(acceptance.ok, false);
  assert.equal(acceptance.code, "unsupported_schema_version");
});

test("acceptDeckCommandEnvelope rejects an envelope addressed to the wrong surface", () => {
  const envelope = deckEnvelope(
    { type: "UNLINK_ELEMENT_SOURCE", slideId: "s1", elementId: "el-1" },
    { target: { surface: "document", documentId: "doc-1" } },
  );
  const acceptance = acceptDeckCommandEnvelope(envelope, {
    documentId: "doc-1",
  });
  assert.equal(acceptance.ok, false);
  assert.equal(acceptance.code, "wrong_target");
});

test("acceptDeckCommandEnvelope rejects an envelope addressed to a different document", () => {
  const envelope = deckEnvelope(
    { type: "UNLINK_ELEMENT_SOURCE", slideId: "s1", elementId: "el-1" },
    { target: { surface: "deck", documentId: "doc-OTHER" } },
  );
  const acceptance = acceptDeckCommandEnvelope(envelope, {
    documentId: "doc-1",
  });
  assert.equal(acceptance.ok, false);
  assert.equal(acceptance.code, "wrong_document");
  assert.ok(acceptance.errors.some((e) => e.includes("doc-OTHER")));
});
