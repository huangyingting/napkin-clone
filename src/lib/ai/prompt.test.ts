import assert from "node:assert/strict";
import test from "node:test";

import { buildGenerationMessages } from "@/lib/ai/prompt";
import { VISUAL_KINDS } from "@/lib/visual/schema";

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

test("the prompt enumerates every visual kind so the model can target it", () => {
  const system =
    buildGenerationMessages({ text: "Describe the process", count: 3 })[0]
      ?.content ?? "";

  // Each kind must appear (quoted) in the schema's `type` union and carry a
  // guidance line, so newly added kinds become generatable automatically.
  for (const kind of VISUAL_KINDS) {
    assert.match(
      system,
      new RegExp(`"${kind}"`),
      `schema type union missing "${kind}"`,
    );
    assert.match(
      system,
      new RegExp(`- ${kind}[:/]`),
      `guidance section missing "${kind}"`,
    );
  }
});

test("each new visual kind can be requested as the generation type", () => {
  for (const kind of ["timeline", "cycle", "comparison", "funnel"] as const) {
    const user =
      buildGenerationMessages({
        text: "Summarize the launch plan",
        type: kind,
        count: 3,
      })[1]?.content ?? "";

    assert.match(
      user,
      new RegExp(`All candidates MUST use "type": "${kind}"\\.`),
      `typed prompt for "${kind}" did not force the type`,
    );
  }
});
