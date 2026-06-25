import assert from "node:assert/strict";
import test from "node:test";

import { buildGenerationMessages } from "@/lib/ai/prompt";
import { VISUAL_KINDS } from "@/lib/visual/schema";
import { getAllKindPromptGuidance } from "@/lib/visual/registry";

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

test("visual type guidance is derived from the visual registry", () => {
  const system =
    buildGenerationMessages({ text: "Describe the process", count: 3 })[0]
      ?.content ?? "";

  for (const { guidance } of getAllKindPromptGuidance()) {
    assert.match(
      system,
      new RegExp(`- ${guidance.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
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

// ── New controls ────────────────────────────────────────────────────────────

test("orientation=vertical adds a vertical layout instruction to the user message", () => {
  const user =
    buildGenerationMessages({
      text: "Plan the sprint",
      count: 3,
      orientation: "vertical",
    })[1]?.content ?? "";

  assert.match(user, /taller-than-wide/);
  assert.match(user, /top-to-bottom/);
});

test("orientation=horizontal adds a horizontal layout instruction to the user message", () => {
  const user =
    buildGenerationMessages({
      text: "Plan the sprint",
      count: 3,
      orientation: "horizontal",
    })[1]?.content ?? "";

  assert.match(user, /wider-than-tall/);
  assert.match(user, /left-to-right/);
});

test("orientation=square adds a square layout instruction to the user message", () => {
  const user =
    buildGenerationMessages({
      text: "Plan the sprint",
      count: 3,
      orientation: "square",
    })[1]?.content ?? "";

  assert.match(user, /square canvas/);
});

test("orientation=auto (or omitted) does NOT add a layout instruction", () => {
  const noOpt =
    buildGenerationMessages({ text: "Plan the sprint", count: 3 })[1]
      ?.content ?? "";
  const autoOpt =
    buildGenerationMessages({
      text: "Plan the sprint",
      count: 3,
      orientation: "auto",
    })[1]?.content ?? "";

  for (const user of [noOpt, autoOpt]) {
    assert.doesNotMatch(user, /taller-than-wide/);
    assert.doesNotMatch(user, /wider-than-tall/);
    assert.doesNotMatch(user, /square canvas/);
  }
});

test("detailLevel=detailed adds an expansion instruction to the user message", () => {
  const user =
    buildGenerationMessages({
      text: "Describe the architecture",
      count: 3,
      detailLevel: "detailed",
    })[1]?.content ?? "";

  assert.match(user, /Expand the source text fully/);
});

test("detailLevel=summary adds a compact instruction to the user message", () => {
  const user =
    buildGenerationMessages({
      text: "Describe the architecture",
      count: 3,
      detailLevel: "summary",
    })[1]?.content ?? "";

  assert.match(user, /Keep the visual compact/);
});

test("omitting detailLevel does NOT add a detail instruction", () => {
  const user =
    buildGenerationMessages({ text: "Describe the architecture", count: 3 })[1]
      ?.content ?? "";

  assert.doesNotMatch(user, /Expand the source text fully/);
  assert.doesNotMatch(user, /Keep the visual compact/);
});

test("stayCloserToText=true adds a wording-preservation instruction", () => {
  const user =
    buildGenerationMessages({
      text: "Use exact phrasing",
      count: 3,
      stayCloserToText: true,
    })[1]?.content ?? "";

  assert.match(user, /Preserve the user's original wording/);
  assert.match(user, /exact phrases from the source text/);
});

test("stayCloserToText=false (or omitted) does NOT add a wording instruction", () => {
  const noOpt =
    buildGenerationMessages({ text: "Use exact phrasing", count: 3 })[1]
      ?.content ?? "";
  const falseOpt =
    buildGenerationMessages({
      text: "Use exact phrasing",
      count: 3,
      stayCloserToText: false,
    })[1]?.content ?? "";

  for (const user of [noOpt, falseOpt]) {
    assert.doesNotMatch(user, /Preserve the user's original wording/);
  }
});

test("all three new options can be combined in a single prompt", () => {
  const user =
    buildGenerationMessages({
      text: "Show the product lifecycle",
      count: 3,
      type: "timeline",
      orientation: "horizontal",
      detailLevel: "detailed",
      stayCloserToText: true,
    })[1]?.content ?? "";

  assert.match(user, /All candidates MUST use "type": "timeline"\./);
  assert.match(user, /wider-than-tall/);
  assert.match(user, /Expand the source text fully/);
  assert.match(user, /Preserve the user's original wording/);
});

// ── Language-preservation (multi-language support) ───────────────────────────

test("system prompt contains language-preservation rule", () => {
  const system =
    buildGenerationMessages({ text: "Hola mundo", count: 3 })[0]?.content ?? "";

  assert.match(system, /LANGUAGE:/);
  assert.match(system, /SAME LANGUAGE as the source text/);
  assert.match(system, /Do NOT translate/);
});

test("language-preservation rule is present regardless of builder options", () => {
  const cases: Parameters<typeof buildGenerationMessages>[0][] = [
    { text: "Plan the sprint", count: 1 },
    { text: "计划冲刺", count: 2, type: "flowchart" },
    {
      text: "Planifier le sprint",
      count: 3,
      orientation: "horizontal",
      detailLevel: "detailed",
      stayCloserToText: true,
    },
  ];

  for (const opts of cases) {
    const system = buildGenerationMessages(opts)[0]?.content ?? "";
    assert.match(
      system,
      /SAME LANGUAGE as the source text/,
      `language rule missing for options: ${JSON.stringify(opts)}`,
    );
  }
});

test("system prompt language rule applies to node labels, edge labels, and titles", () => {
  const system =
    buildGenerationMessages({ text: "Bonjour le monde", count: 2 })[0]
      ?.content ?? "";

  assert.match(system, /node labels/);
  assert.match(system, /edge labels/);
  assert.match(system, /visual titles/);
});
