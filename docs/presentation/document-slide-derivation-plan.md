---
type: "plan"
status: "approved"
last_updated: "2026-07-02"
description: "Executable hard-cut plan for replacing the current document-to-slides generation path with a traceable DocumentSourcePlanV1 -> DocumentSlidePlanV1 -> SemanticDeckPlanV1 -> DeckV7 pipeline while removing package-template generation and AI-specific plan vocabulary from the generation domain."
---

# Document Slide Derivation Plan

This plan defines the hard-cut migration for document-derived slides. It covers
the generation domain only: deterministic derivation, AI deck proposal
generation, plan repair, template compilation, provenance metadata, preview
handoff, and API protocol cleanup.

The plan intentionally does not migrate or delete the broader legacy v6
presentation editor/export stack. vNext still reuses presentation utilities,
present-mode helpers, and export fallbacks from that area, so that work belongs
in a separate presentation migration plan.

## Decision Summary

The target pipeline is:

```text
contentJson
  -> collectDocumentBlocks
  -> DocumentSourcePlanV1
  -> planner
      deterministic: faithful structure move + capacity trim
      ai: structured source plan -> faithful/presentationRewrite proposal
  -> DocumentSlidePlanV1
  -> SemanticDeckPlanV1
  -> repairSemanticDeckPlan
  -> compileSlide
  -> stamp source metadata
  -> DeckV7
  -> preview/diff/apply/save
```

The hard cut removes package-template generation and the `AiDeckPlanV1` /
`AiSlideSpec` vocabulary from this domain. The stable compiler input becomes
`SemanticDeckPlanV1` / `SemanticSlideSpecV1`; document-aware provenance lives in
`DocumentSlidePlanV1` and DeckV7 metadata.

## Goals

- Make deterministic derivation and AI generation share the same source-plan,
  document-slide-plan, compile, provenance, validation, and preview boundaries.
- Default both lines to faithful compression of source content. A presentation
  rewrite is an explicit AI mode, not the default.
- Use document `blockId` values as the source anchor granularity.
- Feed AI a structured source plan with section/block ids instead of only an
  outline string.
- Persist only DeckV7 in the first phase, with derivation provenance in
  `DeckV7.metadata.extra` and `NodeSourceMetadata.extra`.
- Remove `generationMode` from `/api/generate-deck`; it is a stale migration
  field.
- Remove package-template generation files and tests from the deck-generation
  domain in the same change.

## Non-Goals

- Do not delete the whole legacy v6 slide editor, v6 renderer, or v6 export
  stack in this migration.
- Do not add a database column/table for `DocumentSlidePlanV1` in the first
  phase.
- Do not implement block-range source anchors; block-level anchors are the
  first version.
- Do not implement local semantic summarization in the deterministic planner.
- Do not implement partial slide regeneration. First version is full
  re-derive/regenerate plus diff.
- Do not keep compatibility aliases for `AiDeckPlanV1` or `AiSlideSpec` inside
  the generation domain.

## Current State

| Area                      | Current behavior                                                                                                  | Source                                                                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI vNext generation       | Builds source context, asks the model for a document slide plan, repairs it, compiles slides, and returns DeckV7. | [`src/lib/ai/run-vnext-deck-generation.ts`](../../src/lib/ai/run-vnext-deck-generation.ts)                                                                                       |
| vNext prompt              | Prompts for a `DocumentSlidePlanV1` JSON plan from structured source sections, block ids, and visual inventory.   | [`src/lib/ai/vnext-deck-prompt.ts`](../../src/lib/ai/vnext-deck-prompt.ts)                                                                                                       |
| Semantic plan schema      | Defines `SemanticDeckPlanV1`, `SemanticSlideSpecV1`, and slot values.                                             | [`src/lib/presentation-vnext/semantic-deck-plan.ts`](../../src/lib/presentation-vnext/semantic-deck-plan.ts)                                                                     |
| Semantic plan repair      | Repairs template kinds, controls, and slot capacities for semantic plans.                                         | [`src/lib/presentation-vnext/semantic-deck-plan-repair.ts`](../../src/lib/presentation-vnext/semantic-deck-plan-repair.ts)                                                       |
| Template compiler         | Compiles one `SemanticSlideSpecV1` plus a template into a v7 slide tree.                                          | [`src/lib/presentation-vnext/template-compiler.ts`](../../src/lib/presentation-vnext/template-compiler.ts)                                                                       |
| Deterministic derive      | Routes document blocks through `DocumentSlidePlanV1`, compiles them, stamps source metadata, and returns DeckV7.  | [`src/lib/presentation-vnext/deck-derivation.ts`](../../src/lib/presentation-vnext/deck-derivation.ts)                                                                           |
| Document block projection | Extracts text/table/visual blocks and stable block ids from serialized Lexical state.                             | [`src/lib/content/document-blocks.ts`](../../src/lib/content/document-blocks.ts)                                                                                                 |
| Source review             | Classifies, refreshes, relinks, unlinks, and dismisses source-linked nodes.                                       | [`src/lib/presentation-vnext/source-links.ts`](../../src/lib/presentation-vnext/source-links.ts)                                                                                 |
| Open flow                 | Creates deterministic fallback/baseline decks, runs AI generation, shows preview, applies, and saves.             | [`src/components/editor/use-slide-editor-open.ts`](../../src/components/editor/use-slide-editor-open.ts)                                                                         |
| Preview diff              | Shows deck-level thumbnail diff for AI proposal vs baseline.                                                      | [`src/components/presentation-vnext/deck-generation-preview-vnext.tsx`](../../src/components/presentation-vnext/deck-generation-preview-vnext.tsx)                               |
| Route protocol            | Parser accepts `contentJson`, tuning options, `mode`, and theme package; metadata reports planner and mode.       | [`src/app/api/generate-deck/parser.ts`](../../src/app/api/generate-deck/parser.ts), [`src/app/api/generate-deck/route-logic.ts`](../../src/app/api/generate-deck/route-logic.ts) |

## Target Contracts

### Planner Identity

Use these internal mode names everywhere in the derivation/generation domain:

```ts
type DocumentSlidePlanner = "deterministic" | "ai";
type DocumentSlideMode = "faithful" | "presentationRewrite";
```

UI labels can remain user-facing and familiar:

- `Derive from document` means `planner: "deterministic"`, `mode: "faithful"`.
- `Generate with AI` means `planner: "ai"`, default `mode: "faithful"`.

### DocumentSourcePlanV1

`DocumentSourcePlanV1` is the model input boundary. It is built locally from
`collectDocumentBlocks` and is the source of truth for AI context, deterministic
planning, truncation, visual inventory, and provenance.

```ts
type DocumentSourcePlanV1 = {
  planVersion: 1;
  documentId?: string;
  contentHash: string;
  locale?: string;
  truncated: boolean;
  originalChars: number;
  keptChars: number;
  sections: DocumentSourceSectionV1[];
  visualInventory: DeckVisualInventoryItem[];
};

type DocumentSourceSectionV1 = {
  id: string;
  title?: string;
  sourceBlockIds: string[];
  blocks: DocumentSourceBlockV1[];
};

type DocumentSourceBlockV1 =
  | { id: string; kind: "heading"; level?: 1 | 2 | 3; text: string }
  | {
      id: string;
      kind: "paragraph" | "listitem" | "quote" | "hr";
      text: string;
    }
  | {
      id: string;
      kind: "table";
      caption?: string;
      columns: string[];
      rows: string[][];
    }
  | {
      id: string;
      kind: "visual";
      visualId: string;
      title?: string;
      summary?: string;
    };
```

Rules:

- Prefer real document block ids. If a block lacks a `blockId`, synthesize a
  stable id from reading order and content hash for planning only.
- `contentHash` is derived from the full source projection, not from a truncated
  prompt string.
- Keep an outline serialization as a budget/log fallback, but do not use it as
  the primary AI input shape.

### DocumentSlidePlanV1

`DocumentSlidePlanV1` is the document-aware plan. Both deterministic and AI
planners produce it.

```ts
type DocumentSlidePlanV1 = {
  planVersion: 1;
  planner: "deterministic" | "ai";
  mode: "faithful" | "presentationRewrite";
  title?: string;
  locale?: string;
  source: {
    documentId?: string;
    contentHash: string;
    truncated: boolean;
  };
  slides: DocumentPlannedSlideV1[];
  omittedBlockIds?: string[];
};

type DocumentPlannedSlideV1 = {
  id: string;
  kind: SemanticTemplateKind;
  sourceBlockIds: string[];
  slotSources: Partial<Record<SlotKey, string[]>>;
  controls?: SlideControls;
  slots: Partial<Record<SlotKey, SlotValue>>;
  speakerNotes?: string;
  rationale?: string;
  omittedBlockIds?: string[];
};
```

Rules:

- Every visible slot should carry at least one `slotSources` block id when it is
  derived from document content.
- `sourceBlockIds` is the union of all blocks used by the slide.
- AI may include `rationale`; deterministic planner may omit it.
- `presentationRewrite` may synthesize wording, but it must still preserve
  `slotSources` and `sourceBlockIds` for the evidence it used.

### SemanticDeckPlanV1

`SemanticDeckPlanV1` replaces the AI-specific naming for the template compiler
input. It is source-agnostic.

```ts
type SemanticDeckPlanV1 = {
  planVersion: 1;
  title?: string;
  locale?: string;
  slides: SemanticSlideSpecV1[];
};

type SemanticSlideSpecV1 = {
  kind: SemanticTemplateKind;
  tone?: SlideTone;
  density?: SlideDensity;
  emphasis?: SlideEmphasis;
  slots: Partial<Record<SlotKey, SlotValue>>;
  speakerNotes?: string;
};
```

Rules:

- `compileSlide` accepts `SemanticSlideSpecV1`.
- `repairSemanticDeckPlan` repairs `SemanticDeckPlanV1` before compilation.
- Do not keep `AiDeckPlanV1` or `AiSlideSpec` compatibility exports in the
  generation domain.

### DeckV7 Provenance

The first implementation still persists only DeckV7. Store derivation metadata
in the existing `extra` extension points.

Deck-level metadata:

```ts
deck.metadata.extra.derivation = {
  pipelineVersion: 1,
  planner: "deterministic" | "ai",
  mode: "faithful" | "presentationRewrite",
  sourceDocumentId?: string,
  sourceContentHash: string,
  sourceBlockIds: string[],
  omittedBlockIds?: string[],
  generatedAt: string,
};
```

Node-level metadata:

```ts
node.source.extra.derivation = {
  pipelineVersion: 1,
  slidePlanId: string,
  slotKey?: SlotKey,
  sourceBlockIds: string[],
};
```

Rules:

- Continue using `NodeSourceMetadata.documentId`, `blockId`, `blockKind`,
  `contentHash`, and `linkedAt` for source review compatibility.
- `source.extra.derivation.sourceBlockIds` can carry multiple blocks even when
  the primary `blockId` points to one block.
- Keep JSON values strict enough for `safeParseDeckV7` to accept them through
  the existing `extra` fields.

## Deterministic Planner

The deterministic planner is the faithful baseline. It should not summarize,
infer new conclusions, or create closing/recommendation slides without source
content.

Initial rules:

| Source pattern                  | Planned slide behavior                                               |
| ------------------------------- | -------------------------------------------------------------------- |
| First `h1`                      | `cover` slide.                                                       |
| Later `h1`                      | `section` slide.                                                     |
| `h2`/`h3` plus paragraphs/lists | `content` or `detail` slide.                                         |
| Long paragraphs/lists           | Split by capacity, approximately five to six bullet items per slide. |
| Table block                     | Dedicated `table` slide.                                             |
| Visual block                    | Dedicated `visual-focus` slide.                                      |
| Horizontal rule                 | Force a section/chunk boundary.                                      |
| Empty/malformed content         | Return a blank DeckV7 through the existing safe fallback wrapper.    |

The deterministic planner should preserve reading order. It may trim text to
template capacity, but any trim must produce diagnostics or omitted-block/slot
metadata so preview/review can explain what happened.

## AI Planner

The AI planner consumes `DocumentSourcePlanV1`, not just an outline string. The
model should return `DocumentSlidePlanV1` JSON.

Prompt requirements:

- Return valid JSON only.
- Use source block ids exactly as supplied.
- Default mode is faithful: compress and organize source content without adding
  unsupported claims.
- `presentationRewrite` is explicit and may rewrite copy for presentation flow,
  but still must preserve source block ids.
- Choose template kinds from `SEMANTIC_TEMPLATE_KINDS` only.
- Fill only slots that exist for the selected template.
- Put overflow/context into `speakerNotes` or `omittedBlockIds`, not hidden
  unsupported slide text.
- Use visual ids only from the supplied visual inventory.

Repair requirements:

- Reject or retry if the model omits all slides.
- Repair invalid template kinds through the semantic template registry.
- Drop unknown slots and emit diagnostics.
- Enforce slot capacity policies.
- Validate source block ids against `DocumentSourcePlanV1`.
- If a slide/slot references missing source ids, remove those ids and emit a
  diagnostic; if no valid source remains for source-derived content, retry.

## Route Protocol

`POST /api/generate-deck` becomes AI-proposal-only. Deterministic derivation is
local editor baseline behavior and does not need this route.

Request:

```ts
type GenerateDeckRequest = {
  contentJson: unknown;
  options?: {
    length?: "short" | "medium" | "long";
    tone?: string;
    audience?: string;
    mode?: "faithful" | "presentationRewrite";
  };
  themePackageId?: ThemePackageId;
};
```

Response metadata:

```ts
type GenerateDeckResponseMetadata = {
  planner: "ai";
  mode: "faithful" | "presentationRewrite";
  tableSlideCount: number;
  schemaValid: boolean;
  themePackageId?: ThemePackageId;
  selectedKindCounts?: Record<string, number>;
};
```

Remove:

- request `generationMode`;
- response `requestedGenerationMode`;
- response `generationMode`;
- parser acceptance of `"package-template"`.

Status-code behavior remains aligned with the current AI route envelope: 400 for
bad request/empty usable content, 413 for oversized input, 429 for rate limit,
402 for insufficient credits, 502 for bad model output, 503 for Azure config,
and 504 for deadline timeout.

## Preview And Refresh

The first UI version keeps deck thumbnails as the primary preview. Add plan and
source summaries without exposing raw JSON:

- deck-level summary: slide count, new/changed/same;
- per-slide source summary: number of source blocks, omitted blocks, planner,
  mode;
- diagnostics review: plan repair, slot capacity, invalid source ids, model
  retries;
- apply still applies DeckV7.

Refresh behavior for the first version is full re-derive/regenerate plus diff:

```text
document changes
  -> source review marks stale/orphan links
  -> user requests derived refresh/regenerate
  -> planner produces a full new DocumentSlidePlanV1
  -> compile to DeckV7
  -> deck + plan/source diff
  -> apply
```

Do not implement partial slide regeneration in this migration.

## Hard-Cut Deletion Inventory

Delete these generation-domain package-template files and their direct tests:

| Delete                                                       | Replacement                                                       |
| ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `src/lib/ai/package-template-deck-plan.ts`                   | `SemanticDeckPlanV1` repair + `DocumentSlidePlanV1` repair.       |
| `src/lib/ai/package-template-deck-plan.test.ts`              | semantic plan repair and document slide plan tests.               |
| `src/lib/ai/package-template-deck-prompt.ts`                 | structured document slide plan AI prompt.                         |
| `src/lib/ai/run-package-template-deck-generation.ts`         | `runVnextDeckGeneration` updated to document slide plan pipeline. |
| `src/lib/ai/package-template-acceptance.test.ts`             | AI document slide plan acceptance tests.                          |
| `src/lib/presentation/package-template-materializer.ts`      | semantic template compiler path.                                  |
| `src/lib/presentation/package-template-materializer.test.ts` | compiler/provenance tests.                                        |

Also clean stale references in:

- `src/lib/limits/ai.ts` source comments;
- `docs/ai/generation.md` current deck-generation description;
- tests under `src/app/api/generate-deck/` and `src/lib/ai/` that assert
  `generationMode: "package-template"`;
- `src/lib/ai/deck-generation-request.ts` metadata parsing;
- any `AiDeckPlanV1` / `AiSlideSpec` imports in presentation-vnext tests and
  helpers.

Do not delete these as part of this plan:

- `src/components/presentation/**` legacy editor/runtime components;
- `src/lib/presentation/deck.ts` and related v6 export helpers;
- shared presentation utilities currently imported by vNext;
- public render/export fallbacks not owned by deck generation.

## Implementation Phases

### Phase 1: Semantic Plan Rename And Hard Cut

Create `src/lib/presentation-vnext/semantic-deck-plan.ts`.

Move and rename:

| From           | To                                       |
| -------------- | ---------------------------------------- |
| `SlotValue`    | `SlotValue` in `semantic-deck-plan.ts`   |
| `AiSlideSpec`  | `SemanticSlideSpecV1`                    |
| `AiDeckPlanV1` | `SemanticDeckPlanV1`                     |
| `isSlotValue`  | `isSlotValue` in `semantic-deck-plan.ts` |

Update:

- `template-compiler.ts` imports and docs;
- `ai-plan-repair.ts` to `semantic-deck-plan-repair.ts`, with
  `repairSemanticDeckPlan`;
- `editor-commands.ts`, `slide-spec.ts`, test builders, and presentation-vnext
  tests;
- barrel exports in `src/lib/presentation-vnext/index.ts`.

Acceptance checks:

- No `AiDeckPlanV1` or `AiSlideSpec` string remains in `src/` except optional
  historical notes in docs.
- `compileSlide` takes `SemanticSlideSpecV1`.
- Existing template compiler behavior is unchanged.

### Phase 2: Document Source And Slide Plan Layer

Add `src/lib/presentation-vnext/document-slide-plan.ts` with:

- `buildDocumentSourcePlanV1`;
- `deriveDocumentSlidePlanDeterministic`;
- `documentSlidePlanToSemanticDeckPlan`;
- `compileDocumentSlidePlanToDeckV7`;
- provenance stamping helpers.

Refactor `deck-derivation.ts` so `deriveDeckV7FromDocumentContent` becomes a
thin compatibility wrapper over the new plan pipeline. The wrapper stays
because callers still need a simple deterministic baseline function; the old
direct-to-deck internals do not stay.

Acceptance checks:

- Existing deterministic derive tests still pass after expectation updates for
  provenance metadata.
- New tests cover source plan sections, chunking, table slides, visual slides,
  source-block ids, omitted block metadata, and malformed content fallback.
- `safeParseDeckV7` accepts generated decks with derivation metadata.

### Phase 3: AI Document Slide Plan Pipeline

Replace the vNext prompt with a structured source-plan prompt. Update
`runVnextDeckGeneration` to:

1. build `DocumentSourcePlanV1`;
2. call AI for `DocumentSlidePlanV1`;
3. repair source ids, template kinds, controls, and slots;
4. convert to `SemanticDeckPlanV1`;
5. repair semantic plan;
6. compile/stamp/validate DeckV7.

Acceptance checks:

- AI tests assert the model receives structured sections/blocks, not only an
  outline.
- Invalid source ids produce diagnostics and either repair or retry.
- Visual slots only use supplied visual ids.
- Selected template kind counts still surface in route metadata.

### Phase 4: API Protocol Cleanup

Update `/api/generate-deck` parser, route logic, request helper, and tests:

- remove `generationMode` request parsing;
- remove `requestedGenerationMode` and `generationMode` metadata;
- add `planner: "ai"` and `mode` metadata;
- add `options.mode` validation;
- keep feature flag, quota, credits, and status-code behavior intact.

Acceptance checks:

- Posting `generationMode` no longer has special handling.
- Response metadata contains `planner` and `mode`.
- Client request body builder omits empty optional fields and can send `mode`.

### Phase 5: Preview Provenance Summary

Extend the AI preview surface with source-plan summary data already embedded in
the generated deck:

- deck-level derivation summary;
- per-slide source block count and omitted block count;
- diagnostics review for plan/source repair;
- no raw JSON display.

Acceptance checks:

- Current thumbnail diff remains intact.
- Applying the proposal still routes through `openAiGeneratedDeck` and save
  recovery.
- Deterministic fallback remains available when AI fails.

### Phase 6: Delete Package-Template Domain Files

After the new AI path and route tests pass, delete package-template files listed
in the hard-cut inventory. Remove stale docs and source comments in the same
change.

Acceptance checks:

- `rg "package-template|runPackageTemplateDeckGeneration|materializePackageTemplateDeck" src docs` returns only unrelated historical notes that are intentionally kept, or no matches.
- No route/test metadata expects `"package-template"`.

## Validation Plan

Run formatting first for touched files:

```bash
npx prettier --write <touched-files>
```

Run focused tests as the migration progresses:

```bash
npm run test:subsystem -- presentation
npm run test:subsystem -- ai
```

Run route and request tests if subsystem scripts are too broad or while
iterating:

```bash
node --import tsx --test src/app/api/generate-deck/*.test.ts
node --import tsx --test src/lib/ai/*deck*.test.ts
node --import tsx --test src/lib/presentation-vnext/*template*.test.ts
node --import tsx --test src/lib/presentation-vnext/deck-derivation.test.ts
```

Run typecheck because exported types and route metadata change:

```bash
npm run typecheck
```

Run documentation validation after docs are updated:

```bash
npm run docs:check
```

Before handoff, search for stale vocabulary:

```bash
rg "AiDeckPlanV1|AiSlideSpec|generationMode|package-template|runPackageTemplateDeckGeneration|materializePackageTemplateDeck" src docs
```

Expected final state:

- no `AiDeckPlanV1` / `AiSlideSpec` symbols in source;
- no package-template deck generation files;
- no `generationMode` API contract;
- deterministic and AI deck creation both pass through
  `DocumentSlidePlanV1 -> SemanticDeckPlanV1 -> DeckV7`;
- all generated decks validate through `safeParseDeckV7`.

## Rollback Strategy

This is a hard cut inside the generation domain, so rollback should be at the
commit/revert level, not by keeping compatibility branches in runtime code.

If the new AI planner fails under feature flag testing:

1. keep deterministic derivation enabled as the baseline path;
2. disable AI deck generation with the existing feature flag;
3. fix the structured prompt/repair path behind the flag;
4. do not restore package-template generation unless explicitly reopening this
   plan.

## Ownership

- Presentation owns the target DeckV7, template compilation, provenance, source
  links, preview, and editor apply/save behavior.
- AI owns route envelope, Azure calls, quota/credits, request/response parsing,
  and model prompt execution.
- Content owns `collectDocumentBlocks` and serialized Lexical projection.
- Data model owns DeckV7 validation and any future decision to persist full
  plans separately.
