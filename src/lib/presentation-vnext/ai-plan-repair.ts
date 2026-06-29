/**
 * AI plan repair for the v7 presentation system.
 *
 * Validates an AI-generated plan and repairs it before template compilation:
 * - Validates/repairs template kinds and controls.
 * - Enforces slot capacity policies.
 * - Produces diagnostics for every material change.
 * - Never trusts AI-generated ids wholesale.
 */

import type { AiDeckPlanV1, AiSlideSpec, SlotValue } from "./ai-plan-schema";
import type { SlotContract } from "./template-registry";
import type { PresentationDiagnostic } from "./diagnostics";
import { DiagnosticCollector } from "./diagnostics";
import {
  SemanticTemplateRegistry,
  isSemanticTemplateKind,
} from "./template-registry";
import type {
  SemanticTemplateKind,
  SlideTone,
  SlideDensity,
  SlideEmphasis,
  SlotKey,
} from "./schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_TONES: SlideTone[] = [
  "neutral",
  "confident",
  "warm",
  "urgent",
  "premium",
  "technical",
];
const VALID_DENSITIES: SlideDensity[] = ["airy", "normal", "dense"];
const VALID_EMPHASIS: SlideEmphasis[] = [
  "balanced",
  "title",
  "data",
  "visual",
  "quote",
  "action",
];

function countCodePoints(s: string): number {
  let count = 0;
  for (const _ of s) count++;
  return count;
}

/** Normalises whitespace in a string for capacity counting. */
function normaliseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Slot value repair
// ---------------------------------------------------------------------------

function repairSlotValue(
  slotKey: SlotKey,
  value: SlotValue,
  contract: SlotContract,
  dc: DiagnosticCollector,
  slideIndex: number,
): SlotValue | undefined {
  const ctx = `slides[${slideIndex}].slots.${slotKey}`;

  // Text capacity
  if (value.type === "shortText") {
    const norm = normaliseWhitespace(value.text);
    if (contract.maxChars && countCodePoints(norm) > contract.maxChars) {
      const truncated = [...norm]
        .slice(0, contract.maxChars)
        .join("")
        .trimEnd();
      dc.warning(
        "slot-over-capacity",
        `${ctx}: text truncated from ${countCodePoints(norm)} to ${contract.maxChars} chars`,
        { path: ctx },
      );
      return { type: "shortText", text: truncated };
    }
    return { type: "shortText", text: norm };
  }

  if (value.type === "paragraph") {
    let paragraphs = value.paragraphs;
    if (contract.maxItems && paragraphs.length > contract.maxItems) {
      dc.warning(
        "slot-over-capacity",
        `${ctx}: paragraph count ${paragraphs.length} exceeds max ${contract.maxItems}; truncating`,
        { path: ctx },
      );
      paragraphs = paragraphs.slice(0, contract.maxItems);
    }
    return { type: "paragraph", paragraphs };
  }

  if (value.type === "bullets") {
    let items = value.items;
    if (contract.maxItems && items.length > contract.maxItems) {
      dc.warning(
        "slot-over-capacity",
        `${ctx}: bullet count ${items.length} exceeds max ${contract.maxItems}; truncating`,
        { path: ctx },
      );
      items = items.slice(0, contract.maxItems);
    }
    return { type: "bullets", items };
  }

  if (value.type === "metrics") {
    let items = value.items;
    if (contract.maxItems && items.length > contract.maxItems) {
      dc.warning(
        "slot-over-capacity",
        `${ctx}: metrics count ${items.length} exceeds max ${contract.maxItems}; truncating`,
        { path: ctx },
      );
      items = items.slice(0, contract.maxItems);
    }
    return { type: "metrics", items };
  }

  if (value.type === "cards") {
    let items = value.items;
    if (contract.maxItems && items.length > contract.maxItems) {
      dc.warning(
        "slot-over-capacity",
        `${ctx}: cards count ${items.length} exceeds max ${contract.maxItems}; truncating`,
        { path: ctx },
      );
      items = items.slice(0, contract.maxItems);
    }
    return { type: "cards", items };
  }

  if (value.type === "steps") {
    let items = value.items;
    if (contract.maxItems && items.length > contract.maxItems) {
      dc.warning(
        "slot-over-capacity",
        `${ctx}: steps count ${items.length} exceeds max ${contract.maxItems}; truncating`,
        { path: ctx },
      );
      items = items.slice(0, contract.maxItems);
    }
    return { type: "steps", items };
  }

  if (value.type === "table") {
    let { columns, rows } = value;
    const { caption } = value;
    if (contract.maxColumns && columns.length > contract.maxColumns) {
      dc.warning(
        "slot-over-capacity",
        `${ctx}: table columns ${columns.length} exceeds max ${contract.maxColumns}; truncating`,
        { path: ctx },
      );
      columns = columns.slice(0, contract.maxColumns);
      rows = rows.map((row) => row.slice(0, contract.maxColumns!));
    }
    if (contract.maxRows && rows.length > contract.maxRows) {
      dc.warning(
        "slot-over-capacity",
        `${ctx}: table rows ${rows.length} exceeds max ${contract.maxRows}; truncating`,
        { path: ctx },
      );
      rows = rows.slice(0, contract.maxRows);
    }
    return { type: "table", columns, rows, ...(caption ? { caption } : {}) };
  }

  return value;
}

// ---------------------------------------------------------------------------
// Slide repair
// ---------------------------------------------------------------------------

function repairSlide(
  slide: unknown,
  index: number,
  registry: SemanticTemplateRegistry,
  dc: DiagnosticCollector,
): AiSlideSpec | null {
  const ctx = `slides[${index}]`;

  if (typeof slide !== "object" || slide === null) {
    dc.error("unknown-template-kind", `${ctx} must be an object`);
    return null;
  }

  const s = slide as Record<string, unknown>;

  // Repair kind
  let kind: SemanticTemplateKind;
  if (!isSemanticTemplateKind(s.kind)) {
    // Try to map to nearest known kind
    dc.warning(
      "unknown-template-kind",
      `${ctx}.kind "${s.kind}" is unknown; defaulting to "content"`,
      { path: `${ctx}.kind` },
    );
    kind = "content";
  } else {
    kind = s.kind as SemanticTemplateKind;
  }

  // Repair tone
  let tone: SlideTone | undefined;
  if (s.tone !== undefined) {
    if (!VALID_TONES.includes(s.tone as SlideTone)) {
      dc.warning(
        "unsupported-template-control",
        `${ctx}.tone "${s.tone}" is unknown; removing`,
        { path: `${ctx}.tone` },
      );
    } else {
      tone = s.tone as SlideTone;
    }
  }

  // Repair density
  let density: SlideDensity | undefined;
  if (s.density !== undefined) {
    if (!VALID_DENSITIES.includes(s.density as SlideDensity)) {
      dc.warning(
        "unsupported-template-control",
        `${ctx}.density "${s.density}" is unknown; removing`,
        { path: `${ctx}.density` },
      );
    } else {
      density = s.density as SlideDensity;
    }
  }

  // Repair emphasis
  let emphasis: SlideEmphasis | undefined;
  if (s.emphasis !== undefined) {
    if (!VALID_EMPHASIS.includes(s.emphasis as SlideEmphasis)) {
      dc.warning(
        "unsupported-template-control",
        `${ctx}.emphasis "${s.emphasis}" is unknown; removing`,
        { path: `${ctx}.emphasis` },
      );
    } else {
      emphasis = s.emphasis as SlideEmphasis;
    }
  }

  // Repair slots
  const rawSlots =
    s.slots && typeof s.slots === "object" && !Array.isArray(s.slots)
      ? (s.slots as Record<string, unknown>)
      : {};

  const template = registry.get(kind);
  const repairedSlots: Partial<Record<SlotKey, SlotValue>> = {};

  for (const [slotKey, slotValue] of Object.entries(rawSlots)) {
    if (typeof slotValue !== "object" || slotValue === null) continue;
    const sv = slotValue as SlotValue;

    const contract = template?.slots[slotKey as SlotKey];
    if (!contract) {
      // Slot not in template — include as-is
      repairedSlots[slotKey as SlotKey] = sv;
      continue;
    }

    const repaired = repairSlotValue(
      slotKey as SlotKey,
      sv,
      contract,
      dc,
      index,
    );
    if (repaired !== undefined) {
      repairedSlots[slotKey as SlotKey] = repaired;
    }
  }

  // Check required slots
  if (template) {
    for (const [slotKey, contract] of Object.entries(template.slots)) {
      if (contract.required && !(slotKey in repairedSlots)) {
        dc.error(
          "missing-required-slot",
          `${ctx}: required slot "${slotKey}" is missing`,
          { path: `${ctx}.slots.${slotKey}` },
        );
      }
    }
  }

  const speakerNotes =
    typeof s.speakerNotes === "string" ? s.speakerNotes : undefined;

  return {
    kind,
    ...(tone !== undefined ? { tone } : {}),
    ...(density !== undefined ? { density } : {}),
    ...(emphasis !== undefined ? { emphasis } : {}),
    slots: repairedSlots,
    ...(speakerNotes !== undefined ? { speakerNotes } : {}),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type AiPlanRepairResult = {
  plan: AiDeckPlanV1;
  diagnostics: PresentationDiagnostic[];
};

/**
 * Validates and repairs an AI-generated deck plan.
 *
 * - Validates plan structure (planVersion, slides array).
 * - Repairs unknown template kinds to "content" with a warning.
 * - Repairs unknown controls (tone/density/emphasis) by removing them.
 * - Enforces slot capacity policies from the template registry.
 * - Checks required slots and emits errors for missing ones.
 * - Emits diagnostics for every material change.
 *
 * The returned plan is safe to pass to the template compiler.
 */
export function repairAiDeckPlan(
  input: unknown,
  registry: SemanticTemplateRegistry,
): AiPlanRepairResult {
  const dc = new DiagnosticCollector();

  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    dc.fatal("invalid-schema-version", "AI deck plan must be an object");
    return {
      plan: { planVersion: 1, slides: [] },
      diagnostics: dc.diagnostics,
    };
  }

  const p = input as Record<string, unknown>;

  if (p.planVersion !== 1) {
    dc.fatal(
      "invalid-schema-version",
      `AI deck plan planVersion must be 1 (got ${p.planVersion})`,
    );
    return {
      plan: { planVersion: 1, slides: [] },
      diagnostics: dc.diagnostics,
    };
  }

  if (!Array.isArray(p.slides)) {
    dc.error("unknown-field", "AI deck plan slides must be an array");
    return {
      plan: { planVersion: 1, slides: [] },
      diagnostics: dc.diagnostics,
    };
  }

  const repairedSlides: AiSlideSpec[] = [];
  for (let i = 0; i < p.slides.length; i++) {
    const repaired = repairSlide(p.slides[i], i, registry, dc);
    if (repaired !== null) {
      repairedSlides.push(repaired);
    }
  }

  return {
    plan: {
      planVersion: 1,
      ...(typeof p.title === "string" ? { title: p.title } : {}),
      ...(typeof p.locale === "string" ? { locale: p.locale } : {}),
      slides: repairedSlides,
    },
    diagnostics: dc.diagnostics,
  };
}
