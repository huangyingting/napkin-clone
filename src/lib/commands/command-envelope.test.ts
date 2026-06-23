import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CURRENT_COMMAND_SCHEMA_VERSION,
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
    theme: "default",
    slides: slideIds.map((id, index) => ({
      id,
      index,
      title: `Slide ${index + 1}`,
      bullets: [],
      visualIds: [],
      layout: "blank",
      notes: "",
      theme: "default",
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
