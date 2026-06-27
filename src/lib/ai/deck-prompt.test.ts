import assert from "node:assert/strict";
import test from "node:test";

import { buildDeckGenerationMessages } from "@/lib/ai/deck-prompt";
import { DECK_THEMES, SLIDE_LAYOUTS } from "@/lib/presentation/deck";

const INVENTORY = [
  {
    id: "vis-1",
    title: "Revenue chart",
    type: "chart",
    summary: "Quarterly revenue bars",
  },
  {
    id: "vis-2",
    title: "Process flow",
    type: "flowchart",
    summary: "Onboarding steps",
  },
];

test("returns a system + user ChatMessage pair", () => {
  const messages = buildDeckGenerationMessages({
    outline: "An outline",
    visualInventory: INVENTORY,
  });
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  assert.equal(messages[1].role, "user");
  for (const message of messages) {
    assert.equal(typeof message.content, "string");
    assert.ok(message.content.length > 0);
  }
});

test("system message states JSON-only, brevity, visual-id, and language rules", () => {
  const [system] = buildDeckGenerationMessages({
    outline: "An outline",
    visualInventory: INVENTORY,
  });
  const content = system.content;
  // JSON only / no fences.
  assert.match(content, /JSON ONLY/i);
  assert.match(content, /no code fences/i);
  // Brevity / one idea per slide / overflow to notes.
  assert.match(content, /ONE idea per slide/i);
  assert.match(content, /24 visible words/i);
  assert.match(content, /notes/i);
  // Visual id hard rule.
  assert.match(content, /visualId/);
  assert.match(content, /NEVER invent/i);
  // Language preservation.
  assert.match(content, /SAME LANGUAGE/i);
});

test("system message biases toward a vibrant theme (#281)", () => {
  const [system] = buildDeckGenerationMessages({
    outline: "An outline",
    visualInventory: INVENTORY,
  });
  const content = system.content;
  // Vibrant-theme guidance is present.
  assert.match(content, /VIBRANT theme/i);
  // Every theme is named in the guidance.
  for (const theme of DECK_THEMES) {
    assert.ok(
      content.includes(`"${theme}"`),
      `theme ${theme} missing from theme guidance`,
    );
  }
});

test("system message lists every layout and theme value", () => {
  const [system] = buildDeckGenerationMessages({
    outline: "An outline",
    visualInventory: [],
  });
  for (const layout of SLIDE_LAYOUTS) {
    assert.ok(
      system.content.includes(`"${layout}"`),
      `layout ${layout} missing`,
    );
  }
  for (const theme of DECK_THEMES) {
    assert.ok(system.content.includes(`"${theme}"`), `theme ${theme} missing`);
  }
});

test("system message describes the schema-v6 deck shape", () => {
  const [system] = buildDeckGenerationMessages({
    outline: "An outline",
    visualInventory: [],
  });
  const content = system.content;
  assert.match(content, /"schemaVersion": 6/);
  assert.match(content, /"canvas": \{ "format": "16:9" \}/);
  assert.match(content, /"design": \{ "themeId"/);
  assert.match(content, /"masters"/);
  assert.match(content, /"defaultMasterId"/);
  assert.match(content, /"templateId"/);
  assert.match(content, /"content": \{ "kind": "text"/);
  assert.match(content, /"designOverrides"/);
  assert.doesNotMatch(content, /^\s+"themeId":/m);
  assert.doesNotMatch(content, /^\s+"layout":/m);
  assert.doesNotMatch(content, /^\s+"bullets":/m);
  assert.doesNotMatch(content, /^\s+"visualIds":/m);
});

test("user message renders the outline and the inventory list", () => {
  const [, user] = buildDeckGenerationMessages({
    outline: "My deck outline body",
    visualInventory: INVENTORY,
  });
  assert.match(user.content, /My deck outline body/);
  assert.match(
    user.content,
    /vis-1 — Revenue chart \(chart\): Quarterly revenue bars/,
  );
  assert.match(
    user.content,
    /vis-2 — Process flow \(flowchart\): Onboarding steps/,
  );
});

test("empty inventory tells the model not to include visuals", () => {
  const [system, user] = buildDeckGenerationMessages({
    outline: "Outline",
    visualInventory: [],
  });
  assert.match(user.content, /none/i);
  assert.match(system.content, /inventory is empty/i);
});

test("threads length, tone, audience options into the user message", () => {
  const [, user] = buildDeckGenerationMessages({
    outline: "Outline",
    visualInventory: INVENTORY,
    options: { length: "short", tone: "playful", audience: "executives" },
  });
  assert.match(user.content, /4–6 slides/);
  assert.match(user.content, /playful/);
  assert.match(user.content, /executives/);
});

test("threads a retryReason into the user message", () => {
  const [, user] = buildDeckGenerationMessages({
    outline: "Outline",
    visualInventory: INVENTORY,
    retryReason: "Previous output was not valid JSON.",
  });
  assert.match(user.content, /previous attempt was rejected/i);
  assert.match(user.content, /Previous output was not valid JSON\./);
});

test("omits retry / option lines when not provided", () => {
  const [, user] = buildDeckGenerationMessages({
    outline: "Outline",
    visualInventory: INVENTORY,
  });
  assert.doesNotMatch(user.content, /previous attempt was rejected/i);
  assert.doesNotMatch(user.content, /Tone:/);
  assert.doesNotMatch(user.content, /Audience:/);
});
