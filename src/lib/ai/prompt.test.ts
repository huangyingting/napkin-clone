import assert from "node:assert/strict";
import test from "node:test";

import { buildGenerationMessages } from "@/lib/ai/prompt";

test("prompt instructs the model to use only bundled catalog icons", () => {
  const messages = buildGenerationMessages({
    text: "Explain the product roadmap",
    count: 3,
  });
  const system = messages[0]?.content ?? "";

  assert.match(system, /Bundled icon catalog:/);
  assert.match(system, /Valid node\.icon values:/);
  assert.match(system, /"Lightbulb"/);
  assert.match(system, /"Database"/);
  assert.match(system, /omit `icon`/);
  assert.match(system, /MUST be one of the listed catalog names exactly/);
});

test("typed prompts still require the requested visual type", () => {
  const messages = buildGenerationMessages({
    text: "Compare pricing options",
    type: "chart",
    count: 4,
  });
  const user = messages[1]?.content ?? "";

  assert.match(user, /All candidates MUST use "type": "chart"\./);
});
