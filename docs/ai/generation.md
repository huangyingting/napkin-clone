---
type: "architecture"
status: "current"
last_updated: "2026-07-01"
description: "Describes AI visual and deck generation routes, shared validation and billing flow, deck source extraction, vNext deck orchestration, template materialization, output validation, UI flow, quota, credits, and invariants."
---

# AI Generation

This document describes the AI generation routes for visuals and decks. Both
routes use the same operational envelope: validate before any model call,
resolve Azure configuration, enforce quota/credits, run with an abort deadline,
validate/normalize output, and charge only successful generations.

## Source Files

| Area                   | Source                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| Visual route           | [`src/app/api/generate/route.ts`](../../src/app/api/generate/route.ts)                                     |
| Deck route             | [`src/app/api/generate-deck/route.ts`](../../src/app/api/generate-deck/route.ts)                           |
| Azure client           | [`src/lib/ai/azure.ts`](../../src/lib/ai/azure.ts)                                                         |
| Deadline wrapper       | [`src/lib/ai/deadline.ts`](../../src/lib/ai/deadline.ts)                                                   |
| Visual generation core | [`src/lib/ai/generate.ts`](../../src/lib/ai/generate.ts)                                                   |
| Deck source extraction | [`src/lib/ai/deck-source.ts`](../../src/lib/ai/deck-source.ts)                                             |
| Deck route logic       | [`src/app/api/generate-deck/route-logic.ts`](../../src/app/api/generate-deck/route-logic.ts)               |
| Deck orchestration     | [`src/lib/ai/run-vnext-deck-generation.ts`](../../src/lib/ai/run-vnext-deck-generation.ts)                 |
| Deck prompt            | [`src/lib/ai/vnext-deck-prompt.ts`](../../src/lib/ai/vnext-deck-prompt.ts)                                 |
| AI plan repair         | [`src/lib/presentation-vnext/ai-plan-repair.ts`](../../src/lib/presentation-vnext/ai-plan-repair.ts)       |
| Template compiler      | [`src/lib/presentation-vnext/template-compiler.ts`](../../src/lib/presentation-vnext/template-compiler.ts) |
| Deck schema validation | [`src/lib/presentation-vnext/validation.ts`](../../src/lib/presentation-vnext/validation.ts)               |
| Quota                  | [`src/lib/ai/quota.ts`](../../src/lib/ai/quota.ts)                                                         |
| Credits                | [`src/lib/billing/credits.ts`](../../src/lib/billing/credits.ts)                                           |
| Usage ledger           | [`src/lib/billing/usage-ledger.ts`](../../src/lib/billing/usage-ledger.ts)                                 |

## Shared Route Flow

Both `/api/generate` and `/api/generate-deck` follow the same shape:

1. Parse JSON body.
2. Validate required input and option literals.
3. Reject oversized input before any model call.
4. Resolve Azure configuration; misconfiguration returns 503.
5. Identify the current user, if any.
6. Enforce anonymous quota or authenticated user rate limit.
7. Check credits and reserve usage for authenticated users.
8. Call Azure OpenAI through `withAbortDeadline`.
9. Validate/repair/normalize model output.
10. Capture usage and deduct credits on success; refund reservation on failure.

Status semantics are stable: 400 for bad request, 413 for oversized input, 429
for rate limit, 402 for insufficient credits, 502 for bad model output, 503 for
Azure config, and 504 for deadline timeout.

## Visual Generation

`POST /api/generate` accepts text plus optional visual tuning:

```json
{
  "text": "source text",
  "type": "flowchart",
  "orientation": "vertical",
  "detailLevel": "balanced",
  "stayCloserToText": true
}
```

The route calls `generateVisuals`, which asks the model for candidate visual
payloads and validates them against the current visual schema. The response is:

```json
{
  "candidates": [
    /* Visual[] */
  ]
}
```

The route never writes document state. The caller applies the chosen visual to a
Lexical `VisualNode`; persistence happens later through the normal document
autosave and visual mirror pipeline.

## Deck Generation

`POST /api/generate-deck` accepts serialized Lexical `contentJson` and optional
deck tuning:

```json
{
  "contentJson": { "root": { "children": [] } },
  "options": { "length": "medium", "tone": "concise", "audience": "team" }
}
```

The route is gated by the deck-generation feature flag. When disabled, it
returns 404 before doing any work.

Deck generation does not accept a document id. It derives text blocks and visual
inventory directly from the supplied `contentJson`, so there is no cross-document
read and no document permission lookup inside the route.

The pure core is:

```text
contentJson + visuals
  -> buildDeckSource
  -> { outline, visualInventory, truncated }
  -> runVnextDeckGeneration
  -> repairAiDeckPlan
  -> compileSlide
  -> safeParseDeckV7
  -> { deck, truncated }
```

The model returns a package-template slide plan: semantic `templateKind` values
plus slot content. The repair step normalizes that plan, and the materializer
fills installed theme-package templates into editable DeckV7 slide nodes. The
final deck must pass `safeParseDeckV7` before it can open in the editor.

Template text nodes are never left blank when a slot is absent. `compileSlide`
uses static template text when provided, otherwise it fills a readable fallback
derived from the node's slot or semantic role (`Title`, `Body text`, `Metric
label`, and similar) so generated preview decks remain inspectable before AI or
document content is applied.

Template materialization also maps local blueprint `zIndex` values into
type-based layer bands. By default, shape nodes render below media/table nodes,
connectors render above content objects, and text nodes render in the highest
content band so labels and copy remain visible over shapes and media unless a
user later changes z-order explicitly.

## UI Flow

The slide editor open button controls deck generation UI:

1. Build the deterministic baseline deck from the live Lexical state.
2. If AI deck generation is enabled, show a chooser: generate with AI or derive
   from document.
3. Show staged progress while generation runs.
4. Present a preview/diff surface comparing generated deck vs baseline.
5. Applying the generated deck opens the editor through the same fresh-deck path
   used by deterministic derivation.
6. Generation failure is surfaced to the caller; deterministic derivation is a
   separate user action.

## Quota And Credits

Anonymous callers receive a signed trial cookie plus a server-side hashed-IP
rate limit. Authenticated users are rate-limited by user id and charged credits
based on input size. Usage ledger reservation/capture/refund ensures failed
generations do not consume credits.

`isUnlimitedCreditsEnabled` bypasses credit deduction when enabled by
entitlements/configuration.

## Invariants

1. Input validation happens before Azure calls.
2. Azure misconfiguration never consumes quota or credits.
3. Authenticated credit usage is reserved before generation and captured only on
   success.
4. Deck output must pass current `safeParseDeckV7` before it reaches the editor.
5. Generated deck visuals may reference only the document visual inventory.
6. AI routes do not directly mutate documents.

## Primary Tests

- [`src/lib/ai/generate.test.ts`](../../src/lib/ai/generate.test.ts)
- [`src/lib/ai/deck-source.test.ts`](../../src/lib/ai/deck-source.test.ts)
- [`src/lib/ai/package-template-deck-plan.test.ts`](../../src/lib/ai/package-template-deck-plan.test.ts)
- [`src/lib/ai/package-template-acceptance.test.ts`](../../src/lib/ai/package-template-acceptance.test.ts)
- [`src/lib/ai/deck-generation-request.test.ts`](../../src/lib/ai/deck-generation-request.test.ts)
- [`src/lib/ai/quota.test.ts`](../../src/lib/ai/quota.test.ts)
- [`src/lib/billing/credits.test.ts`](../../src/lib/billing/credits.test.ts)
- [`src/lib/billing/usage-ledger.test.ts`](../../src/lib/billing/usage-ledger.test.ts)
