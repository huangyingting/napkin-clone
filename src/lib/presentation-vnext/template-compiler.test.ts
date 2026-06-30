/**
 * Template registry, compiler, and AI plan repair tests.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  SEMANTIC_TEMPLATE_KINDS,
  isSemanticTemplateKind,
  selectLayout,
} from "@/lib/presentation-vnext/template-registry";
import { createDefaultTemplateRegistry } from "@/lib/presentation-vnext/theme-packages";
import {
  compileSlide,
  resetIdCounter,
} from "@/lib/presentation-vnext/template-compiler";
import { repairAiDeckPlan } from "@/lib/presentation-vnext/ai-plan-repair";
import type { AiSlideSpec } from "@/lib/presentation-vnext/ai-plan-schema";

describe("SEMANTIC_TEMPLATE_KINDS", () => {
  test("contains all 27 documented kinds", () => {
    assert.equal(SEMANTIC_TEMPLATE_KINDS.length, 27);
    assert.ok(SEMANTIC_TEMPLATE_KINDS.includes("cover"));
    assert.ok(SEMANTIC_TEMPLATE_KINDS.includes("appendix"));
    assert.ok(SEMANTIC_TEMPLATE_KINDS.includes("metric-row"));
  });

  test("isSemanticTemplateKind accepts valid kinds", () => {
    assert.ok(isSemanticTemplateKind("cover"));
    assert.ok(isSemanticTemplateKind("comparison"));
    assert.ok(isSemanticTemplateKind("closing"));
  });

  test("isSemanticTemplateKind rejects invalid kinds", () => {
    assert.ok(!isSemanticTemplateKind("not-a-kind"));
    assert.ok(!isSemanticTemplateKind(""));
    assert.ok(!isSemanticTemplateKind(null));
  });
});

describe("createDefaultTemplateRegistry", () => {
  test("registers all 26 kinds", () => {
    const registry = createDefaultTemplateRegistry();
    for (const kind of SEMANTIC_TEMPLATE_KINDS) {
      assert.ok(registry.has(kind), `Expected registry to have kind "${kind}"`);
    }
  });

  test("each template has at least one layout", () => {
    const registry = createDefaultTemplateRegistry();
    for (const template of registry.all()) {
      assert.ok(
        template.layouts.length >= 1,
        `Template "${template.kind}" has no layouts`,
      );
    }
  });

  test("each layout root is type=slide", () => {
    const registry = createDefaultTemplateRegistry();
    for (const template of registry.all()) {
      for (const layout of template.layouts) {
        assert.equal(
          layout.root.type,
          "slide",
          `Template "${template.kind}" layout "${layout.id}" root is not "slide"`,
        );
      }
    }
  });
});

describe("selectLayout", () => {
  test("returns exact density+emphasis match", () => {
    resetIdCounter();
    const registry = createDefaultTemplateRegistry();
    const template = registry.get("content")!;
    const layout = selectLayout(template, "dense", "data");
    assert.equal(layout.id, "content-dense");
  });

  test("returns first layout when no match", () => {
    resetIdCounter();
    const registry = createDefaultTemplateRegistry();
    const template = registry.get("cover")!;
    const layout = selectLayout(template);
    assert.equal(layout.id, "cover-default");
  });
});

describe("compileSlide", () => {
  test("compiles a cover slide with title slot", () => {
    resetIdCounter();
    const registry = createDefaultTemplateRegistry();
    const template = registry.get("cover")!;
    const spec: AiSlideSpec = {
      kind: "cover",
      slots: {
        title: { type: "shortText", text: "My Presentation" },
        subtitle: { type: "shortText", text: "Q4 Results" },
      },
    };
    const { slide, diagnostics } = compileSlide(spec, template);
    assert.equal(slide.type, "slide");
    assert.equal(slide.template.kind, "cover");
    assert.ok(slide.children.length >= 1, "Expected at least one child");
    // Find title node
    const titleNode = slide.children.find((n) => n.slot === "title");
    assert.ok(titleNode, "Expected a node with slot=title");
    if (titleNode && titleNode.type === "text") {
      assert.equal(titleNode.content.paragraphs[0].text, "My Presentation");
    }
    assert.ok(!diagnostics.some((d) => d.severity === "error"));
  });

  test("compiles a content slide with bullets", () => {
    resetIdCounter();
    const registry = createDefaultTemplateRegistry();
    const template = registry.get("content")!;
    const spec: AiSlideSpec = {
      kind: "content",
      density: "airy",
      slots: {
        title: { type: "shortText", text: "Key Points" },
        bullets: {
          type: "bullets",
          items: [{ text: "Point one" }, { text: "Point two" }],
        },
      },
    };
    const { slide, diagnostics } = compileSlide(spec, template);
    assert.equal(slide.template.layoutId, "content-airy");
    const bulletNode = slide.children.find((n) => n.slot === "bullets");
    assert.ok(bulletNode, "Expected bullets node");
    if (bulletNode && bulletNode.type === "text") {
      assert.ok(bulletNode.content.paragraphs.length >= 2);
    }
    assert.ok(!diagnostics.some((d) => d.severity === "error"));
  });

  test("compiles a table slide", () => {
    resetIdCounter();
    const registry = createDefaultTemplateRegistry();
    const template = registry.get("table")!;
    const spec: AiSlideSpec = {
      kind: "table",
      slots: {
        title: { type: "shortText", text: "Data Table" },
        table: {
          type: "table",
          columns: ["Name", "Value"],
          rows: [
            ["A", "100"],
            ["B", "200"],
          ],
        },
      },
    };
    const { slide, diagnostics } = compileSlide(spec, template);
    const tableNode = slide.children.find((n) => n.slot === "table");
    assert.ok(tableNode, "Expected table node");
    if (tableNode && tableNode.type === "table") {
      assert.equal(tableNode.content.columns.length, 2);
      assert.equal(tableNode.content.rows.length, 2);
    }
    assert.ok(!diagnostics.some((d) => d.severity === "error"));
  });

  test("generates unique node ids (never copies AI ids)", () => {
    resetIdCounter();
    const registry = createDefaultTemplateRegistry();
    const template = registry.get("cover")!;
    const spec: AiSlideSpec = {
      kind: "cover",
      slots: { title: { type: "shortText", text: "Hi" } },
    };
    const { slide } = compileSlide(spec, template);
    // Node ids must not equal any 'AI' ids — check they follow generator pattern
    const allIds = [slide.id, ...slide.children.map((c) => c.id)];
    for (const id of allIds) {
      assert.ok(id.length > 0, "Node id must not be empty");
      assert.ok(
        !id.includes("undefined"),
        "Node id must not contain 'undefined'",
      );
    }
    // All ids must be unique
    assert.equal(
      new Set(allIds).size,
      allIds.length,
      "All node ids must be unique",
    );
  });

  test("preserves speaker notes", () => {
    resetIdCounter();
    const registry = createDefaultTemplateRegistry();
    const template = registry.get("cover")!;
    const spec: AiSlideSpec = {
      kind: "cover",
      slots: { title: { type: "shortText", text: "Hello" } },
      speakerNotes: "Remember to pause here.",
    };
    const { slide } = compileSlide(spec, template);
    assert.equal(slide.notes, "Remember to pause here.");
  });
});

describe("repairAiDeckPlan", () => {
  test("accepts a valid plan", () => {
    const registry = createDefaultTemplateRegistry();
    const plan = {
      planVersion: 1,
      title: "Test",
      slides: [
        {
          kind: "cover",
          slots: { title: { type: "shortText", text: "Hello" } },
        },
      ],
    };
    const { plan: repaired, diagnostics } = repairAiDeckPlan(plan, registry);
    assert.equal(repaired.planVersion, 1);
    assert.equal(repaired.slides.length, 1);
    assert.equal(repaired.slides[0].kind, "cover");
    assert.ok(
      !diagnostics.some(
        (d) => d.severity === "error" || d.severity === "fatal",
      ),
    );
  });

  test("repairs unknown template kind to 'content'", () => {
    const registry = createDefaultTemplateRegistry();
    const plan = {
      planVersion: 1,
      slides: [
        {
          kind: "totally-unknown-kind",
          slots: {},
        },
      ],
    };
    const { plan: repaired, diagnostics } = repairAiDeckPlan(plan, registry);
    assert.equal(repaired.slides[0].kind, "content");
    assert.ok(
      diagnostics.some((d) => d.code === "unknown-template-kind"),
      "Expected unknown-template-kind diagnostic",
    );
  });

  test("repairs unknown tone", () => {
    const registry = createDefaultTemplateRegistry();
    const plan = {
      planVersion: 1,
      slides: [
        {
          kind: "content",
          tone: "aggressive",
          slots: {},
        },
      ],
    };
    const { plan: repaired, diagnostics } = repairAiDeckPlan(plan, registry);
    assert.equal(repaired.slides[0].tone, undefined);
    assert.ok(
      diagnostics.some((d) => d.code === "unsupported-template-control"),
    );
  });

  test("truncates over-capacity bullets", () => {
    const registry = createDefaultTemplateRegistry();
    const plan = {
      planVersion: 1,
      slides: [
        {
          kind: "content",
          slots: {
            bullets: {
              type: "bullets",
              items: Array.from({ length: 10 }, (_, i) => ({
                text: `Item ${i + 1}`,
              })),
            },
          },
        },
      ],
    };
    const { plan: repaired, diagnostics } = repairAiDeckPlan(plan, registry);
    const bullets = repaired.slides[0].slots.bullets;
    assert.ok(bullets?.type === "bullets" && bullets.items.length <= 6);
    assert.ok(diagnostics.some((d) => d.code === "slot-over-capacity"));
  });

  test("errors on non-object input", () => {
    const registry = createDefaultTemplateRegistry();
    const { plan: repaired, diagnostics } = repairAiDeckPlan(
      "not-a-plan",
      registry,
    );
    assert.ok(diagnostics.some((d) => d.severity === "fatal"));
    assert.equal(repaired.slides.length, 0);
  });

  test("errors on wrong planVersion", () => {
    const registry = createDefaultTemplateRegistry();
    const { diagnostics } = repairAiDeckPlan(
      { planVersion: 2, slides: [] },
      registry,
    );
    assert.ok(diagnostics.some((d) => d.code === "invalid-schema-version"));
  });

  test("errors on missing required slot", () => {
    const registry = createDefaultTemplateRegistry();
    // cover template requires title
    const plan = {
      planVersion: 1,
      slides: [{ kind: "cover", slots: {} }],
    };
    const { diagnostics } = repairAiDeckPlan(plan, registry);
    assert.ok(
      diagnostics.some((d) => d.code === "missing-required-slot"),
      "Expected missing-required-slot diagnostic",
    );
  });

  test("truncates over-capacity table rows", () => {
    const registry = createDefaultTemplateRegistry();
    const plan = {
      planVersion: 1,
      slides: [
        {
          kind: "table",
          slots: {
            table: {
              type: "table",
              columns: ["A", "B"],
              rows: Array.from({ length: 15 }, (_, i) => [
                `Row ${i}`,
                `${i * 10}`,
              ]),
            },
          },
        },
      ],
    };
    const { plan: repaired, diagnostics } = repairAiDeckPlan(plan, registry);
    const table = repaired.slides[0].slots.table;
    assert.ok(table?.type === "table" && table.rows.length <= 10);
    assert.ok(diagnostics.some((d) => d.code === "slot-over-capacity"));
  });

  test("truncates over-capacity shortText to maxChars", () => {
    const registry = createDefaultTemplateRegistry();
    // cover template has title with maxChars: 120
    const longTitle = "A".repeat(150);
    const plan = {
      planVersion: 1,
      slides: [
        {
          kind: "cover",
          slots: {
            title: { type: "shortText", text: longTitle },
          },
        },
      ],
    };
    const { plan: repaired, diagnostics } = repairAiDeckPlan(plan, registry);
    const title = repaired.slides[0].slots.title;
    assert.ok(title?.type === "shortText" && title.text.length <= 120);
    assert.ok(diagnostics.some((d) => d.code === "slot-over-capacity"));
  });

  test("truncates over-capacity paragraph items", () => {
    const registry = createDefaultTemplateRegistry();
    // content template has body (paragraph) with maxItems: 3
    const plan = {
      planVersion: 1,
      slides: [
        {
          kind: "content",
          slots: {
            body: {
              type: "paragraph",
              paragraphs: Array.from({ length: 6 }, (_, i) => ({
                id: `p${i}`,
                text: `Paragraph ${i}`,
              })),
            },
          },
        },
      ],
    };
    const { plan: repaired, diagnostics } = repairAiDeckPlan(plan, registry);
    const body = repaired.slides[0].slots.body;
    assert.ok(body?.type === "paragraph" && body.paragraphs.length <= 3);
    assert.ok(diagnostics.some((d) => d.code === "slot-over-capacity"));
  });

  test("truncates over-capacity table columns", () => {
    const registry = createDefaultTemplateRegistry();
    // table template has table with maxColumns: 6
    const plan = {
      planVersion: 1,
      slides: [
        {
          kind: "table",
          slots: {
            table: {
              type: "table",
              columns: Array.from({ length: 9 }, (_, i) => `Col${i}`),
              rows: [Array.from({ length: 9 }, (_, i) => `v${i}`)],
            },
          },
        },
      ],
    };
    const { plan: repaired, diagnostics } = repairAiDeckPlan(plan, registry);
    const table = repaired.slides[0].slots.table;
    assert.ok(table?.type === "table" && table.columns.length <= 6);
    assert.ok(diagnostics.some((d) => d.code === "slot-over-capacity"));
  });

  test("removes unknown density control", () => {
    const registry = createDefaultTemplateRegistry();
    const plan = {
      planVersion: 1,
      slides: [
        {
          kind: "content",
          density: "extreme",
          slots: {},
        },
      ],
    };
    const { plan: repaired, diagnostics } = repairAiDeckPlan(plan, registry);
    assert.equal(repaired.slides[0].density, undefined);
    assert.ok(
      diagnostics.some((d) => d.code === "unsupported-template-control"),
    );
  });

  test("removes unknown emphasis control", () => {
    const registry = createDefaultTemplateRegistry();
    const plan = {
      planVersion: 1,
      slides: [
        {
          kind: "content",
          emphasis: "unknown-emphasis",
          slots: {},
        },
      ],
    };
    const { plan: repaired, diagnostics } = repairAiDeckPlan(plan, registry);
    assert.equal(repaired.slides[0].emphasis, undefined);
    assert.ok(
      diagnostics.some((d) => d.code === "unsupported-template-control"),
    );
  });

  test("preserves valid tone, density, emphasis without diagnostics", () => {
    const registry = createDefaultTemplateRegistry();
    const plan = {
      planVersion: 1,
      slides: [
        {
          kind: "content",
          tone: "confident",
          density: "dense",
          emphasis: "data",
          slots: {},
        },
      ],
    };
    const { plan: repaired, diagnostics } = repairAiDeckPlan(plan, registry);
    assert.equal(repaired.slides[0].tone, "confident");
    assert.equal(repaired.slides[0].density, "dense");
    assert.equal(repaired.slides[0].emphasis, "data");
    assert.ok(
      !diagnostics.some((d) => d.code === "unsupported-template-control"),
    );
  });

  test("errors on slide that is not an object", () => {
    const registry = createDefaultTemplateRegistry();
    const plan = {
      planVersion: 1,
      slides: [null], // slide must be an object
    };
    const { diagnostics } = repairAiDeckPlan(plan, registry);
    assert.ok(diagnostics.some((d) => d.severity === "error"));
  });
});
