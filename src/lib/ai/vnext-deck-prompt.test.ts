/**
 * vNext deck prompt builder tests.
 *
 * Verifies that `buildVnextDeckMessages` produces messages that:
 * - contain the AiDeckPlanV1 JSON shape description,
 * - list all semantic template kinds,
 * - include the outline,
 * - include visual inventory entries,
 * - respect generation options (length, tone, audience),
 * - include the retry reason on retry attempts.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { buildVnextDeckMessages } from "@/lib/ai/vnext-deck-prompt";
import { SEMANTIC_TEMPLATE_KINDS } from "@/lib/presentation-vnext/template-registry";

describe("buildVnextDeckMessages", () => {
  test("returns exactly two messages (system + user)", () => {
    const messages = buildVnextDeckMessages({
      outline: "A test outline",
      themePackageId: "clarity",
      visualInventory: [],
    });
    assert.equal(messages.length, 2);
    assert.equal(messages[0].role, "system");
    assert.equal(messages[1].role, "user");
  });

  test("system prompt describes AiDeckPlanV1 shape (planVersion: 1)", () => {
    const messages = buildVnextDeckMessages({
      outline: "outline",
      themePackageId: "clarity",
      visualInventory: [],
    });
    assert.ok(
      messages[0].content.includes("planVersion"),
      "System prompt must describe planVersion field",
    );
  });

  test("system prompt describes typed slot values (shortText)", () => {
    const messages = buildVnextDeckMessages({
      outline: "outline",
      themePackageId: "clarity",
      visualInventory: [],
    });
    assert.ok(
      messages[0].content.includes("shortText"),
      "System prompt must describe shortText slot type",
    );
  });

  test("user message includes all semantic template kinds", () => {
    const messages = buildVnextDeckMessages({
      outline: "some outline",
      themePackageId: "clarity",
      visualInventory: [],
    });
    const userContent = messages[1].content;
    for (const kind of SEMANTIC_TEMPLATE_KINDS) {
      assert.ok(
        userContent.includes(kind),
        `User message must include template kind "${kind}"`,
      );
    }
  });

  test("user message includes the outline text", () => {
    const outline = "This is a unique outline string 42xz";
    const messages = buildVnextDeckMessages({
      outline,
      themePackageId: "clarity",
      visualInventory: [],
    });
    assert.ok(
      messages[1].content.includes(outline),
      "User message must include the outline text",
    );
  });

  test("user message includes the theme package id", () => {
    const messages = buildVnextDeckMessages({
      outline: "outline",
      themePackageId: "noir",
      visualInventory: [],
    });
    assert.ok(
      messages[1].content.includes("noir"),
      "User message must include the theme package id",
    );
  });

  test("visual inventory entries appear in user message", () => {
    const messages = buildVnextDeckMessages({
      outline: "outline",
      themePackageId: "clarity",
      visualInventory: [
        {
          id: "vis-001",
          title: "Revenue Chart",
          type: "chart",
          summary: "Q1 2024 revenue by region",
        },
      ],
    });
    assert.ok(
      messages[1].content.includes("vis-001"),
      "User message must include visual id",
    );
    assert.ok(
      messages[1].content.includes("Revenue Chart"),
      "User message must include visual title",
    );
  });

  test("empty visual inventory produces a none message", () => {
    const messages = buildVnextDeckMessages({
      outline: "outline",
      themePackageId: "clarity",
      visualInventory: [],
    });
    assert.ok(
      messages[1].content.includes("none"),
      "User message must note empty visual inventory",
    );
  });

  test("length option produces guidance note", () => {
    const messages = buildVnextDeckMessages({
      outline: "outline",
      themePackageId: "clarity",
      visualInventory: [],
      options: { length: "short" },
    });
    assert.ok(
      messages[1].content.includes("4"),
      "User message must include short-deck guidance with slide count",
    );
  });

  test("tone option is included in user message", () => {
    const messages = buildVnextDeckMessages({
      outline: "outline",
      themePackageId: "clarity",
      visualInventory: [],
      options: { tone: "confident" },
    });
    assert.ok(
      messages[1].content.includes("confident"),
      "User message must include the tone",
    );
  });

  test("audience option is included in user message", () => {
    const messages = buildVnextDeckMessages({
      outline: "outline",
      themePackageId: "clarity",
      visualInventory: [],
      options: { audience: "technical leadership" },
    });
    assert.ok(
      messages[1].content.includes("technical leadership"),
      "User message must include the audience",
    );
  });

  test("retryReason is included on retry attempts", () => {
    const reason = "Previous plan had only one slide";
    const messages = buildVnextDeckMessages({
      outline: "outline",
      themePackageId: "clarity",
      visualInventory: [],
      retryReason: reason,
    });
    assert.ok(
      messages[1].content.includes(reason),
      "User message must include the retry reason",
    );
  });

  test("no retryReason in user message on first attempt", () => {
    const messages = buildVnextDeckMessages({
      outline: "outline",
      themePackageId: "clarity",
      visualInventory: [],
    });
    assert.ok(
      !messages[1].content.includes("Previous attempt"),
      "User message must not include retry language on first attempt",
    );
  });
});
