# Refactoring Roadmap

**Status:** Planning  
**Last updated:** 2026-06-25  
**Purpose:** Backlog seed for refactoring epics and issues based on the current
codebase audit.

This document is planning material, not a runtime architecture contract. It
records current refactoring pressure points and the preferred strategy for each
area so future epics and issues can be created with consistent scope.

## Guiding Principles

- Prefer current-schema code paths only. Do not keep runtime compatibility
  branches for superseded persisted shapes.
- Make each subsystem expose one clear boundary: parser/validator, service,
  route/action wrapper, or UI composition shell.
- Reuse local helpers only when the semantics are genuinely shared. Avoid a
  catch-all utility module.
- Delete unused future scaffolding unless it has a current owner, current entry
  point, and current verification path.
- Split large files by responsibility, not by arbitrary line count. Keep
  behavior stable while moving code.
- Keep server actions thin: authentication, capability checks, argument
  validation, cache invalidation. Put persistence orchestration in services.
- Keep UI components as composition shells where possible. Put interaction
  policy in hooks and pure geometry/state transforms in `src/lib`.
- Prefer small vertical refactors with focused tests over broad rewrites.

## Current Hotspots

The audit passes found these pressure points:

| Area                               | Current signal                                                                                          | Main risk                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Persisted deck reads               | Mixed handling of string `deckJson` and parsed JSON objects                                             | Hidden compatibility branch and inconsistent fallback behavior       |
| Brand assets                       | Completed R3 cleanup: asset-id writes, derived `logoAssetUrl` / `fontAssetUrl`, no legacy columns       | Keep future brand media changes asset-first                          |
| Slide editor UI                    | `slide-editor.tsx`, `slide-stage-editor.tsx`, and `slide-inspector.tsx` are very large                  | Hard-to-review changes, repeated state wiring, brittle UI ownership  |
| AI generation routes               | `/api/generate` and `/api/generate-deck` duplicate quota, credit, Azure, timeout, and error handling    | Security and billing behavior can drift between routes               |
| Shared primitives                  | `intFromEnv`, `messageFrom`, P2002 recovery, and JSON-object guards are duplicated or misplaced         | Inconsistent edge-case behavior and unclear ownership                |
| Server actions                     | Repeated `requireUser` plus `requireDocumentCapability` patterns                                        | Boilerplate and uneven action/service boundaries                     |
| Visual export/preflight            | Large export modules plus unused future-warning constant                                                | Export behavior is harder to extend safely                           |
| Dead code and future scaffolds     | Unused checks plus `reserved for future` / `stub` markers show small dormant paths                      | Future-only code can become permanent surface area                   |
| Asset subsystem                    | Slide and brand assets duplicate storage, upload validation, and orphan lifecycle patterns              | Security/lifecycle drift between asset domains                       |
| Document visual editing surfaces   | `visual-context-popover`, `block-spark`, `mobile-editing-sheet`, and related files are large            | Desktop/mobile visual editing behavior drifts                        |
| Command system                     | Shared envelope exists, but validation/execution is split across large switch-based modules             | Hard to add command surfaces without duplicating structure           |
| Non-AI API routes                  | Import, brand upload, and account export routes repeat request/error/service boundaries                 | Route logic grows instead of staying as thin HTTP adapters           |
| Prisma/schema tooling              | Provider selection and SQLite schema generation are mirrored across app, config, and seed scripts       | Generated schema/client drift and provider-specific surprises        |
| Access policy surfaces             | Document, workspace, share, invite, public route, and list-access policies are separate pure helpers    | Authorization rules can drift across private and public surfaces     |
| Collaboration runtime              | Inline and standalone collab entry points repeat health/config/authorize/flush assembly                 | Realtime behavior and observability can diverge by deployment mode   |
| Billing and entitlements           | Plan, brand gates, credits, usage ledger, Stripe, and mock provider lifecycle are spread across modules | Feature gates and billing state transitions can drift                |
| Diagnostics and logging            | Base logs, schema telemetry, error-code diagnostics, abuse logs, and MJS collab logs use separate paths | Safe metadata/redaction rules can become inconsistent                |
| Product catalogs and registries    | Icon, template, visual registry, and fixtures mix data, search, validation, and sample builders         | Catalog growth creates large files and duplicate metadata            |
| i18n/onboarding                    | Locale infrastructure is mostly disabled; onboarding has steps with no persisted completion signal      | Half-enabled product systems create permanent pending UX/code paths  |
| Lexical editor core                | Editor shell, tool registry, selection context, visual node, and import/persistence wiring are coupled  | Editor extension work requires touching route UI and core logic      |
| Design system and UI primitives    | DS tokens live in global CSS, TS class tokens, motion styles, and many local hard-coded class strings   | UI consistency depends on copy/paste instead of enforced primitives  |
| Comments and annotations           | Text comments, slide comments, anchors, unread state, and UI layers are split across route files        | Comment behavior and permissions can drift across anchor types       |
| Dashboard/document management      | Create/import/duplicate/search/delete/restore/maintenance are mixed in dashboard actions and UI state   | Document lifecycle changes become broad and fragile                  |
| Test fixtures and builders         | Large test suites, fixtures, E2E profiles, and product seed builders share ad hoc data structures       | Test data drifts from current schemas or leaks into product modules  |
| Client/server action boundaries    | Shared client components import route-local server actions and app-route modules directly               | Components become hard to reuse and route paths become API surface   |
| Runtime config and feature flags   | Server env, client `NEXT_PUBLIC_*`, feature gates, and script env reads are split by subsystem          | Feature behavior differs between server, client, scripts, and tests  |
| Deck model and validation          | Deck types, derivation, layout helpers, schema validation, and tests live in large coupled files        | Schema changes become broad and validator/model drift is likely      |
| Presentation runtime rendering     | SlideCanvas, in-app PresentMode, and PublicPresentViewer share rendering/navigation concerns unevenly   | Present surfaces can diverge in keyboard, layout, and a11y behavior  |
| Visual schema/render/layout        | Visual schema, renderer, layout engine, transforms, and editor overlays form a large implicit runtime   | Adding visual kinds/features requires edits across many modules      |
| AI prompt and repair pipeline      | Prompt schemas, JSON extraction, repair, normalization, retry, and source extraction are spread out     | Model contract changes can drift from validators and repair logic    |
| Export options and output profiles | Social presets, aspect ratios, watermark, background, SVG transforms, and dialogs are partly coupled    | Export UX/profile changes can diverge from renderer and preflight    |
| Content conversion/projection      | Markdown, Lexical JSON, plain text, document blocks, present blocks, and export blocks are separate     | Content projections can drift across editor, search, AI, export      |
| Theme and style cascade            | Deck tokens, style cascade, brand tokens, visual themes, and renderer/export styles are split           | Styling changes can diverge between editor, renderer, export, brand  |
| Auth session and route protection  | Edge-safe auth config, Node provider config, OAuth linking, proxy matchers, and seeding are coupled     | Auth/session behavior can drift between proxy, routes, and providers |
| App shell and navigation           | Site header mixes account lookup, credits, nav links, user menu, language switcher, and shortcuts       | Shell changes require touching billing/i18n/navigation concerns      |
| Server component view models       | RSC pages often query Prisma directly and pass route-shaped data to client components                   | Data loading contracts stay implicit and hard to reuse/test          |
| Auth and account lifecycle         | Login, signup, password reset, email verification, settings, and delete account repeat token/form flows | Security-sensitive account behavior can drift across forms/actions   |
| Public share/present rendering     | Share, embed, present, OG image, and public asset access repeat access, metadata, and deck resolution   | Public routes can diverge in SEO, fallback, attribution, and policy  |
| Tags/search/taxonomy               | Tag normalization, slug collision, dashboard filters, and server search are split across route actions  | Search/filter behavior and tag identity can become inconsistent      |
| Accessibility and shortcuts        | A11y helpers, keyboard shortcut catalog, canvas a11y, focus traps, and UI dialogs are separate systems  | Keyboard/a11y coverage can regress as surfaces split                 |
| Performance budgets and limits     | Size/time limits live in actions, deck limits, perf budgets, export preflight, and image helpers        | Hard caps and warning thresholds can disagree                        |

## Epic Map

| Epic | Title                              | Primary outcome                                                  | Dependencies                |
| ---- | ---------------------------------- | ---------------------------------------------------------------- | --------------------------- |
| R1   | Canonical Persisted Deck Boundary  | One current-shape deck read/parse path                           | None                        |
| R2   | Remove Legacy Presentation Paths   | No unused migration helpers or old layout command branches       | R1 preferred first          |
| R3   | Brand Asset Contract Cleanup       | Asset-first brand DTO/schema, no legacy media columns            | Data migration confirmation |
| R4   | Slide Editor Modularization        | Thin slide editor shell and smaller owned panels/hooks           | R2 preferred first          |
| R5   | AI Generation Route Harness        | Shared access, quota, credit, Azure, and error handling          | None                        |
| R6   | Shared Primitive Consolidation     | Small, owned shared helpers with duplicated semantics removed    | Can run in parallel         |
| R7   | Server Action Boundary Cleanup     | Consistent action context helpers and service ownership          | Can run in parallel         |
| R8   | Visual Export Subsystem Cleanup    | Smaller export/preflight modules and no unused future constants  | Can run in parallel         |
| R9   | Dead Code and Regression Gates     | Repeatable unused-code checks and cleanup policy                 | After initial cleanup       |
| R10  | Unified Asset Subsystem            | Shared asset storage/upload/lifecycle core with scoped domains   | R3 coordination             |
| R11  | Document Visual Editing Surfaces   | Shared visual editing/generation surface boundaries              | R6 and R12 helpful          |
| R12  | Command System Registry Cleanup    | Smaller command envelope, validators, and executors              | R2 preferred first          |
| R13  | Non-AI API Route Boundaries        | Thin import/export/upload routes backed by services              | R6 helpful                  |
| R14  | Prisma Schema and Tooling Hygiene  | Provider/schema/client generation cannot drift silently          | Can run in parallel         |
| R15  | Access Policy Surface Cleanup      | One authorization vocabulary across private/public surfaces      | R7 helpful                  |
| R16  | Collaboration Runtime Boundary     | Shared collab deployment assembly, health, logging, and config   | R14 helpful                 |
| R17  | Billing Domain Boundary            | Unified plan, entitlement, credit, ledger, and provider flows    | R5 helpful                  |
| R18  | Diagnostics and Logging Platform   | One safe structured logging and diagnostic taxonomy              | Can run in parallel         |
| R19  | Catalog and Registry Boundaries    | Data-only catalogs with generated/validated indexes              | Can run in parallel         |
| R20  | i18n and Onboarding Scope Cleanup  | Explicit product decision for partial systems and signals        | Product decision needed     |
| R21  | Lexical Editor Core Boundary       | Route-independent editor nodes, tools, context, and plugin ports | R11/R26 helpful             |
| R22  | Design System Boundary             | Token-owned UI primitives and fewer local class-string forks     | Can run in parallel         |
| R23  | Comments and Annotations Boundary  | Shared comment service, anchor model, permissions, and UI ports  | R15 helpful                 |
| R24  | Document Management Boundary       | Services for create/import/duplicate/search/trash/maintenance    | R15/R13 helpful             |
| R25  | Test Fixture and Builder Platform  | Current-schema builders shared by tests, seeds, and E2E profiles | R1/R14 helpful              |
| R26  | Client/Server Action Ports         | Reusable client components receive typed action ports            | R7/R13 helpful              |
| R27  | Runtime Config and Feature Flags   | One server/client/script config inventory and flag policy        | R14/R17/R20 helpful         |
| R28  | Auth and Account Lifecycle         | Shared token, form, email, settings, and account-deletion flows  | R17/R27 helpful             |
| R29  | Public Render Surface Boundary     | Shared public share/embed/present/OG/deck resolution services    | R1/R15 helpful              |
| R30  | Tags, Search, and Taxonomy         | One tag/search service and taxonomy identity policy              | R24 helpful                 |
| R31  | Accessibility and Shortcuts        | Unified a11y assertions, shortcut registry, and focus policies   | R22 helpful                 |
| R32  | Performance Budgets and Limits     | One source of truth for hard caps, warnings, and budget checks   | R18 helpful                 |
| R33  | Deck Model and Validation Boundary | Smaller deck type modules, derivation, and validators            | R1/R25 helpful              |
| R34  | Presentation Runtime Boundary      | Shared present navigation, slide rendering, and viewer shells    | R22/R31 helpful             |
| R35  | Visual Runtime Boundary            | Explicit schema/layout/renderer/transform extension points       | R19/R25 helpful             |
| R36  | AI Prompt and Repair Pipeline      | One model-contract pipeline tied to validators and registries    | R5/R19 helpful              |
| R37  | Export Options and Output Profiles | Profile-owned export options, transforms, dialogs, and preflight | R8/R32 helpful              |
| R38  | Content Conversion Pipeline        | One content projection contract across editor/search/AI/export   | R21/R33 helpful             |
| R39  | Theme and Style Cascade Boundary   | One style cascade contract across deck, brand, visual, export    | R22/R33 helpful             |
| R40  | Auth Session and Route Protection  | Separate edge auth config, provider lifecycle, and route guards  | R28/R27 helpful             |
| R41  | App Shell and Navigation Boundary  | Header/nav/account chrome driven by explicit shell view models   | R17/R20/R31 helpful         |
| R42  | Server Component View Models       | Route-independent RSC data loaders and serialized view models    | R24/R26 helpful             |

## R1 - Canonical Persisted Deck Boundary

### Problem

Persisted deck handling now has a canonical boundary:
`src/lib/presentation/persisted-deck.ts` exports
`normalizePersistedDeckJson(raw: unknown): unknown`. Runtime persisted-deck
readers use that helper before `safeParseDeck`; direct `JSON.parse(deckJson)`
branches are not supported.

Serialized JSON strings are persisted-schema drift, not runtime input. Prisma
JSON columns are expected to arrive as parsed JSON values, and audit reports
string `Document.deckJson` values as violations with a clear reason.

### Best Strategy

Create one canonical persisted-deck boundary and remove scattered string parsing.
The preferred current-shape policy is strict: Prisma JSON columns are expected
to arrive as parsed JSON values, not serialized JSON strings. A string deck
should be treated as invalid persisted data and surfaced by schema audit, not
silently parsed in runtime save/render paths.

### Requirements

- Add or rename a focused module such as
  `src/lib/presentation/persisted-deck.ts`.
- Export a single helper for raw persisted values, for example
  `normalizePersistedDeckJson(raw: unknown): unknown`.
- Preserve the current policy that strings are not valid persisted deck JSON.
- Replace direct `typeof deckJson === "string" ? JSON.parse(...)` call sites.
- Keep `safeParseDeck` as the only deck schema validator.
- Keep public present/embed fallback behavior: invalid/missing deck falls back
  to a deck derived from document blocks.
- Keep save conflict and revision-token semantics unchanged.
- Add tests that prove serialized strings are rejected consistently everywhere
  the canonical helper is used.

### Suggested Issues

1. **R1.1 - Introduce persisted deck boundary**
   - Move or rename the persisted deck raw normalizer to a current-shape
     persisted-deck module.
   - Update imports in page, audit, and persistence code.
   - Add tests for `null`, `undefined`, object deck, malformed object, and
     serialized string.

2. **R1.2 - Remove runtime string parsing for deck JSON**
   - Remove `JSON.parse(document.deckJson)` branches in document actions and
     persistence service.
   - Ensure invalid stored deck results still return the existing user-facing
     errors or safe fallbacks.

3. **R1.3 - Align schema audit with runtime policy**
   - Make audit report string `deckJson` as a violation with a clear reason.
   - Ensure docs say serialized deck strings are drift, not supported input.

### Verification

- Focused unit tests for the persisted-deck helper.
- Existing deck parse, save conflict, schema audit, and public present tests.
- `npm run typecheck` if the helper touches shared presentation types.

## R2 - Remove Legacy Presentation Paths

### Status

Completed. Presentation runtime now has a single current layout command path:
applying a layout preserves authored content, and resetting a layout only
restores bound element positions without changing content, inserting
placeholders, or reordering elements.

Role/slot enrichment is not performed in the application layer. Legacy decks
without those optional fields remain valid as-is; any future persisted stamping
must be implemented as an explicit offline migration descriptor.

The public deck layout surface no longer exposes placeholder-reinstall helpers.

## R3 - Brand Asset Contract Cleanup

### Problem

Completed. Brand media is asset-backed end to end:

- Prisma `Brand` stores `logoAssetId` and `fontAssetId`; legacy `logoUrl` and
  `fontDataUrl` columns are gone.
- `BrandStyle` exposes derived protected asset URLs as `logoAssetUrl` and
  `fontAssetUrl`.
- `BrandInput` accepts asset ids only; display URLs stay local to reads or client
  preview state.
- The one-off legacy media migration code path has been removed.

### Best Strategy

Finish the asset-first contract, then remove legacy migration code. Rename
runtime DTO fields so derived URLs are visibly read-only display URLs and cannot
be confused with persisted legacy columns. After migration is confirmed, drop
legacy Prisma columns and delete the one-off migration script/tests.

### Requirements

- Rename runtime display fields, for example:
  - `BrandStyle.logoUrl` -> `logoAssetUrl`
  - `BrandStyle.fontDataUrl` -> `fontAssetUrl`
- Keep presentation/deck master fields named `logoUrl` only where they mean a
  renderable URL on the deck model, not a Brand table column.
- Remove `logoUrl` and `fontDataUrl` from `BrandInput`; create/update actions
  should accept asset ids only.
- Keep upload routes returning `{ url, assetId }`; the UI may keep local preview
  URLs in component state, but submit payloads must send only asset ids.
- Update `brand-studio`, `brand/schema`, `brand/serialize`, brand font helpers,
  brand token conversion, and tests.
- Run the brand asset migration against target data before schema cleanup.
- Drop legacy Prisma columns after data is migrated and verified.
- Delete one-off legacy media migration code after the schema no longer has
  legacy columns.
- Remove package scripts for deleted one-off migration commands.

### Suggested Issues

1. **R3.1 - Rename derived brand media URL fields**
   - Update `BrandStyle`, serializers, UI, and tests.
   - Keep compatibility out of runtime responses; do not return both old and
     new names.

2. **R3.2 - Make brand writes asset-id only**
   - Remove display URL fields from `BrandInput`.
   - Ensure create/update actions never write legacy URL columns.
   - Keep preview-only URLs local to the client component.

3. **R3.3 - Drop legacy Brand media columns**
   - Confirm migration completion and audit target data.
   - Update Prisma schema and generated client.
   - Remove code references to legacy columns.

4. **R3.4 - Delete brand migration code**
   - Remove one-off migration core, CLI, tests, package script, and docs
     references after R3.3.

### Verification

- Brand schema, serialization, asset lifecycle, and brand studio tests.
- Focused typecheck after Prisma generation.
- E2E brand upload flow if available.

## R4 - Slide Editor Modularization

### Problem

The slide editing UI has several very large files:

- `src/components/presentation/slide-editor.tsx`
- `src/components/presentation/slide-stage-editor.tsx`
- `src/components/presentation/slide-inspector.tsx`
- Supporting surfaces such as `slide-canvas.tsx` and `present-mode.tsx` are also
  substantial.

The `src/lib/presentation` layer is already well decomposed and tested, so the
main opportunity is to thin the UI composition layer and clarify ownership of
state, callbacks, and panels.

### Best Strategy

Split by UI ownership and interaction boundary while preserving behavior. Keep
`SlideEditor` as the composition root. Move cohesive state machines into hooks,
move repeated surface pieces into small components, and keep pure geometry/state
logic in `src/lib/presentation`.

### Requirements

- Do not redesign the slide editor as part of this epic.
- Keep keyboard behavior, focus trap behavior, autosave semantics, and conflict
  handling stable.
- Extract hooks with narrow ownership, for example:
  - `useSlideSelection`
  - `useSlideClipboard`
  - `useSlideEditorCommit`
  - `useSlideEditorAutosaveQueue`
  - `useSlideZoomAndFit`
- Extract `slide-editor.tsx` subcomponents that are already visually distinct:
  - top toolbar
  - slide rail
  - bottom dock
  - merge summary dialog
  - document insertable panel
  - selection toolbar
- Split `slide-inspector.tsx` by tab/panel ownership:
  - Arrange
  - Text
  - Media
  - Effects
  - Layers
  - Slide
  - Source
- Split `slide-stage-editor.tsx` around interaction systems:
  - pointer/select/drag wiring
  - resize/rotate handles
  - marquee selection
  - connector editing
  - element toolbar bridge
- Keep server actions out of lower-level presentation components; pass callbacks
  from the composition root.
- Avoid new global stores unless a concrete cross-surface state problem demands
  them.

### Suggested Issues

1. **R4.1 - Extract slide editor shell components**
   - Move bottom dock, selection toolbar, merge dialog, and slide size control
     into dedicated files.
   - No behavior changes.

2. **R4.2 - Extract selection and clipboard hooks**
   - Move selected element ids, effective selection, copy/cut/paste, and focus
     target decisions into tested hooks or pure helpers.

3. **R4.3 - Extract autosave and commit queue hook**
   - Centralize pending patches, save status, retry, and explicit flush wiring.
   - Preserve patch-first save and whole-deck fallback behavior.

4. **R4.4 - Split slide inspector tabs**
   - Create one file per major tab, with typed props and no hidden shared state.
   - Keep common control primitives shared through existing UI components.

5. **R4.5 - Split stage interaction systems**
   - Separate pointer/marquee/resize/connector concerns.
   - Move pure calculations to `src/lib/presentation` only when they can be
     unit-tested without React.

### Verification

- Focused presentation unit tests for moved pure helpers.
- Existing slide editor, layout, autosave, and stage interaction tests.
- Relevant Playwright slide smoke/regression tests after each vertical slice.

## R5 - AI Generation Route Harness

### Problem

`src/app/api/generate/route.ts` and `src/app/api/generate-deck/route.ts` repeat
large parts of the same route flow:

- JSON body parsing and object validation.
- Azure config lookup and abort-deadline wrapping.
- Authenticated user rate limiting.
- Anonymous IP throttle and signed trial cookie handling.
- Credit pre-check, usage reservation, capture, and refund.
- Standard status code and error response handling.
- Request id and denial logging.

The routes should differ in payload parsing and generation execution, not in
quota, billing, or security mechanics.

### Best Strategy

Create an AI generation route harness that owns shared access, quota, credit,
Azure, deadline, and error mechanics. Keep route-specific parsing and generation
as injected functions.

### Requirements

- Add a focused server-only module, for example
  `src/lib/ai/generation-route.ts`.
- Shared harness should accept route configuration:
  - log scope
  - authenticated rate-limit subject prefix
  - anonymous IP subject prefix
  - credit-cost input
  - Azure max output token override
  - success response builder
  - route-specific generator callback
- Preserve exact status semantics:
  - 400 invalid payload or empty input
  - 402 insufficient credits
  - 413 oversized input
  - 429 rate limit with `Retry-After`
  - 502 invalid model output
  - 503 Azure config missing
  - 504 timeout
- Preserve signed anonymous cookie behavior and one-year max age.
- Preserve usage ledger reserve/capture/refund semantics.
- Preserve per-route rate-limit namespaces so visual and deck generation do not
  collide unless intentionally changed.
- Keep `generate-deck` feature flag outside the shared harness so disabled
  routes return 404 before work begins.
- Add tests with fake dependencies for authenticated success, anonymous success,
  rate limit, insufficient credits, timeout, and generation failure.

### Suggested Issues

1. **R5.1 - Extract shared AI route response and payload utilities**
   - Move `errorResponse`, JSON object parsing, and abort/Azure setup into a
     testable server-only helper.

2. **R5.2 - Extract generation access and billing harness**
   - Centralize user/anonymous quota, credit, and ledger handling.
   - Keep route-specific subject prefixes configurable.

3. **R5.3 - Migrate `/api/generate` to the harness**
   - No API contract changes.
   - Add regression tests for existing status codes.

4. **R5.4 - Migrate `/api/generate-deck` to the harness**
   - Keep feature flag and deck-specific output-token budget.
   - Preserve deck metrics logging.

### Verification

- AI route focused tests with mocked dependencies.
- Existing `src/lib/ai/**/*.test.ts`.
- `npm run typecheck`.

## R6 - Shared Primitive Consolidation

### Problem

Some repeated helpers have identical or near-identical semantics, while others
are shared but live under a subsystem-specific path:

- `intFromEnv` appears in both `src/lib/rate-limit.ts` and
  `src/lib/ai/quota.ts`.
- `messageFrom` appears in visual generation request handling and deck
  generation request handling.
- P2002 recovery lives in `src/lib/slides/p2002-fallback.ts` but is used by
  brand asset code too.
- `isPlainObject` appears across schema validators and route parsers.
- CLI helpers such as `printLines` repeat across scripts.

### Best Strategy

Consolidate only primitives with identical semantics and a clear owner. Do not
create a general `utils.ts`. Leave local helpers local when their semantics are
schema-specific.

### Requirements

- Move `withP2002Fallback` to a neutral DB helper location such as
  `src/lib/db/p2002-fallback.ts` or `src/lib/prisma/p2002-fallback.ts`.
- Add an explicit helper for positive integer env parsing, for example
  `readPositiveIntEnv(name, fallback)`, under an environment/config module.
- Create a small response-payload helper for extracting a non-empty `error`
  string from JSON payloads; choose one whitespace policy and update callers.
- Keep `isPlainObject` local in schema validators unless a shared version avoids
  duplication without weakening context-specific messages.
- Consolidate CLI printing only if scripts remain after migration cleanup.
- Update tests to cover the shared helper once, and remove duplicate tests that
  only restate helper behavior at each caller.

### Suggested Issues

1. **R6.1 - Move P2002 recovery helper to DB-owned module**
   - Update slides, brand, and migration imports.
   - Keep behavior and tests unchanged.

2. **R6.2 - Consolidate positive integer env parsing**
   - Replace duplicate `intFromEnv` functions.
   - Test unset, invalid, zero, negative, and valid values.

3. **R6.3 - Consolidate API error-message extraction**
   - Replace duplicated `messageFrom` helpers.
   - Standardize trimming behavior.

4. **R6.4 - Review object guards before extracting**
   - Keep schema-specific guards local unless a shared helper demonstrably
     reduces repeated route parsing without losing error context.

### Verification

- Focused helper tests.
- Affected caller tests only.
- `npm run typecheck`.

## R7 - Server Action Boundary Cleanup

### Problem

Server action modules repeatedly perform the same boilerplate:

- `requireUser()`
- `requireDocumentCapability(user.id, documentId, capability)`
- direct Prisma call
- optional `ActionResult`
- optional cache revalidation

This is visible in document actions, slide comment lifecycle/read actions, and
slide asset upload actions.

### Best Strategy

Introduce small action-context helpers that standardize authentication and
document capability checks without hiding business logic or persistence
orchestration. Keep services as the place for transactions and domain writes.

### Requirements

- Add a helper such as `requireDocumentActionContext(documentId, capability)`
  that returns the current user after capability validation.
- Do not convert all actions to a broad wrapper that catches every exception;
  preserve existing user-facing `ActionResult` behavior where callers rely on
  it.
- Do not move Prisma transactions into actions if a service already owns them.
- Apply first to small modules:
  - slide comment lifecycle
  - slide comment unread/read
  - slide asset upload
- Apply to larger document actions only after helper semantics are proven.
- Consider a tiny revalidation helper for repeated document route invalidation,
  but keep public share revalidation in the persistence service where it already
  belongs.

### Suggested Issues

1. **R7.1 - Add document action context helper**
   - Implement and test authenticated, unauthenticated, and unauthorized paths.

2. **R7.2 - Migrate slide comment actions to action context helper**
   - Remove repeated auth/capability boilerplate.
   - Keep query/update behavior unchanged.

3. **R7.3 - Migrate slide asset upload action to action context helper**
   - Preserve validation, dedup, storage, and P2002 recovery behavior.

4. **R7.4 - Review document actions for service extraction**
   - Move any remaining persistence orchestration from actions into services if
     it is larger than auth/validation/revalidation.

### Verification

- Existing auth and document permission tests.
- Focused tests for affected action helpers where practical.
- `npm run typecheck`.

## R8 - Visual Export Subsystem Cleanup

### Problem

Export-related code is functional but large and partly mixed:

- `src/lib/visual/deck-export.ts` handles deck export orchestration and many
  operation types.
- `src/lib/visual/document-export.ts` mixes document block collection and export
  presentation details.
- `src/lib/visual/pptx-shapes.ts` is a large native-shape mapping module.
- `src/lib/visual/export-preflight.ts` contains an unused future-warning map.

Important distinction: raster/image fallback for unsupported export features is
current product behavior, not old-data compatibility. It should not be removed
unless native support replaces it.

### Best Strategy

Split export code by target and responsibility, and delete unused future-only
constants. Keep raster fallback behavior as a current capability until each
feature has verified native export support.

### Requirements

- Delete `_PPTX_FIDELITY_WARNING_FEATURES` if no current preflight rule uses it.
- If those warnings are needed, wire them into actual preflight diagnostics and
  test them; do not keep an unused constant.
- Split PPTX native shape spec generation into smaller files by visual family
  only when the split has clear ownership and tests remain stable.
- Separate document block collection from export rendering concerns if
  `document-export.ts` continues to grow.
- Keep `isImageFallback` and raster fallback semantics stable.
- Preserve export output behavior and download filename sanitization.
- Avoid adding browser-only dependencies to pure export modules.

### Suggested Issues

1. **R8.1 - Remove or wire export preflight warning map**
   - Delete unused constant or implement current warnings.
   - Add/update preflight tests.

2. **R8.2 - Extract PPTX fallback operation builders**
   - Move raster fallback operation construction out of deck export
     orchestration.
   - Preserve operation output shape.

3. **R8.3 - Split native PPTX shape mapping by visual family**
   - Keep a single public `visualToNativeSpecs` facade.
   - Move internals into family-specific modules with existing tests unchanged.

4. **R8.4 - Separate document block collection from document export rendering**
   - Keep `collectDocumentBlocks` stable as a public pure boundary.
   - Move export-only assembly to a target-specific module.

### Verification

- `src/lib/visual/pptx-shapes.test.ts`
- `src/lib/visual/deck-export.test.ts`
- `src/lib/visual/document-export.test.ts`
- `src/lib/visual/export-preflight.test.ts`
- Focused export E2E if output behavior changes.

## R9 - Dead Code and Regression Gates

### Problem

Running TypeScript with unused checks currently reports concrete cleanup items:

- Unused `element` parameter in `src/lib/presentation/media-hit-geometry.ts`.
- Unused `_PPTX_FIDELITY_WARNING_FEATURES` in
  `src/lib/visual/export-preflight.ts`.
- Unused test callback parameter in
  `src/lib/presentation/patch-autosave.test.ts`.
- `src/lib/import/index.ts` accepts `filename` only to `void` it as "reserved
  for future format-specific hints".
- `src/lib/presentation/slide-comment-anchors.ts` still labels current anchor
  transforms as "stubs" even though several are used by lifecycle actions.

The project does not currently enforce unused local/parameter checks in the
default typecheck script.

### Best Strategy

Clean the known unused code first, then add a lightweight unused-code check that
can be run before refactor-heavy merges. Avoid introducing a large dependency
unless TypeScript checks prove insufficient.

### Requirements

- Remove or use the three known unused symbols.
- Add an optional script such as `typecheck:unused` if the team wants a focused
  guard before enabling stricter compiler options globally.
- Consider enabling `noUnusedLocals` and `noUnusedParameters` in `tsconfig.json`
  only after generated files, tests, and intentional public exports are checked.
- Do not use unused checks to remove exported APIs without first proving no
  external or route-level caller exists.
- Treat `reserved for future`, `stub`, and unused placeholder parameters as
  cleanup candidates unless there is a current issue and owner.
- Add cleanup to the refactor issue checklist: every issue must run focused
  unused/type checks for touched files or the smallest reliable scope.

### Suggested Issues

1. **R9.1 - Remove current unused symbols**
   - Clean the three known findings.
   - Run `npx tsc --noEmit --noUnusedLocals --noUnusedParameters --pretty false`.

2. **R9.2 - Add unused-code check script**
   - Add script only if it passes after R9.1.
   - Document when to run it in the release/refactor workflow.

3. **R9.3 - Evaluate strict unused compiler options**
   - Decide whether to enable globally or keep as an explicit script.
   - Avoid blocking generated-code workflows.

4. **R9.4 - Remove future-only placeholders**
   - Drop unused placeholder parameters such as import `filename`, or make them
     part of a real parser contract.
   - Rename stale "stub" comments when the code is now production behavior.
   - Keep placeholder UI states that are current product behavior.

### Verification

- `npx tsc --noEmit --noUnusedLocals --noUnusedParameters --pretty false`
- `npm run typecheck`

## R10 - Unified Asset Subsystem

### Problem

Slide assets and brand assets now solve the same class of problems in parallel:

- Storage adapters and URL generation live under slide assets, then brand assets
  reuse the slide `LocalAssetStorageAdapter` while owning a separate singleton.
- MIME-to-extension maps and storage-key derivation are implemented separately
  for slide and brand assets.
- Upload validation is split between `src/lib/slides/asset-upload.ts` and
  `src/lib/brand/upload.ts` with similar error shapes and formatting.
- Orphan marking and retention/purge flows are duplicated across
  `src/lib/slides/asset-orphan.ts` and `src/lib/brand/asset-orphan.ts`.
- Upload routes/actions implement similar checksum, dedup, storage, and DB row
  creation flows.

The scopes are genuinely different: slide assets are document-scoped; brand
assets are owner/brand-scoped. The duplication should be removed at the lifecycle
primitive level without erasing those security boundaries.

### Best Strategy

Create a neutral asset subsystem with shared primitives for storage, MIME policy,
upload validation, checksum/key derivation, upsert race recovery, and orphan
retention. Keep domain-specific access checks and scoping rules in slide/brand
modules as thin adapters over the shared core.

### Requirements

- Add a neutral module group such as `src/lib/assets/`.
- Move `AssetStorageAdapter` and `LocalAssetStorageAdapter` out of
  `src/lib/slides` into the neutral asset layer.
- Model domain-specific asset policies declaratively:
  - storage root
  - URL prefix
  - scope id kind (`documentId`, `ownerId`, `brandId`)
  - accepted MIME types
  - MIME-to-extension mapping
  - max bytes and optional dimension limits
- Keep slide and brand access-control routes separate; do not create one generic
  serving endpoint unless the authorization model is identical.
- Consolidate upload error types and formatting where semantics match.
- Consolidate checksum/key/upsert flow so slide and brand uploads recover from
  P2002 races consistently.
- Extract a shared retention/purge helper that accepts a domain-specific live-ref
  collector and DB scope query.
- Keep current retention windows and soft-delete behavior unchanged.
- Keep SVG accepted only for brand logos unless slide SVG sanitization is added.

### Suggested Issues

1. **R10.1 - Move storage adapter to neutral asset module**
   - Create `src/lib/assets/storage.ts`.
   - Update slide and brand imports.
   - Preserve default roots and URL prefixes.

2. **R10.2 - Introduce asset upload policy helpers**
   - Define reusable validation and MIME extension policy helpers.
   - Port slide upload validation first, then brand logo/font validation.
   - Keep error messages stable.

3. **R10.3 - Consolidate asset store/upsert flow**
   - Extract checksum, storage key, storage write, Asset row upsert, and P2002
     recovery into a domain-configured helper.
   - Keep document/brand ownership checks outside the helper.

4. **R10.4 - Consolidate orphan retention and purge lifecycle**
   - Extract shared soft-delete/purge control flow.
   - Keep slide deck-reference collection and brand live-reference collection as
     domain-specific callbacks.

5. **R10.5 - Align asset tests around shared contracts**
   - Move duplicated tests to neutral asset tests where appropriate.
   - Keep domain tests for authorization and scope-specific behavior.

### Verification

- Slide asset storage/upload/orphan tests.
- Brand asset storage/upload/orphan/lifecycle tests.
- Protected asset route tests for slide and brand assets.
- Focused upload E2E if available.
- `npm run typecheck`.

## R11 - Document Visual Editing Surfaces

### Problem

The document editor has several large, overlapping visual-editing surfaces:

- `src/app/app/documents/[id]/visual-context-popover.tsx`
- `src/app/app/documents/[id]/block-spark.tsx`
- `src/app/app/documents/[id]/mobile-editing-sheet.tsx`
- `src/app/app/documents/[id]/visual-editor.tsx`
- `src/app/app/documents/[id]/visual-card.tsx`
- `src/app/app/documents/[id]/inline-comments-layer.tsx`
- `src/app/app/documents/[id]/lexical-editor.tsx`

There is also inconsistent command usage: some visual surfaces call visual
transform helpers directly, while others use the visual command adapter. Desktop
and mobile generation surfaces each carry their own option/result UI state even
though they call the same generation request helper.

### Best Strategy

Split visual editing into shared hooks and panel components. Make command-based
visual mutation the default write path for UI surfaces, with direct transform
calls reserved for pure tests or local preview-only transformations.

### Requirements

- Keep Lexical node mutation code isolated to document-editor boundary modules.
- Extract shared visual-generation state for desktop spark and mobile sheet:
  - selected source text/target
  - generation options
  - request/cancel/loading/error state
  - candidate grouping and insertion
- Extract shared visual formatting panels:
  - theme/display style
  - kind/layout/aspect/canvas
  - node style
  - edge style
  - effects
  - export/download entry points
- Route persistent visual edits through `applyVisualCommand` or the command
  adapter so command validation, coalescing, history keys, and side effects stay
  consistent.
- Keep direct `mergeVisualContent`/transform usage only where the caller is not
  committing a user-visible edit.
- Split `visual-context-popover.tsx` into a shell plus owned panel files.
- Split `block-spark.tsx` into anchor detection, generation state, and result UI.
- Split `mobile-editing-sheet.tsx` into formatting toolbar, generation panel,
  and visual panel sections.
- Keep keyboard, focus, and pointer behavior stable across desktop and mobile.

### Suggested Issues

1. **R11.1 - Extract shared visual generation hook**
   - Share generation options and request state between block spark and mobile
     sheet.
   - Preserve existing credit-error and empty-result behavior.

2. **R11.2 - Move visual popover panels into owned files**
   - Keep `VisualContextPopover` as a positioning/shell component.
   - Move theme/style/node/edge/effects/export sections to smaller components.

3. **R11.3 - Standardize visual edit commits on commands**
   - Replace persistent direct transform calls with `applyVisualCommand` where
     appropriate.
   - Keep command side effects and coalescing behavior tested.

4. **R11.4 - Split mobile editing sheet by surface**
   - Extract text toolbar, visual panel, and generation panel.
   - Reuse shared hooks from R11.1.

5. **R11.5 - Clarify Lexical/document editor shell boundaries**
   - Keep `lexical-editor.tsx` focused on document composition and persistence
     wiring.
   - Move feature panels out of the document shell where possible.

### Verification

- Existing visual command and visual generation tests.
- Focused component smoke tests if available.
- Playwright document editor and mobile editing smoke tests.
- `npm run typecheck`.

## R12 - Command System Registry Cleanup

### Problem

The project has a useful cross-surface command concept, but its implementation
is still hard to extend:

- `src/lib/commands/command-envelope.ts` owns envelope types, shared affected-id
  helpers, visual payload validation constants, slide command type lists, deck
  acceptance, and adapters in one large module.
- `src/lib/presentation/slide-commands.ts` is a large switch-based executor
  with command types, patch construction, execution, coalescing, and replay.
- `src/lib/commands/visual-commands.ts` has another large switch-based executor
  and coalescing implementation.
- Cross-surface tests explicitly note there is no runtime command bus; callers
  simulate mixed replay manually.

The goal is not necessarily to add a global runtime bus. The immediate need is
to split command metadata, validators, executors, adapters, and replay semantics
so new command surfaces do not copy the same structure again.

### Best Strategy

Introduce typed command registries per surface. Keep execution pure and local to
each surface, but move command metadata and validation rules out of monolithic
switches. Split the envelope core from deck and visual payload validation.

### Requirements

- Split `command-envelope.ts` into focused modules:
  - envelope core types and structural validation
  - affected-id/result helpers
  - deck command acceptance
  - deck payload validation
  - visual payload validation
- Keep `CURRENT_COMMAND_SCHEMA_VERSION` as the only accepted current schema.
- Remove any future-version compatibility behavior beyond explicit rejection.
- Define per-surface command metadata near each surface:
  - command type/op
  - target requirements
  - payload validator
  - coalescing policy
  - affected-id extraction policy
- Keep `executeCommand` and `executeVisualCommand` pure.
- Preserve public `CommandEnvelope`, `DeckPatch`, `VisualPatch`, and
  `CrossSurfaceCommandResult` shapes unless a migration issue explicitly changes
  them.
- Avoid a dynamic dispatcher until at least two runtime callers need it.
- Ensure command validation errors remain safe to log and do not include content.

### Suggested Issues

1. **R12.1 - Split command envelope core from surface validation**
   - Move common envelope validation into a small module.
   - Move deck/visual payload rules to surface-specific modules.

2. **R12.2 - Add deck command metadata registry**
   - Replace repeated `commandId`/`coalesceKey` and target checks with metadata
     helpers.
   - Preserve executor behavior.

3. **R12.3 - Add visual command metadata registry**
   - Centralize visual op metadata and coalescing rules.
   - Keep transform execution in the visual command module or smaller op files.

4. **R12.4 - Split slide command executor by command family**
   - Move slide, element, deck-theme, background, source-ref, and layout command
     handlers into owned files behind the same `executeCommand` facade.

5. **R12.5 - Split visual command executor by command family**
   - Move visual style, node, edge, effect, lifecycle, and layout handlers into
     owned files behind the same `executeVisualCommand` facade.

### Verification

- Command envelope, command validation, visual command, slide command, and
  cross-surface command tests.
- Save conflict and patch replay tests.
- `npm run typecheck`.

## R13 - Non-AI API Route Boundaries

### Problem

Several non-AI API routes have route-level orchestration that should live in
services or shared route helpers:

- `src/app/api/import/route.ts` owns public IP rate limiting, multipart parsing,
  file validation, buffer reading, parser timeout, parser dispatch, and error
  responses.
- `src/app/api/brand/logo/route.ts` and `src/app/api/brand/font/route.ts`
  duplicate multipart parsing, entitlement checks, validation, storage, and
  response shaping.
- `src/app/api/account/export/route.ts` performs a large Prisma read graph in
  the route handler, while only the final JSON shaping lives in `src/lib`.
- Import parsing accepts a `filename` argument that is currently unused and
  explicitly reserved for future hints.

### Best Strategy

Keep route files as thin HTTP adapters. Move request-independent loading,
upload, parsing, and export orchestration into server-only services. Add small
route helpers for repeated JSON error responses, multipart form parsing, and
rate-limit responses.

### Requirements

- Add shared API response helpers only for repeated HTTP semantics:
  - JSON `{ error }` response
  - `Retry-After` rate-limit response
  - multipart parse error
  - upload validation error status mapping
- Keep route-specific security decisions explicit in the route or service entry
  point.
- Move import orchestration into a server-only service, for example
  `src/lib/import/service.ts`:
  - rate limit decision remains route-facing or shared API helper
  - file validation and parsing use existing pure import modules
  - remove the unused `filename` parameter unless a parser starts using it
- Move brand logo/font upload orchestration into a shared brand upload service
  or asset subsystem service after R10.
- Move account export data loading into `src/lib/account/export-loader.ts` or a
  similar server-only module; keep `buildAccountExport` pure.
- Keep response contracts and status codes unchanged.
- Ensure route helpers do not swallow structured logging or abuse telemetry.

### Suggested Issues

1. **R13.1 - Add small API response helpers**
   - Standardize JSON error responses and rate-limit responses for non-AI
     routes.
   - Update import route first.

2. **R13.2 - Extract import route service**
   - Move file validation, buffer read, timeout, and parser dispatch to a
     server-only service.
   - Remove the unused `filename` reservation if it remains unused.

3. **R13.3 - Extract brand upload route service**
   - Share logo/font multipart parsing and storage response shaping.
   - Coordinate with R10 so asset upload primitives are not duplicated.

4. **R13.4 - Extract account export loader**
   - Move Prisma read graph out of the route.
   - Keep route responsible for auth and attachment headers only.

### Verification

- Import validation/parser/timeout tests.
- Brand upload tests.
- Account export tests.
- API route security matrix review.
- `npm run typecheck`.

## R14 - Prisma Schema and Tooling Hygiene

### Problem

Database provider and generated schema/client behavior is spread across several
places:

- `src/lib/db-provider.ts` is the app runtime source of truth for provider and
  URL resolution.
- `prisma.config.ts` mirrors the same provider logic because Prisma CLI cannot
  import TS path aliases.
- `prisma/seed.ts` and `prisma/seed-e2e.ts` each duplicate Prisma client
  factory logic for SQLite/Postgres adapters.
- `prisma/schema.sqlite.prisma` is generated from `prisma/schema.prisma`, but
  normal `prisma generate` and `db:push` flows rely on the generated copy being
  current.
- The generated Prisma client lives under `src/generated/prisma`; it is ignored
  by git but still participates in local typechecking after generation.

This is a workable development setup, but it needs stronger tooling boundaries
so schema/provider drift cannot silently leak into local or CI runs.

### Best Strategy

Make the canonical schema/tooling relationship executable and checked. Keep
`schema.prisma` as the canonical schema, generate SQLite schema mechanically,
and centralize non-app Prisma client factory logic for scripts and seeds.

### Requirements

- Keep `prisma/schema.prisma` as the only hand-edited schema file.
- Ensure SQLite schema generation runs before Prisma commands that depend on it,
  or add a check that fails when `schema.sqlite.prisma` is stale.
- Add a script such as `db:schema:check` that regenerates the SQLite schema and
  fails on diff in CI/release gates.
- Consider changing `db:generate`, `db:push`, and `db:reset` to run
  `db:schema:sqlite` first when SQLite is the selected provider.
- Extract a script-safe Prisma client factory that seed scripts can import
  without TS path alias assumptions.
- Keep app runtime `src/lib/prisma.ts` focused on app singleton behavior; do not
  make seed scripts depend on the app global singleton.
- Document that `src/generated/prisma` is generated/ignored and must be present
  before typecheck.
- Avoid provider-specific casts outside documented provider boundary helpers
  such as `caseInsensitiveContains`.

### Suggested Issues

1. **R14.1 - Add SQLite schema drift check**
   - Add a non-mutating or temp-file check around `gen-sqlite-schema.mjs`.
   - Wire it into release gate or CI before typecheck.

2. **R14.2 - Make Prisma scripts regenerate schema predictably**
   - Update package scripts so SQLite schema generation cannot be skipped by
     accident.
   - Keep Postgres flow unaffected.

3. **R14.3 - Extract seed/script Prisma client factory**
   - Remove duplicated adapter selection from `seed.ts` and `seed-e2e.ts`.
   - Keep behavior identical for SQLite and Postgres.

4. **R14.4 - Document generated client lifecycle**
   - Clarify when `prisma generate` must run.
   - Ensure docs and package scripts agree.

### Verification

- `npm run db:schema:sqlite` and the new schema drift check.
- Seed and E2E seed focused runs when available.
- `npm run db:generate`
- `npm run typecheck`

## R15 - Access Policy Surface Cleanup

### Problem

Authorization and access policy are already moving in the right direction, but
the project now has several adjacent policy surfaces:

- `src/lib/auth/document-permissions.ts` resolves document roles and
  capabilities.
- `src/lib/auth/workspace-capabilities.ts` mirrors that structure for
  workspaces.
- `src/lib/share-access.ts` owns public share/embed/present policy.
- `src/lib/invite-access.ts` owns workspace invite lifecycle and role validation.
- `src/lib/documents.ts` exposes `documentAccessOr` for read-only list/search
  scopes.
- Workspace actions still combine invite normalization, membership removal,
  document handoff, Prisma writes, and cache revalidation in one server-action
  module.

These policies are individually testable, but there is not yet one vocabulary
for capability names, denial reasons, safe error messages, and route/action
mapping across private, workspace, and public surfaces.

### Best Strategy

Keep the pure policy modules, but introduce an access-policy taxonomy and thin
service boundaries around action-heavy workflows. Do not merge public share
policy with authenticated document/workspace policy; instead make their denial
vocabulary, logging, and route adapters consistent.

### Requirements

- Define a shared access-policy vocabulary for:
  - subject (`user`, `anonymous`, `internal`);
  - resource (`document`, `workspace`, `share`, `invite`);
  - capability/mode (`view`, `edit`, `manage`, `mutate`, `embed`, `present`);
  - denial reason (`not-found`, `permission-denied`, `expired`, `revoked`,
    `disabled`, `invalid-role`, `exhausted`).
- Keep each pure policy module domain-specific; do not force one generic role
  model over document and workspace if semantics differ.
- Add adapters that translate policy decisions to:
  - server-action errors;
  - `notFound()` for public routes;
  - API `401`/`403`/`404` responses;
  - safe structured logs/diagnostics.
- Extract workspace service functions for invite creation/revoke, member
  removal, rename, delete, and document handoff.
- Move invite expiry/max-use normalization out of the action module into a
  tested policy/service helper.
- Keep read-list scoping (`documentAccessOr`) clearly documented as read-only;
  write paths must continue to use capability checks.
- Update the security matrix when route/action adapters move.

### Suggested Issues

1. **R15.1 - Define access decision taxonomy**
   - Add shared types for access resource, capability/mode, and denial reason.
   - Map existing document/workspace/share/invite reasons to the taxonomy.

2. **R15.2 - Add access decision adapters**
   - Standardize conversion to server action errors, API responses, and public
     `notFound()` behavior.
   - Ensure no adapter leaks resource existence to unauthorized users.

3. **R15.3 - Extract workspace service layer**
   - Move invite normalization, member removal document handoff, rename, and
     delete orchestration out of `workspaces/[id]/actions.ts`.
   - Keep actions responsible for session, capability, and revalidation.

4. **R15.4 - Align public share route adapters**
   - Ensure share, embed, present, and OG/public variants all use the same share
     access mapping and no-index/not-found behavior.

5. **R15.5 - Update access/security docs and tests**
   - Keep document-role matrix and API route security matrix in sync with the
     new adapters.

### Verification

- Document permission tests.
- Workspace capability tests.
- Share access and invite access tests.
- Workspace action/service tests.
- Public/share/embed/present route tests.
- API route security matrix review.

## R16 - Collaboration Runtime Boundary

### Problem

Realtime collaboration runs through plain Node `.mjs` scripts plus Next API
routes:

- `scripts/collab-core.mjs` owns Yjs websocket rooms, state vectors, eviction,
  and flush observability.
- `scripts/collab-auth.mjs` forwards cookies to `/api/collab/authorize` because
  the plain Node server cannot import the TS Auth/Prisma stack.
- `scripts/collab-flush.mjs` posts dirty-room recovery snapshots to
  `/api/collab/flush` and implements its own JSON logging.
- `server.mjs` and `scripts/collab-server.mjs` repeat deployment config checks,
  health response assembly, authorizer construction, flusher construction, and
  startup logging.
- The internal flush endpoint validates secrets and payloads separately from the
  collaboration script's logging/observability path.

The current split is pragmatic, but inline and standalone modes can drift.

### Best Strategy

Create a small collaboration runtime assembly layer for shared health/config,
authorization, flusher wiring, and logging. Keep the plain Node entry points,
but reduce them to configuration and server mounting. Do not move Auth/Prisma
imports into `.mjs` runtime code unless the module boundary is intentionally
changed.

### Requirements

- Add a shared collab runtime helper for:
  - deployment config validation and warning output;
  - health summary construction;
  - authorizer URL construction;
  - eviction flusher construction;
  - safe structured logging.
- Keep `collab-core.mjs` focused on Yjs protocol, room lifecycle, and state
  vector behavior.
- Keep inline and standalone room naming rules explicit and tested.
- Use one safe logging shape for collab scripts and TS app logs, or document why
  the MJS logger is separate.
- Keep recovery snapshots best-effort and never promote them to `contentJson` in
  this refactor.
- Keep `COLLAB_INTERNAL_SECRET` fail-closed behavior for the API endpoint and
  no-op-with-warning behavior for dev flusher construction.
- Add tests for health summary, authorizer/flusher URL construction, and config
  decisions without opening real sockets.

### Suggested Issues

1. **R16.1 - Extract collab runtime assembly helper**
   - Share health summary and deployment warning behavior between `server.mjs`
     and `collab-server.mjs`.
   - Keep entrypoint output unchanged.

2. **R16.2 - Standardize collab structured logging**
   - Replace ad hoc `console.warn/error/info` JSON shapes with a shared helper
     that mirrors `src/lib/log.ts` safety rules where possible.

3. **R16.3 - Isolate collab authorize/flush client config**
   - Centralize URL and secret resolution for authorizer and flusher.
   - Keep cookie forwarding and internal-secret behavior unchanged.

4. **R16.4 - Add collab runtime tests**
   - Test inline and standalone config/health assembly without starting a
     server.
   - Keep existing durability/flush tests for `collab-core` behavior.

### Verification

- `node --test scripts/**/*.test.mjs`
- Collaboration deployment config tests.
- Collab flush route tests if added.
- Manual smoke for inline `/collab/health` and standalone `/health` when the
  runtime assembly changes.

## R17 - Billing Domain Boundary

### Problem

Billing behavior is spread across several modules:

- `entitlements.ts` defines plans, feature flags, environment flags, and a
  future `topUps` entitlement that is not implemented.
- `brand-entitlements.ts` derives Brand Studio gates from plan entitlements and
  repeats plan-specific upgrade copy.
- `credits.ts` owns period reset and atomic deduction.
- `usage-ledger.ts` owns reserve/capture/refund lifecycle and logs directly.
- `provider.ts`, `mock-provider.ts`, and `stripe-provider.ts` own plan changes,
  Stripe checkout/cancel/webhook handling, and production fail-closed behavior.
- AI routes call credits and ledger directly.

The individual pieces are testable, but there is no single billing domain
service that describes how plans, credits, feature gates, and provider state
transitions relate.

### Best Strategy

Create a billing domain service and plan catalog boundary. Keep pure plan
metadata separate from DB mutations, but centralize state transitions and route
call patterns. Remove or hide future-only entitlements until the product path is
implemented.

### Requirements

- Split plan catalog data from environment feature flags.
- Either remove `topUps` from current entitlements or move it to a clearly
  internal/future-only metadata area not surfaced to product decisions.
- Add a billing service API for:
  - get current billing state;
  - change plan;
  - cancel plan;
  - initialize/reset credits;
  - reserve/capture/refund metered usage.
- Keep `BillingProvider` focused on external provider interaction, not local
  user/subscription/credit state transitions where those can be shared.
- Ensure Brand Studio, export gates, AI routes, and settings UI all read feature
  gates through the same entitlement facade.
- Keep production fail-closed behavior for missing Stripe configuration.
- Keep mock provider available only in non-production.
- Standardize billing logs through the diagnostics/logging platform from R18.

### Suggested Issues

1. **R17.1 - Split plan catalog from runtime flags**
   - Move plan definitions and display names into a pure catalog module.
   - Move billing environment flags into an env/config module.
   - Decide whether `topUps` remains in current plan data.

2. **R17.2 - Add billing state service**
   - Centralize reads of user plan, subscription row, credit balance, and
     period window.
   - Keep Prisma selects owned by the service.

3. **R17.3 - Add metered usage service**
   - Wrap reserve/capture/refund and credit deduction into one route-facing
     operation.
   - Migrate AI routes after R5 route harness exists.

4. **R17.4 - Normalize feature gate calls**
   - Ensure brand, export, AI, and settings surfaces use the same entitlement
     facade and upgrade-message mapping.

5. **R17.5 - Refactor Stripe provider state transitions**
   - Keep Stripe API calls in the provider.
   - Move local subscription/user/credit updates that are provider-independent
     into billing service helpers.

### Verification

- Billing entitlement/provider/stripe/mock tests.
- Credit and usage-ledger tests.
- Brand entitlement tests.
- AI route billing regression tests after R5/R17 integration.

## R18 - Diagnostics and Logging Platform

### Problem

The codebase has several observability layers:

- `src/lib/log.ts` owns base structured JSON logs and generic redaction.
- `src/lib/diagnostics/error-codes.ts` defines stable error codes and diagnostic
  builders.
- `src/lib/diagnostics/schema-telemetry.ts` has a separate content-key filter
  and schema failure categories.
- `src/lib/diagnostics/api-abuse.ts` logs public-route denials.
- MJS collaboration scripts emit structured or semi-structured logs independently
  through `console`.
- Some modules still call `logInfo`/`logError` directly with ad hoc scope names.

This has grown organically. The main risk is not that logs are missing; it is
that redaction, scopes, severities, and stable codes will diverge.

### Best Strategy

Make a single diagnostics platform with layered APIs: base safe logger,
diagnostic code taxonomy, domain-specific event builders, and script-compatible
logging helpers. Keep raw content redaction central and make domain telemetry
allowlist metadata rather than each subsystem inventing filters.

### Requirements

- Move key normalization/redaction helpers to a shared logging utility used by
  both base logs and schema telemetry.
- Keep an allowlist-based telemetry builder for high-risk domains such as
  schema validation and import/AI abuse.
- Expand `ERROR_CODES` only through explicit issue changes; do not rename
  existing codes.
- Decide whether schema failure categories should be first-class `ERROR_CODES`
  or intentionally separate telemetry categories.
- Add a scope naming convention, for example `area.subsystem.operation`.
- Add a script-compatible logger for `.mjs` runtime code or document why it must
  remain separate.
- Ensure every diagnostic/logging helper has no-content-leak tests.
- Update callers with direct `console.*` in runtime scripts where practical.

### Suggested Issues

1. **R18.1 - Extract shared redaction/key-normalization helper**
   - Use it from `log.ts` and `schema-telemetry.ts`.
   - Preserve existing redaction behavior.

2. **R18.2 - Define diagnostic scope and event taxonomy**
   - Document scope naming and when to use base logs vs diagnostic codes vs
     domain telemetry categories.

3. **R18.3 - Add script-compatible structured logger**
   - Support `.mjs` collaboration scripts without TS path aliases.
   - Align timestamp, level, scope, message, and redaction fields with app logs.

4. **R18.4 - Migrate high-value direct logs to diagnostic builders**
   - Start with billing ledger, asset orphan purge, collab flush, and command
     validation failures.

### Verification

- Log and diagnostic tests.
- Schema telemetry no-content-leak tests.
- API abuse tests.
- Collab script tests after logger migration.

## R19 - Catalog and Registry Boundaries

### Problem

Several catalog/registry modules are pure and useful, but they are becoming
large data-and-logic files:

- `src/lib/icons/catalog.ts` contains the icon catalog plus search/scoring and
  suggestion logic.
- `src/lib/templates/catalog.ts` combines starter-template data, lookup, and
  fallback behavior.
- `src/lib/visual/registry.ts` is the visual-kind capability source of truth,
  but it also carries export support, prompt guidance, shape/editing metadata,
  matrix builders, and completeness checks.
- `src/lib/visual/fixtures.ts` mixes sample fixtures, blank visual builders, and
  registry-ordered fixture lists.

These are not dead code; they are data-heavy subsystems that need explicit data
ownership before they grow further.

### Best Strategy

Split catalogs into data, indexes, validation, and query helpers. Keep one
public facade per catalog, but move large data arrays and search/build helpers
behind it. Consider generated indexes only when they reduce manual duplication
without making local development harder.

### Requirements

- Keep catalog modules framework-free unless a UI-specific resolver is explicitly
  separated.
- Split icon catalog data from search/scoring helpers.
- Keep template catalog data separate from create/fallback behavior.
- Split visual registry by concern if it continues to grow:
  - display metadata;
  - editing capabilities;
  - export support;
  - AI prompt guidance;
  - validation/adapters.
- Keep a single public `getKindEntry`/registry facade so consumers do not know
  about internal split files.
- Move blank visual builders out of sample fixtures if they are product seed
  logic rather than test/demo data.
- Add completeness/drift checks for every catalog split.
- Avoid runtime network or dynamic import behavior for catalogs.

### Suggested Issues

1. **R19.1 - Split icon catalog data and search helpers**
   - Move static entries/defaults to data files.
   - Keep `searchIcons` and `suggestIconsForLabel` as the public query API.

2. **R19.2 - Split template catalog data from lookup behavior**
   - Keep `getTemplateOrBlank` stable.
   - Add tests that unknown template ids still resolve to blank.

3. **R19.3 - Split visual registry by concern behind one facade**
   - Keep `VISUAL_KIND_REGISTRY` and `getKindEntry` stable for callers.
   - Move prompt/export/editing metadata into owned data modules.

4. **R19.4 - Separate fixtures from blank visual builders**
   - Decide whether `createBlankVisual` belongs under visual product seed logic
     rather than fixtures.
   - Keep fixture samples focused on tests/demo content.

### Verification

- Icon catalog tests.
- Template catalog tests.
- Visual registry/support matrix/theme parity tests.
- Visual fixture tests.
- `npm run typecheck`.

## R20 - i18n and Onboarding Scope Cleanup

### Problem

Two product-platform systems are intentionally partial today:

- i18n infrastructure exists, but `I18N_SWITCHER_ENABLED` defaults off because
  the catalog covers less than 5 percent of the app.
- Onboarding computes four first-run steps, but edit-style and export/share have
  no persisted completion signal and are always pending until the checklist is
  dismissed.

Partial systems are fine during product development, but they should not stay
half-enabled indefinitely without an explicit scope decision.

### Best Strategy

Make a product decision for each system: either expand it to a coherent current
feature, or narrow/remove dormant UI infrastructure. For onboarding, add real
event signals or simplify the checklist so every step has an observable state.
For i18n, either commit to core-surface coverage or keep infrastructure internal
and remove user-facing toggle assumptions.

### Requirements

- For i18n:
  - define the minimum translated surface area required before enabling the
    switcher;
  - add coverage tracking for message keys by surface;
  - avoid partial translations producing mixed-language critical workflows;
  - keep `normaliseLocale` and translator utilities pure.
- For onboarding:
  - add persisted signals for style edit and export/share, or remove those as
    completion-tracked steps;
  - separate onboarding copy from billing/entitlement copy so plan changes do
    not require editing onboarding logic;
  - keep dismiss/completion semantics explicit and irreversible only if product
    wants that behavior.
- Avoid using onboarding or i18n docs to describe planned behavior as current.

### Suggested Issues

1. **R20.1 - Decide i18n activation threshold**
   - Define required surfaces and message coverage before switcher enablement.
   - Add a coverage checklist or test if feasible.

2. **R20.2 - Split i18n catalog by surface**
   - Move dashboard/header/template picker messages into surface-owned sections
     or files.
   - Keep typed `Messages` checks.

3. **R20.3 - Add onboarding completion signals or simplify steps**
   - Track style edit and export/share completion, or remove them from the
     completion checklist.
   - Keep dismiss behavior unchanged unless product decides otherwise.

4. **R20.4 - Separate onboarding copy from entitlement copy**
   - Reuse plan/entitlement labels from billing catalog after R17.
   - Avoid hard-coded billing copy in onboarding logic.

### Verification

- i18n message/locale tests.
- Onboarding checklist tests.
- Billing entitlement tests if onboarding copy starts using billing catalog.

## R21 - Lexical Editor Core Boundary

### Problem

The Lexical editor layer mixes route components, editor-core logic, UI tool
metadata, and document-specific plugins:

- `src/app/app/documents/[id]/lexical-editor.tsx` composes the full editor,
  persistence, collaboration, toolbar, comments, sharing, tags, import, slides,
  presence, and panels.
- `src/lib/lexical/editor-context.tsx` derives the selection snapshot used by
  multiple contextual surfaces.
- `src/lib/lexical/tool-registry.ts` combines tool metadata, Lucide icons,
  visibility predicates, active-state logic, and Lexical mutations.
- `VisualNode` lives under the app route directory, while `src/lib/lexical/*`
  imports it in production/test code.
- Import, block-id repair, visual insertion, comments, and visual editing all
  depend on live Lexical node keys at the route boundary.

The editor works, but the ownership line between reusable Lexical core and the
TextIQ document page shell is blurry.

### Best Strategy

Create a route-independent Lexical editor core. Move nodes, commands, selection
snapshot derivation, and pure tool descriptors into stable editor/lexical
modules. Keep the document page shell responsible for server actions,
route-specific panels, and persistence wiring.

### Requirements

- Move route-independent Lexical nodes such as `VisualNode` out of
  `src/app/app/documents/[id]` into a stable editor/lexical module.
- Keep app-route imports out of `src/lib/lexical` and tests that exercise core
  Lexical behavior.
- Split `tool-registry.ts` into:
  - tool metadata and grouping;
  - visibility/active-state predicates;
  - Lexical mutation implementations;
  - icon/component resolution.
- Keep `when` and `isActive` predicates pure and DOM-free.
- Keep `run` implementations the only part that mutates Lexical state.
- Extract `LexicalEditor` shell responsibilities:
  - collaboration gate;
  - autosave;
  - plugin mounting;
  - right-surface/panel composition;
  - document metadata controls.
- Keep live Lexical `NodeKey` values transient and prevent them from crossing
  persistence or server-action boundaries.
- Add a core editor API facade for plugin registration instead of app-route
  components importing many feature plugins directly.

### Suggested Issues

1. **R21.1 - Move VisualNode to editor core**
   - Relocate `visual-node` and update imports from `src/lib/lexical` tests and
     document editor components.
   - Keep serialized node shape unchanged.

2. **R21.2 - Split tool registry by responsibility**
   - Separate data descriptors, predicates, mutations, and icon resolution.
   - Preserve `toolsFor`, `isToolActive`, and shortcut formatting APIs.

3. **R21.3 - Extract editor plugin composition**
   - Create a route-independent plugin list/factory for standard editor plugins.
   - Keep route-specific server action wiring in the document page shell.

4. **R21.4 - Harden selection snapshot boundary**
   - Document which fields are stable ids and which are live transient keys.
   - Add tests for range, collapsed, empty block, visual selection, and blur.

5. **R21.5 - Split Lexical autosave/collab gate hooks**
   - Move debounce/save status and collaboration degraded seeding into focused
     hooks with injected save functions.

### Verification

- Lexical editor context/tool registry tests.
- Visual node round-trip tests.
- Import persistence/block-id tests.
- Focused document editor smoke test after node path migration.
- `npm run typecheck`.

## R22 - Design System Boundary

### Problem

The design system has strong token direction, but implementation is spread
across several layers:

- `src/app/globals.css` owns global CSS variables, Tailwind `@theme` exposure,
  dark-mode overrides, z-index scale, typography, and other global concerns.
- `src/components/ui/tokens.ts` maps some DS tokens to reusable class strings.
- `src/components/motion/control-styles.ts` defines additional control classes.
- Many large feature components still hard-code long Tailwind class strings and
  local constants for panels, controls, focus, sizes, and layout chrome.
- UI primitives are mostly small, but higher-level surfaces often bypass them.

This creates a copy/paste design system where consistency depends on discipline
rather than owned primitives.

### Best Strategy

Separate design tokens, primitive components, and feature-specific composition.
Keep global CSS as token definitions and base styles only; move reusable chrome
into typed primitives or class-token modules. Add lightweight scans or review
checks for raw z-index, hard-coded colors, and duplicated control chrome.

### Requirements

- Split `globals.css` into clear sections or imported CSS files if supported:
  - token definitions;
  - Tailwind theme bridge;
  - base typography/prose;
  - app/layout utilities;
  - dark-mode overrides.
- Keep DS token values as the source of truth; feature components should not
  invent new colors/radii/shadows unless a token is added.
- Expand `src/components/ui` primitives for recurring patterns:
  - toolbar button;
  - panel surface;
  - popover section;
  - field row;
  - icon action cluster;
  - toast/status pill.
- Consolidate `FOCUS_RING`, `GUTTER_BUTTON`, and related motion/control styles
  into a single UI token surface where possible.
- Add a z-index policy check: use named semantic z utilities, not raw numeric
  z-index classes.
- Add a color policy check: raw hex values belong in token definitions or
  visual-content themes, not arbitrary feature components.
- Keep visual-content themes separate from app chrome tokens.

### Suggested Issues

1. **R22.1 - Split global CSS ownership**
   - Reorganize `globals.css` into documented token/theme/base sections or
     separate imports.
   - Preserve generated Tailwind utility behavior.

2. **R22.2 - Consolidate UI class tokens**
   - Merge duplicated focus/control/panel/menu class tokens into one owned UI
     module.
   - Update consumers incrementally.

3. **R22.3 - Add higher-level UI primitives**
   - Extract repeated toolbar/panel/section/status patterns from editor and
     visual surfaces.
   - Keep feature-specific layout local.

4. **R22.4 - Add design-system guardrails**
   - Add docs or checks for raw colors, raw z-indexes, and nested card patterns.
   - Run scans before large UI refactors.

### Verification

- UI primitive tests.
- Visual screenshot/regression tests for changed surfaces.
- `npx prettier --check src/app/globals.css src/components/ui/**`.
- Focused Playwright screenshots for slide/editor surfaces when chrome changes.

## R23 - Comments and Annotations Boundary

### Problem

Comment behavior spans text comments, visual/text anchors, slide anchors,
unread state, lifecycle repair, and inline UI:

- `comments-actions.ts` owns list/create/reply/update/delete/resolve behavior,
  DB shaping, anchor validation, permissions, and revalidation.
- `slide-comment-lifecycle.ts` owns orphan/floating behavior for slide and
  element deletion.
- `slide-comment-unread.ts` owns read/unread state.
- `comment-anchor-validation.ts`, `comment-permissions.ts`, and
  `slide-comment-anchors.ts` own parts of policy.
- `inline-comments-layer.tsx` owns text-anchor hit testing, gutter positioning,
  card positioning, optimistic state, and create action calls.
- `slide-comment-panel.tsx` owns a separate slide-oriented UI.

The system is feature-rich, but comment logic is route-local and hard to reuse
or test across anchor types.

### Best Strategy

Create a comment/annotation subsystem with pure anchor policy, server-side
comment service, and UI ports. Keep text, visual, slide, and deck-level anchors
as explicit variants of one annotation model. Route files should expose server
actions that delegate to the service.

### Requirements

- Move comment domain types out of route-local action files.
- Define one canonical `CommentThread` / `CommentAnchor` model for:
  - text anchor;
  - visual/document block anchor;
  - slide anchor;
  - slide element anchor;
  - deck-level anchor.
- Keep DB mappers at the persistence boundary and test them directly.
- Move comment list/create/reply/edit/delete/resolve/read operations into a
  service with injected user/document capability context.
- Keep `canEditComment` and `canDeleteComment` as pure policy helpers, but make
  them part of the comment subsystem.
- Extract text-anchor hit testing and gutter/card positioning into DOM helpers
  or hooks independent of the main layer component.
- Ensure slide lifecycle operations call comment service helpers rather than
  duplicating Prisma update patterns.
- Preserve existing permission behavior: view access may comment; authors may
  edit/delete according to current policy.

### Suggested Issues

1. **R23.1 - Define comment domain model and mappers**
   - Move thread/anchor types and DB record mappers to `src/lib/comments`.
   - Preserve returned server-action shapes initially.

2. **R23.2 - Extract comment service**
   - Move list/create/reply/edit/delete/resolve logic out of route actions.
   - Keep actions as auth/revalidation adapters.

3. **R23.3 - Unify slide comment lifecycle operations**
   - Move float/orphan detection/update behavior into comment service helpers.
   - Preserve current orphan/floating policies.

4. **R23.4 - Extract inline comment positioning hooks**
   - Move block hit-testing and card placement from `inline-comments-layer.tsx`
     into focused helpers/hooks.
   - Keep UI rendering behavior stable.

5. **R23.5 - Align unread/read state with comment service**
   - Move unread count and mark-read operations behind the same service boundary.

### Verification

- Comment permission tests.
- Comment anchor validation/round-trip tests.
- Slide comment lifecycle/unread tests.
- Focused document editor comment UI smoke tests.

## R24 - Document Management Boundary

### Problem

Dashboard and document lifecycle behavior is spread between route actions,
client list state, and small utility modules:

- `src/app/app/actions.ts` owns create-from-template, create-from-import,
  rename, duplicate, favorite, soft-delete, restore, search, and maintenance.
- `duplicateDocument` includes block-id regeneration, deck source-ref remapping,
  visual row cloning, and document creation in one action.
- `DocumentList` owns URL state, local sort/filter, server-side search debounce,
  optimistic delete/restore, undo toast, and tag filtering.
- `runMaintenance` combines soft-deleted document purge and invite-link purge
  from dashboard load.
- `trash.ts`, `documents.ts`, `search.ts`, and `maintenance.ts` each own small
  pieces, but there is no document-management service boundary.

This makes dashboard changes risky because lifecycle, search, and UI state are
interleaved.

### Best Strategy

Create document-management services for document creation, duplication,
listing/search, trash/restore, and maintenance. Keep dashboard UI focused on
view state and optimistic UX. Replace ad hoc deck/source-ref remapping with
structured helpers from the presentation/source-ref subsystem.

### Requirements

- Extract server-side services:
  - create document from template;
  - create document from import;
  - duplicate document;
  - rename/favorite;
  - soft delete/restore;
  - search/list documents;
  - maintenance purge.
- Keep app actions as thin adapters for session, capability checks,
  redirect/revalidate, and error mapping.
- Move `remapDeckSourceRefs` out of `actions.ts` and replace raw object walking
  with current deck/schema helpers where possible.
- Keep document duplication private by default and continue excluding comments
  and share state.
- Split `DocumentList` into:
  - toolbar/search/filter state;
  - document grid rendering;
  - optimistic trash/undo state;
  - URL query-state helpers.
- Ensure maintenance sweeps do not run as hidden side effects of unrelated page
  renders unless explicitly retained as policy.
- Keep list caps and `hasMore` behavior unchanged.

### Suggested Issues

1. **R24.1 - Extract document duplication service**
   - Move block id regeneration, deck source-ref remap, visual cloning, and
     create transaction into a service.
   - Add tests for source-ref remapping and private-copy behavior.

2. **R24.2 - Extract document create/import service**
   - Centralize title/content clamping and Markdown-to-Lexical creation.
   - Keep redirect in route action only.

3. **R24.3 - Extract trash and maintenance service**
   - Move soft delete, restore, retention, invite purge, and maintenance lock
     orchestration into service modules.
   - Keep dashboard load behavior explicit.

4. **R24.4 - Extract document search/list service**
   - Centralize Prisma selectors, list caps, tag filters, and search query
     normalization.
   - Keep client URL/view state separate.

5. **R24.5 - Split dashboard document list UI**
   - Extract toolbar, grid, empty state, undo toast, and URL-state helpers.

### Verification

- Document action/service tests.
- Search/list/trash/maintenance tests.
- Dashboard and workspace Playwright tests.
- `npm run typecheck`.

## R25 - Test Fixture and Builder Platform

### Problem

The test suite is strong but fixture ownership is uneven:

- Many large test files define local deck/visual/comment builders.
- `src/lib/visual/fixtures.ts` contains demo samples, schema fixtures, and the
  product `createBlankVisual` seed path.
- `src/lib/ai/__fixtures__/deck-fixtures.ts` centralizes some AI deck fixtures,
  but similar builders exist elsewhere.
- `e2e/helpers/profile.ts` and `prisma/seed-e2e.ts` share deterministic E2E
  profile constants, credentials, asset bytes, and URLs.
- Generated/current schema changes require many hand-updated fixture shapes.

This creates maintenance drag and can accidentally keep old payload shapes alive
through tests.

### Best Strategy

Create current-schema fixture builders per domain, with one place for default
valid objects and explicit override hooks. Separate product seed builders from
test/demo fixtures. Use builders to make schema changes mechanical and to avoid
copying stale payload shapes.

### Requirements

- Add domain fixture builder modules, for example:
  - `src/test/builders/deck.ts`;
  - `src/test/builders/visual.ts`;
  - `src/test/builders/lexical.ts`;
  - `src/test/builders/comments.ts`;
  - `src/test/builders/assets.ts`.
- Keep builders current-schema only; do not add legacy-shape fixture helpers.
- Move product `createBlankVisual` out of `visual/fixtures.ts` if it is used by
  runtime product code.
- Keep demo/sample visuals separate from test fixtures.
- Make E2E profile data a single source of truth shared by seed and specs, but
  avoid treating credentials as secrets.
- Prefer builders with typed overrides over raw JSON literals in new tests.
- Add fixture drift tests that validate default builders with current schemas.

### Suggested Issues

1. **R25.1 - Introduce deck and visual test builders**
   - Replace a small high-churn test suite first.
   - Validate builder output with `safeParseDeck` and `safeParseVisual`.

2. **R25.2 - Separate runtime blank visual builders from fixtures**
   - Move `createBlankVisual` to a product seed module.
   - Keep sample fixtures focused on demos/tests.

3. **R25.3 - Introduce Lexical/contentJson builders**
   - Replace duplicated serialized Lexical object literals in AI/import/export
     tests.

4. **R25.4 - Consolidate E2E profile builder**
   - Keep seed and specs sharing one typed profile module.
   - Ensure seeded data validates current deck/visual/asset schemas.

5. **R25.5 - Add fixture drift checks**
   - Add focused tests that default builders produce valid current-schema
     payloads.

### Verification

- Migrated test suites.
- Builder validation tests.
- E2E profile seed smoke.
- `npm test` when builder migration touches broad fixtures.

## R26 - Client/Server Action Ports

### Problem

Many reusable client components import route-local server actions or app-route
modules directly:

- Editor components import document actions such as `fetchDeckJson`,
  `saveDeckJson`, `saveDeckPatch`, and `listBrands` from app route paths.
- Presentation components import `uploadSlideAsset` from the document route.
- `src/lib/lexical` imports the route-local `visual-node` module.
- Dashboard client components import `./actions` directly for rename,
  duplicate, favorite, search, delete, and restore.

This works in Next.js, but it turns route file paths into de facto APIs and
makes components harder to reuse or test outside their current route.

### Best Strategy

Introduce typed action ports. Server components and route shells should import
server actions/services and pass them to reusable client components as props or
context. Shared components should depend on function interfaces, not app-route
paths.

### Requirements

- Define typed ports for recurring server interactions:
  - deck save/fetch;
  - brand list/apply;
  - slide asset upload;
  - document list actions;
  - comments actions.
- Keep server actions route-local if they need Next.js action semantics, but
  export their types from stable modules when shared components need them.
- Move route-independent code out of `src/app/**` before `src/lib` imports it.
- For reusable components under `src/components`, avoid direct imports from
  `src/app/**/actions`.
- Prefer dependency injection in tests: pass fake action ports rather than
  mocking route modules.
- Document allowed exceptions, such as small route-only client components that
  are not intended to be reusable.

### Suggested Issues

1. **R26.1 - Define editor action ports**
   - Create types for deck save/fetch, asset upload, brand list, and comments.
   - Wire `SlideEditorButton`, export/present buttons, and slide inspector
     through props/context.

2. **R26.2 - Remove app-route imports from shared components**
   - Migrate `src/components/editor` and `src/components/presentation` first.
   - Keep route shells responsible for binding real actions.

3. **R26.3 - Remove app-route imports from `src/lib`**
   - Coordinate with R21 to move `VisualNode` and related Lexical modules.

4. **R26.4 - Add lint/search guard for forbidden imports**
   - Add a documented check for `@/app/**/actions` imports in shared component
     and lib directories.

### Verification

- Typecheck after port migration.
- Focused component tests with fake ports.
- Existing editor/presentation/dashboard smoke tests.

## R27 - Runtime Config and Feature Flags

### Problem

Environment configuration is partly centralized in `src/lib/env.ts`, but raw or
subsystem-specific `process.env` reads still exist where Next/client/script
constraints require them:

- Server config reads are centralized for auth, DB, Stripe, Azure, Google, and
  app URL.
- Client-visible config (`NEXT_PUBLIC_*`) must be statically read for bundling,
  so client helpers read it directly.
- Collaboration scripts read `COLLAB_*`, `PORT`, `HOST`, and `AUTH_URL` in plain
  Node modules.
- Billing and AI feature flags live in billing entitlements, while i18n and
  collab flags live elsewhere.
- Some auth mailer code still has future provider comments for unimplemented
  external email delivery.

The issue is not raw env reads by themselves; it is that feature-flag semantics
are not inventoried in one current configuration contract.

### Best Strategy

Create a runtime configuration inventory that covers server, client, and script
contexts separately. Keep Next-required static client reads, but wrap them in
small typed helpers. Move feature flags into explicit config groups with owners,
defaults, and production behavior.

### Requirements

- Maintain one config inventory table covering:
  - variable name;
  - server/client/script context;
  - default;
  - required/optional;
  - production behavior;
  - owning subsystem.
- Keep `src/lib/env.ts` as the server-side accessor surface.
- Add client config helpers for `NEXT_PUBLIC_*` values that must be statically
  inlined, with documented limitations.
- Add script config helpers for plain Node collaboration/server scripts where
  feasible.
- Move feature flags into owned groups:
  - AI deck generation;
  - unlimited credits;
  - language switcher;
  - collaboration inline/standalone/deployment;
  - billing provider mode.
- Remove future-only provider comments or turn them into real issues, for
  example external email delivery providers.
- Add tests for config parsing where behavior affects security or billing.

### Suggested Issues

1. **R27.1 - Create runtime config inventory**
   - Document all server, client, and script env vars with defaults and owners.
   - Link it from operations/release docs.

2. **R27.2 - Add client config helper layer**
   - Wrap `NEXT_PUBLIC_APP_URL` and collab websocket public vars in typed
     helpers while preserving static bundling behavior.

3. **R27.3 - Group feature flags by owner**
   - Move or re-export feature flag readers from owned config modules.
   - Ensure defaults are explicit and production-safe.

4. **R27.4 - Clean future-only env/provider comments**
   - Remove comments for unimplemented providers unless there is a current
     tracked issue.
   - Keep documented extension points only where an interface already exists.

### Verification

- Env/config tests.
- Collab deployment config tests.
- Billing feature flag tests.
- Client helper typecheck/build smoke.

## R28 - Auth and Account Lifecycle

### Problem

Authentication and account lifecycle code is security-sensitive and currently
split across many route-local actions and small pure helpers:

- Login, signup, forgot-password, reset-password, verify-email, settings
  password change, profile update, verification email request, and account
  deletion each own their own form/action state shape.
- Password reset and email verification deliberately mirror each other, but
  token generation/evaluation, URL building, DB consumption, and invalidation
  are wired in separate action/page modules.
- Signup and change/reset password repeat bcrypt cost and password hashing
  concerns.
- Email delivery seams exist, but real transport is not implemented; dev console
  delivery and production no-transport behavior are handled per email type.
- Account deletion mixes confirmation, Stripe cancellation, user deletion,
  logging, and sign-out redirect in one server action.
- Auth forms share UX patterns but each owns local copy, action state, and field
  validation wiring.

These flows are correct in intent, but they deserve a cohesive account lifecycle
boundary before more providers or security controls are added.

### Best Strategy

Create an account/auth service boundary that owns token lifecycle, password
credential lifecycle, email delivery ports, and account deletion orchestration.
Keep route actions and pages as thin adapters that bind form state to service
calls and render user-facing messages.

### Requirements

- Extract a generic single-use token helper for high-entropy token generation,
  SHA-256 hashing, TTL evaluation, and rejection messages where reset and
  verification semantics match.
- Keep password reset and email verification distinct at the service boundary so
  copy, TTL, DB table, and side effects remain explicit.
- Centralize bcrypt cost and password hash/compare helpers.
- Move URL builders for reset/verify links into account/email services that use
  the runtime config surface from R27.
- Define an email delivery port with concrete message types for reset and
  verification emails.
- Keep production behavior fail-safe: no live reset/verify links in logs.
- Move account deletion orchestration into a service:
  - confirmation validation;
  - subscription cancellation attempt;
  - user deletion;
  - error/log behavior;
  - sign-out remains at the route/action adapter.
- Create reusable auth form primitives or a small form-state helper for login,
  signup, forgot/reset password, settings password, and verification request
  forms.
- Preserve anti-enumeration behavior for password reset.

### Suggested Issues

1. **R28.1 - Extract single-use token lifecycle helpers**
   - Share generation/hash/evaluation mechanics between reset and verification.
   - Keep per-flow TTL and rejection copy configurable.

2. **R28.2 - Add account email delivery port**
   - Define reset and verification email message contracts.
   - Keep dev console fallback non-production only.
   - Add a real-provider extension point without logging live links in prod.

3. **R28.3 - Centralize credential/password service**
   - Move bcrypt cost, hash, compare, and validation orchestration behind one
     account service.
   - Migrate signup, reset password, and change password.

4. **R28.4 - Extract account deletion service**
   - Move deletion orchestration and billing cancellation attempt out of the
     settings action.
   - Keep `signOut` redirect in the action adapter.

5. **R28.5 - Standardize auth/account form state**
   - Reuse form field chrome, action-state shapes, and validation display across
     login/signup/reset/settings forms.

### Verification

- Auth callback/password/reset/verification token tests.
- Settings action/account deletion tests.
- Billing cancellation tests for account deletion path.
- Auth form smoke tests.

## R29 - Public Render Surface Boundary

### Problem

Public rendering surfaces share many behaviors but repeat them in separate
routes:

- `/share/[shareId]`, `/embed/[shareId]`, `/present/[shareId]`,
  `/present/[shareId]/embed`, and share Open Graph image routes all resolve the
  share id, fetch document fields, apply share access, and map denial to safe
  no-index/not-found behavior.
- Present routes build presentation blocks, visual maps, deck fallback, orphan
  stripping, attribution, and metadata in route files.
- Share metadata and present metadata duplicate canonical URL, excerpt, OG image,
  title, and robot behavior.
- Protected slide asset access also depends on public share/present/embed policy.

Access policy is centralized, but public render assembly is not.

### Best Strategy

Create a public render service that resolves a shared document once, applies
the correct mode policy, and returns render-ready models for read-only document,
embed, presentation, present embed, Open Graph, and public asset checks.

### Requirements

- Add a server-only public share resolver that accepts:
  - raw URL param;
  - mode (`view`, `embed`, `present`, `og`, `asset`);
  - required projection (`document`, `presentation`, `metadata`, `assetAccess`).
- Centralize share-id parsing, `SHARE_ACCESS_SELECT`, `evaluateShareAccess`, and
  denial mapping.
- Centralize metadata assembly for share/present pages, including canonical URL,
  excerpt, OG image, no-index defaults, and site name.
- Centralize present deck resolution:
  - build presentation blocks;
  - build visual record;
  - parse persisted deck through the current persisted deck boundary from R1;
  - fall back to `buildDeckFromBlocks`;
  - reconcile orphaned visual references.
- Keep route components responsible for rendering only.
- Preserve current public behavior: denied/expired/disabled/regenerated links do
  not leak private document existence.
- Keep attribution rules in one helper used by all public surfaces.

### Suggested Issues

1. **R29.1 - Add public share resolver service**
   - Move share id parsing, DB select, access evaluation, and denial result into
     a server-only service.
   - Migrate `/share` and `/embed` first.

2. **R29.2 - Extract public metadata builder**
   - Share canonical/OG/Twitter/no-index behavior between share and present
     pages.

3. **R29.3 - Extract public presentation model builder**
   - Move block/visual/deck fallback/reconcile logic out of present routes.
   - Use R1 persisted deck parser.

4. **R29.4 - Align public asset access with public render resolver**
   - Ensure slide asset route uses the same mode and share policy decisions as
     public pages.

### Verification

- Public pages Playwright tests.
- Share/embed/present fallback tests.
- Slide asset public/private access tests.
- Metadata/no-index route tests where feasible.

## R30 - Tags, Search, and Taxonomy

### Problem

Tagging and search are small but spread across route actions and dashboard UI:

- `tags-actions.ts` owns tag normalization, slug generation, collision handling,
  document connect/disconnect, and revalidation.
- `search.ts` owns query normalization and DB where construction.
- Dashboard list UI owns tag URL state, favorites view, local sorting, and
  server search result reconciliation.
- `documentAccessOr` is reused for read scoping, but tag filtering and search
  list shape live elsewhere.

As the dashboard grows, taxonomy identity and search/list behavior should become
a first-class service rather than route-local helpers.

### Best Strategy

Create a taxonomy/search service that owns tag normalization, slug uniqueness,
document tag mutations, tag filtering, and search query construction. Keep the
dashboard UI focused on view state and rendering.

### Requirements

- Move tag normalization and max length into a taxonomy module.
- Use a deterministic slug-collision strategy that does not rely on timestamps
  unless that is an explicit product choice.
- Keep tags owner-scoped and flat unless a product issue changes taxonomy.
- Move find-or-create/connect/disconnect tag operations into a document taxonomy
  service with capability checks injected or performed by action adapters.
- Centralize document search/list query construction with tag filters,
  favorites filters, caps, and access scoping.
- Keep dashboard URL params as client view state, not DB query policy.
- Add tests for tag name normalization, slug collision, same-name races, and
  search/tag filter composition.

### Suggested Issues

1. **R30.1 - Extract taxonomy normalization and slug policy**
   - Move tag name normalization, slug derivation, and collision handling to a
     pure module.
   - Replace timestamp fallback with a deterministic bounded retry if possible.

2. **R30.2 - Add document tag service**
   - Move add/remove/find-or-create behavior out of route actions.
   - Keep action adapters responsible for user/session/capability and
     revalidation.

3. **R30.3 - Unify search/list query builder**
   - Compose access scope, deleted filter, text search, tag filter, favorites,
     and list caps in one server-side service.

4. **R30.4 - Split dashboard URL state from query policy**
   - Keep `DocumentList` URL params and local sorting in UI helpers, while the
     server search/list service owns DB filters.

### Verification

- Tag action/service tests.
- Search tests.
- Dashboard document list tests.
- Workspace document list tests if tag/search is exposed there.

## R31 - Accessibility and Shortcuts

### Problem

Accessibility and keyboard behavior are spread across several independent
systems:

- `src/lib/a11y/a11y-helpers.ts` provides pure smoke assertions for roles,
  accessible names, modal semantics, public surfaces, and known canvas keyboard
  limitations.
- `src/lib/shortcuts/catalog.ts` lists only a small global/dashboard/editor
  shortcut set.
- `src/lib/shortcuts/match.ts` owns pure shortcut matchers.
- `KeyboardShortcuts` renders a help dialog from the catalog.
- Slide canvas accessibility has its own `canvas-a11y` helpers, focus traversal,
  announcements, and ADR-backed limitations.
- Feature components often define local shortcut labels and tooltips separately
  from the global catalog.

As editor and slide surfaces split, keyboard/a11y behavior needs a shared
platform or it will regress by omission.

### Best Strategy

Create an accessibility and shortcuts platform with one shortcut registry,
surface scopes, focus policies, and a11y smoke descriptors. Keep component-level
ARIA details local, but make global behavior discoverable and testable.

### Requirements

- Expand shortcut registry to model:
  - scope/surface;
  - key matcher;
  - display tokens;
  - description;
  - whether it is global or ignored in text inputs.
- Generate `isHelpShortcut`, `isNewDocumentShortcut`, and similar matchers from
  registry metadata where practical.
- Keep local editor-tool shortcuts in sync with the discoverable shortcut dialog.
- Add a focused accessibility policy for:
  - dialogs/focus traps;
  - icon-only buttons;
  - read-only public surfaces;
  - slide canvas keyboard navigation;
  - live announcements.
- Preserve documented limitations, but keep them as explicit backlog items, not
  hidden test comments.
- Add checks that major modal/fullscreen/editor surfaces have a11y descriptors or
  Playwright coverage.

### Suggested Issues

1. **R31.1 - Turn shortcut catalog into executable registry**
   - Add matcher metadata and derive pure match helpers from it.
   - Keep current shortcuts behavior unchanged.

2. **R31.2 - Sync editor tool shortcuts with global help**
   - Ensure text toolbar, slide canvas, and global shortcuts share display
     labels and conflict rules.

3. **R31.3 - Define a11y surface descriptors**
   - Add descriptor builders for major surfaces so smoke tests are less ad hoc.

4. **R31.4 - Track deferred keyboard limitations as issues**
   - Move deferred canvas items from comments/tests into explicit roadmap or
     issue references.

### Verification

- Shortcut catalog/match tests.
- A11y helper tests.
- Canvas a11y tests.
- Playwright keyboard smoke tests for editor and slide surfaces.

## R32 - Performance Budgets and Limits

### Problem

Size and performance limits exist, but they are scattered:

- Lexical state, content length, title length, workspace name length, tag length,
  deck JSON size, slide count, asset size, image data URL size, import size,
  and generation input size are defined in different modules/actions.
- `perf-budgets.ts` centralizes many warning/hard thresholds, but comments still
  describe mirrors of constants in server actions.
- Export preflight has its own slide-count and feature warning thresholds.
- Client-side helpers and server actions both enforce some limits.
- Diagnostics know about budget exceeded warnings, but budget checks are not a
  uniform service.

This makes it easy for warning thresholds, hard caps, and user-facing messages
to drift.

### Best Strategy

Create a central limits/budgets package with domain-specific exports and one
budget-check API. Hard caps should be imported by server enforcement points;
warnings should be imported by preflight/diagnostic/UI surfaces.

### Requirements

- Create a `src/lib/limits` or `src/lib/performance` boundary for:
  - document content/title limits;
  - Lexical state limit;
  - deck JSON limit;
  - slide/element/visual count limits;
  - asset upload limits;
  - import limits;
  - AI input limits;
  - timing budgets.
- Replace local duplicate constants in actions and validators with imports from
  the central boundary.
- Keep hard caps stable unless a product/architecture decision changes them.
- Pair each hard cap with:
  - user-facing error message helper;
  - diagnostic metadata;
  - optional warning threshold.
- Ensure client-side preflight limits match server hard caps.
- Keep warnings advisory and hard caps enforcement-oriented.
- Add tests that assert high-traffic validators use the same constants.

### Suggested Issues

1. **R32.1 - Inventory all hard caps and warning thresholds**
   - Document every limit source and current value.
   - Mark enforcement vs warning-only limits.

2. **R32.2 - Centralize document/deck/editor limits**
   - Move title/content/Lexical/deck JSON limits to shared modules.
   - Update server actions and client helpers to import them.

3. **R32.3 - Centralize upload/import/AI limits**
   - Align import validation, slide/brand asset validation, and AI input caps.
   - Preserve existing user-facing messages.

4. **R32.4 - Wire budget diagnostics consistently**
   - Use one budget-check result shape for save, export preflight, and
     diagnostics.
   - Emit `BUDGET_EXCEEDED` only from allowlisted safe metadata.

### Verification

- Limit helper tests.
- Import validation tests.
- Asset upload tests.
- Deck save/oversized tests.
- Export preflight/perf budget tests.
- AI input validation tests.

## R33 - Deck Model and Validation Boundary

### Problem

The deck domain is one of the largest and most central pieces of the codebase:

- `src/lib/presentation/deck.ts` combines constants, types, element unions,
  layout helpers, id creation, document-to-deck derivation, and reusable layout
  behavior.
- `src/lib/presentation/deck-schema.ts` hand-validates the full current deck
  schema, token sets, master slides, layouts, elements, source refs, image
  properties, connectors, and typography in one large module.
- `src/lib/presentation/deck-mutations.ts` mixes slide-level, element-level,
  template, layout, alignment, arrangement, theme-token, and connector mutation
  helpers.
- Tests are thorough but large, making schema/model changes broad and expensive.

The project correctly treats the current deck schema as authoritative. The next
refactor should preserve that strictness while making the model easier to evolve.

### Best Strategy

Split the deck domain by concern: schema types, element type families, validators,
derivation, reusable layouts, mutations, and token/master-slide model. Keep a
single public facade for compatibility during the refactor, but move internals
into smaller current-schema-only modules.

### Requirements

- Keep `CURRENT_DECK_SCHEMA_VERSION` and current `Slide.elements[]` semantics as
  the only persisted deck schema.
- Split deck model definitions into focused modules:
  - core deck/slide types;
  - element types by family;
  - source refs;
  - layouts/placeholders;
  - theme/master tokens;
  - id helpers.
- Split validation by schema area, preserving strict error messages where tests
  depend on them.
- Keep `safeParseDeck` as the public parse boundary.
- Keep `buildDeckFromBlocks` as a separate derivation module rather than inside
  the type module.
- Split `deck-mutations` by mutation family while keeping public mutation
  facades stable during migration.
- Remove old layout helpers after R2 resolves legacy layout paths.
- Use R25 builders to reduce massive schema/mutation test fixtures.

### Suggested Issues

1. **R33.1 - Split deck type definitions**
   - Move element families and source refs into owned modules.
   - Re-export through `deck.ts` initially to avoid broad churn.

2. **R33.2 - Split deck validators by schema area**
   - Create validators for core deck/slide, elements, theme tokens, layouts,
     image/media, connectors, and source refs.
   - Keep `safeParseDeck` facade stable.

3. **R33.3 - Move document-to-deck derivation out of model file**
   - Put `buildDeckFromBlocks` and section/source id helpers in a derivation
     module.
   - Keep output byte-for-byte/schema-equivalent.

4. **R33.4 - Split deck mutation helpers by family**
   - Separate slide, element, arrangement, layout, connector, theme, and template
     mutations.
   - Keep immutability and reindexing behavior unchanged.

5. **R33.5 - Reduce deck test fixture duplication**
   - Migrate high-churn deck schema/mutation tests to R25 builders.

### Verification

- Deck schema tests.
- Deck mutation tests.
- Source-ref/deck merge tests.
- Save conflict and patch replay tests.
- `npm run typecheck`.

## R34 - Presentation Runtime Boundary

### Problem

Presentation rendering is shared, but runtime responsibilities are still mixed:

- `SlideCanvas` renders all slide element kinds, token resolution, text fitting,
  image crop/mask behavior, visual rendering, connector rendering, placeholder
  rendering, and measurement hooks.
- `PresentMode` and `PublicPresentViewer` each own navigation, keyboard handling,
  touch/swipe handling, slide bounds measurement, progress display, and viewer
  chrome.
- In-app present mode includes presenter tools, fullscreen, notes, timer, laser
  pointer, overview, and shortcut help.
- Public present mode owns hash deep-linking and embed chrome suppression.

The render core is shared, but navigation/viewer runtime behavior can still
drift between in-app and public surfaces.

### Best Strategy

Split presentation runtime into render core, element renderers, navigation hooks,
viewer chrome, and presenter-only tools. Keep `SlideCanvas` as the public render
facade while moving element renderers and measurement logic behind it.

### Requirements

- Extract element renderers by kind/family:
  - text and bullets;
  - image/media;
  - visual elements;
  - shapes;
  - connectors;
  - placeholders.
- Keep token/style resolution pure and outside React where possible.
- Extract shared navigation hooks for:
  - keyboard navigation;
  - click/tap zones;
  - swipe navigation;
  - slide bounds measurement;
  - progress formatting.
- Keep public hash deep-linking as a public-viewer plugin, not core navigation.
- Keep presenter tools as in-app-only modules.
- Ensure a11y behavior and shortcut labels feed into R31's shortcut/a11y
  registry.
- Preserve existing present/public UI behavior during extraction.

### Suggested Issues

1. **R34.1 - Split SlideCanvas element renderers**
   - Move each element-family renderer into a focused file.
   - Keep `SlideCanvas` props and output behavior stable.

2. **R34.2 - Extract shared presentation navigation hooks**
   - Share clamp, keyboard, click, swipe, and bounds logic between in-app and
     public viewers.
   - Keep hash handling public-only.

3. **R34.3 - Move presenter tools into owned modules**
   - Extract notes, overview, timer, laser pointer, fullscreen, and shortcut
     help from `PresentMode`.

4. **R34.4 - Align present shortcuts with R31 registry**
   - Replace local shortcut arrays with shared registry metadata where possible.

### Verification

- Rendering regression tests.
- Slide canvas tests.
- Public present/share E2E tests.
- Keyboard/navigation Playwright tests for present mode.

## R35 - Visual Runtime Boundary

### Problem

The visual subsystem has a mature model, but its runtime is implicit and wide:

- `src/lib/visual/schema.ts` defines visual types, schema constants, style,
  effects, nodes, edges, and validation.
- `src/components/visual/layout.ts` owns layout helpers for positioned and
  derived visual kinds, node boxes, content viewBox, boundary points, resize, and
  kind-specific layouts.
- `src/components/visual/visual-renderer.tsx` renders every visual kind and many
  SVG primitives in one file.
- `src/lib/visual/transforms.ts` owns pure edit/restyle operations and imports
  `elasticLayout` from a component directory.
- Visual registry metadata, prompt guidance, export support, renderer behavior,
  editor capabilities, and transforms all need to stay in sync.

Adding a new visual kind or visual feature currently requires coordinated edits
across many modules with no explicit extension point checklist.

### Best Strategy

Define a visual runtime boundary with per-kind descriptors that connect schema,
layout, renderer, transforms, editor capabilities, AI guidance, and export
support. Keep current public schema and renderer behavior stable while making
new kind/feature additions descriptor-driven.

### Requirements

- Split visual schema validation by concern:
  - core visual;
  - nodes;
  - edges;
  - style;
  - effects;
  - export options.
- Move `elasticLayout` and other runtime layout algorithms out of component
  directories into `src/lib/visual` or `src/lib/layout`.
- Split visual renderer by primitive/family:
  - canvas/effects/background;
  - node shapes;
  - edges/arrowheads;
  - labels/icons;
  - derived-kind renderers.
- Keep the top-level `VisualRenderer` facade stable for callers.
- Define per-kind runtime descriptors or extend the registry so each kind points
  to layout/render/edit/export/prompt capabilities.
- Add a visual-kind addition checklist enforced by tests.
- Keep unknown icon handling current: unknown icons are dropped/ignored, not a
  validation failure, unless policy changes.

### Suggested Issues

1. **R35.1 - Move visual layout algorithms out of components**
   - Relocate `layout.ts` and `elastic-layout.ts` under a lib-owned visual
     runtime path.
   - Update renderer/editor imports.

2. **R35.2 - Split VisualRenderer internals**
   - Extract SVG primitives and kind-family renderers behind one facade.
   - Preserve deterministic output and no-hook/server-compatible behavior.

3. **R35.3 - Split visual schema validation by concern**
   - Keep `safeParseVisual` stable.
   - Add targeted tests for node/edge/style/effect validation modules.

4. **R35.4 - Add visual runtime descriptor checklist**
   - Ensure every visual kind declares schema, layout, renderer, editor,
     export, and AI guidance coverage.

5. **R35.5 - Align visual transforms with runtime descriptors**
   - Move feature support checks out of UI/command code where descriptors can
     own them safely.

### Verification

- Visual schema tests.
- Visual registry/support matrix tests.
- Visual renderer/layout tests.
- Visual command/transform tests.
- Screenshot or export regression tests for all visual kinds.

## R36 - AI Prompt and Repair Pipeline

### Problem

AI generation has strong pure modules, but prompt contracts and repair logic are
spread across visual and deck generation paths:

- Visual prompt schema description is hand-built from constants, but kind
  guidance still lives in prompt code while registry also carries prompt
  guidance.
- Deck prompt schema description is hand-built from deck constants and allows a
  simplified model-output shape.
- `generateDeck` owns JSON extraction, model-output repair, schema validation,
  visual inventory reconciliation, final layout normalization, retry, and error
  messaging.
- `generateVisuals` owns similar JSON extraction, candidate coercion, validation,
  retry, and type preference behavior.
- Deck-source extraction serializes Lexical/document blocks into a compact
  outline and visual inventory, with its own truncation strategy.

The model contract, repair contract, and validator contract need a single
explicit pipeline so prompt changes do not drift from repair and schema checks.

### Best Strategy

Create a model-contract pipeline shared by visual and deck generation:
prompt schema projection, request tuning, response extraction, repair/coercion,
validation, normalization, and retry diagnostics. Keep visual and deck-specific
content rules separate, but share the orchestration skeleton.

### Requirements

- Extract shared generation attempt orchestration:
  - build messages;
  - call injected `complete`;
  - extract JSON;
  - repair/coerce;
  - validate;
  - retry with reason;
  - throw typed generation error.
- Keep visual and deck repair functions pure and separately testable.
- Move deck repair helpers out of `generate-deck.ts` into a dedicated repair
  module.
- Ensure prompt schema descriptions are generated from current validators or
  registries where practical.
- Remove duplicate kind guidance maps by reading from visual registry.
- Keep language preservation and visual-inventory hard rules explicit.
- Keep deck-source truncation deterministic and tested.
- Add structured repair failure diagnostics that do not include prompt/source
  content.

### Suggested Issues

1. **R36.1 - Extract shared generation attempt runner**
   - Share retry/extract/validate/error behavior between visual and deck
     generation.
   - Preserve public errors and retry counts.

2. **R36.2 - Move deck model-output repair to dedicated module**
   - Export pure repair functions for boxes, text style, elements, slides, deck.
   - Add tests for malformed but repairable model outputs.

3. **R36.3 - Generate prompt guidance from registries**
   - Replace prompt-local visual kind guidance with registry-derived guidance.
   - Add drift tests between prompt and registry.

4. **R36.4 - Define model contract fixtures**
   - Use R25 builders for valid/invalid/repaired visual and deck model outputs.

5. **R36.5 - Add safe generation diagnostics**
   - Record schema/repair failure categories without source text or prompt
     content.

### Verification

- AI visual generation tests.
- AI deck generation tests.
- Deck-source tests.
- Prompt drift tests against registry/schema constants.
- Route tests after R5 harness migration.

## R37 - Export Options and Output Profiles

### Problem

Export options span several concerns that are adjacent to, but not identical
with, the export pipeline from R8:

- `src/lib/visual/export-options.ts` owns background modes, color modes, scale,
  aspect-ratio letterboxing, social presets, padding, watermark flag, SVG string
  transforms, and profile helpers.
- Visual schema also owns `AspectRatioPreset` because per-visual export state is
  stored on visuals.
- Export dialogs, download handlers, preflight, entitlements, and watermark
  policy all consume pieces of the export options model.
- Social output presets are current product behavior but live beside low-level
  SVG transforms and default export options.

Output profiles need a clear boundary so adding export formats or presets does
not blur stored visual settings, one-off dialog state, entitlement policy, and
render/preflight rules.

### Best Strategy

Separate export option primitives, persistent visual export preferences, transient
dialog state, output profiles, and entitlement/watermark policy. Keep SVG
transforms pure, but move profile data and policy into owned modules.

### Requirements

- Split export options into:
  - persistent visual export settings;
  - transient export dialog options;
  - output profiles/social presets;
  - SVG transform helpers;
  - entitlement/watermark policy adapters.
- Keep `AspectRatioPreset` ownership explicit: if it remains in visual schema,
  document that it is persisted visual export preference.
- Move social preset configs into a profile/catalog module.
- Keep `DEFAULT_EXPORT_OPTIONS` stable for existing callers.
- Ensure preflight can reason about output profiles without duplicating profile
  data.
- Ensure watermark behavior is derived from billing entitlement in one place.
- Preserve current SVG transform output for same inputs.

### Suggested Issues

1. **R37.1 - Split output profile data from SVG transforms**
   - Move social presets and profile labels into a data module.
   - Keep transform helpers pure and profile-agnostic.

2. **R37.2 - Clarify persistent vs transient export options**
   - Separate visual-stored aspect ratio from dialog-only background/scale/
     watermark state.

3. **R37.3 - Centralize watermark/entitlement export policy**
   - Provide one helper that maps user plan/entitlement to export options and
     preflight expectations.

4. **R37.4 - Align export dialog with profile catalog**
   - Make dialog controls read profile metadata rather than duplicating labels
     or defaults.

### Verification

- Export option tests.
- Export sanitize/download tests.
- Export preflight tests.
- Billing entitlement tests for watermark/export gates.
- Visual export dialog smoke tests.

## R38 - Content Conversion Pipeline

### Problem

The same document content is projected into several formats across the app:

- `src/lib/markdown.ts` parses a minimal Markdown subset into editor blocks.
- `src/lib/lexical/from-markdown.ts` converts Markdown into serialized Lexical
  JSON with durable block ids.
- `src/lib/lexical/plain-text.ts` projects Lexical JSON to `Document.content`
  for search and fallback text.
- `src/lib/visual/document-export.ts` walks Lexical JSON into `DocumentBlock[]`
  for export, AI deck source, and deck derivation.
- `src/lib/presentation/present-blocks.ts` wraps document block extraction for
  public presentation routes.
- Import/autosave paths use update tags and confirmation helpers to decide when
  imported content should persist.

These pieces are pure and useful, but the content projection contract is
implicit. A change to supported Markdown/Lexical block shapes can drift across
search, AI, presentation, export, import, and persistence.

### Best Strategy

Create one content projection subsystem that owns the current document content
view models: Markdown subset, Lexical serialized shape helpers, plain-text
projection, rich document blocks, presentation blocks, and import persistence
policy. Keep export assembly separate, but make it consume the same block model.

### Requirements

- Define one current `DocumentBlock` projection contract with text, rich runs,
  stable block ids, visual blocks, and horizontal rules.
- Keep Markdown parsing subset explicit and current; do not describe unsupported
  Markdown as accepted input.
- Move Markdown-to-Lexical conversion and Lexical-to-block/plain-text projection
  under a shared content projection namespace.
- Ensure `Document.content`, AI source extraction, presentation derivation, and
  document export all consume the same projection helpers.
- Keep import update tags and destructive-import confirmation as part of the
  import persistence boundary, not scattered plugin logic.
- Add drift tests that the same source content produces consistent plain text,
  document blocks, and deck source outline.
- Preserve durable block-id semantics.

### Suggested Issues

1. **R38.1 - Define content projection facade**
   - Create a single module exporting Markdown parse, Lexical serialization,
     plain text, and document block projection helpers.
   - Re-export existing helpers first to reduce churn.

2. **R38.2 - Move DocumentBlock extraction out of visual export**
   - Relocate `collectDocumentBlocks` to the content projection subsystem.
   - Keep document export importing the facade.

3. **R38.3 - Add projection drift tests**
   - Assert Markdown import, Lexical plain text, document blocks, AI deck source,
     and presentation blocks agree on headings/lists/quotes/hr/visual nodes.

4. **R38.4 - Clarify import persistence policy**
   - Keep `IMPORT_TAG`, `RESTORE_TAG`, and confirmation helpers in an import
     boundary with tests and docs.

### Verification

- Markdown tests.
- Lexical from-markdown/plain-text tests.
- Document export block tests.
- AI deck-source tests.
- Import persistence tests.

## R39 - Theme and Style Cascade Boundary

### Problem

Theme and style behavior spans several related but separate systems:

- `deck-theme-tokens.ts` defines deck tokens, semantic text roles, role defaults,
  built-in token sets, and background treatment helpers.
- `style-cascade.ts` resolves deck tokens, masters, slide overrides, renderer
  colors, text roles, and origin metadata.
- `deck-brand-tokens.ts` maps Brand Studio data into deck theme/master chrome.
- `text-style.ts`, visual themes, visual display styles, and export/theme parity
  tests all participate in the same styling story.
- Slide canvas and deck export read style information in different units and
  contexts.

The style model is powerful, but the cascade layers and unit boundaries are not
yet isolated enough for safe extension.

### Best Strategy

Create a style cascade subsystem with explicit layers, token types, resolvers,
brand adapters, and renderer/export adapters. Keep visual-content themes separate
from deck/app chrome, but provide parity tests and adapter boundaries where they
intersect.

### Requirements

- Split theme token types/data from resolver functions.
- Document the cascade layers in code:
  - deck token set;
  - master slide;
  - reusable layout;
  - slide override;
  - element override.
- Make unit boundaries explicit: point sizes, slide-height percentages, CSS
  colors, CSS font stacks, and export units.
- Keep brand-to-deck token conversion in a dedicated adapter.
- Keep visual themes/display styles separate from deck theme tokens, but add
  explicit bridge/parity helpers for export and rendering.
- Ensure `style-cascade` has no React/browser dependency.
- Add tests for origin tracking and fallback behavior when optional fields are
  absent.

### Suggested Issues

1. **R39.1 - Split deck theme token data and resolvers**
   - Move built-in token sets and role defaults away from resolver logic.
   - Preserve public resolver APIs initially.

2. **R39.2 - Extract cascade layer resolver modules**
   - Separate background, master, slide color, text role, and non-text default
     resolvers.
   - Keep origin metadata stable.

3. **R39.3 - Define brand-to-deck theme adapter boundary**
   - Move brand chrome/token mapping into one adapter with tests.
   - Coordinate with R3 brand asset contract cleanup.

4. **R39.4 - Add renderer/export style parity tests**
   - Ensure slide canvas and deck export resolve equivalent typography/color
     for the same deck/slide/element.

### Verification

- Style cascade tests.
- Deck theme token tests.
- Brand token tests.
- Theme parity/export tests.
- Slide rendering regression tests.

## R40 - Auth Session and Route Protection

### Problem

Auth/session behavior is split between Edge-safe config, Node provider config,
route actions, and proxy protection:

- `auth.config.ts` is Edge-safe and owns protected-route redirects.
- `auth.ts` adds Credentials/Google providers, bcrypt, Prisma, OAuth user
  linking, JWT/session callbacks, and first-run sample seeding.
- `proxy.ts` wires the Edge-safe config to Next.js proxy matching.
- Login/signup/settings/account lifecycle actions live elsewhere.
- Google first login creates or updates a local user and seeds sample content in
  the JWT callback path.

R28 covers account lifecycle forms and token flows. This epic covers runtime
session/provider boundaries and route protection.

### Best Strategy

Split provider lifecycle from route protection. Keep Edge-safe config minimal,
move OAuth user linking and sample seeding into a service, and define route
protection rules as data so proxy and auth-page redirects are easier to test.

### Requirements

- Keep Edge-safe config free of Prisma, bcrypt, and Node-only dependencies.
- Extract credentials authorization into an auth credential service that owns
  email normalization and password comparison.
- Extract OAuth local-user linking/updating and first-run sample seeding into a
  service used by callbacks.
- Define protected/auth/public route patterns in one route-protection policy.
- Keep proxy matcher exclusions explicit and tested.
- Keep JWT/session callback behavior stable: session user receives the DB user
  id.
- Coordinate with R28 so signup/login actions and provider callbacks share
  account creation/seeding policy.

### Suggested Issues

1. **R40.1 - Extract credentials authorization service**
   - Move email normalization, user lookup, passwordHash checks, and bcrypt
     compare out of `auth.ts`.

2. **R40.2 - Extract OAuth user-linking service**
   - Move Google email linking/update/create/sample-seed behavior out of JWT
     callback body.
   - Ensure seeding happens exactly once for new OAuth users.

3. **R40.3 - Define route protection policy**
   - Move `/app` protection and `/login`/`/signup` bounce rules to a pure policy
     helper used by `auth.config.ts`.

4. **R40.4 - Add proxy/auth config tests**
   - Test protected, auth-page, public, API/static matcher behavior without
     importing Node-only providers.

### Verification

- Auth config tests.
- Google provider tests.
- Password auth tests.
- Login/signup E2E auth redirect tests.

## R41 - App Shell and Navigation Boundary

### Problem

The app shell currently mixes several product concerns:

- `SiteHeader` fetches the current user, reads account plan/credits, resolves
  entitlements, renders desktop nav, mobile nav, user menu, billing link,
  language switcher, keyboard shortcuts, and logged-out links.
- Mobile navigation repeats much of the desktop nav composition.
- Credit display depends on billing entitlements and unlimited-credit flags.
- Language switcher visibility depends on i18n feature flags.
- Keyboard shortcut help is mounted from the shell.

The header is not huge, but it is a central cross-cutting composition point that
will become fragile as billing, i18n, navigation, and shortcuts evolve.

### Best Strategy

Create an app shell view-model loader and navigation registry. Keep `SiteHeader`
as a server component that binds shell data, but move nav item definitions,
account/credit summary shaping, and utility slot composition into owned helpers.

### Requirements

- Define a shell view model containing:
  - auth state;
  - display name/email;
  - plan/credit summary;
  - nav items;
  - enabled utilities (language switcher, shortcuts, user menu actions).
- Move Prisma account lookup and entitlement shaping into a shell loader.
- Define navigation item data once and render it for desktop and mobile.
- Keep route-specific header suppression (`HeaderGate`) explicit.
- Keep keyboard shortcut and language switcher feature decisions delegated to
  their owning subsystems.
- Avoid direct billing/i18n logic in the presentational header component.
- Preserve current responsive layout and links.

### Suggested Issues

1. **R41.1 - Add shell view-model loader**
   - Move user/account/credit shaping out of `SiteHeader`.
   - Keep server component behavior and DB select stable.

2. **R41.2 - Define navigation item registry**
   - Render desktop and mobile nav from shared item data.
   - Preserve labels through i18n translator.

3. **R41.3 - Split shell utilities into slots**
   - Keep language switcher, keyboard shortcuts, credit link, and user menu as
     explicit utility slots driven by view model flags.

4. **R41.4 - Add app shell tests/snapshots**
   - Test logged-in/logged-out view model shaping and nav item visibility.

### Verification

- Header/nav component tests if available.
- Billing entitlement tests for credit summary.
- i18n tests for labels.
- Public/app route header visibility smoke tests.

## R42 - Server Component View Models

### Problem

Many server components query Prisma directly and pass ad hoc serialized shapes
to client components. This is normal in small App Router apps, but the project
now has enough surfaces that implicit view models are becoming hidden APIs:

- Dashboard pages shape documents, tags, onboarding, and workspace data.
- Document pages shape editor initial state, comments, tags, capabilities,
  share settings, deck JSON, and workspace context.
- Brand/settings/public pages each shape their own records.
- Client components often define their own prop types based on route-local
  server data.

R24 covers document management services and R26 covers action ports. This epic
covers read-side view models for server components.

### Best Strategy

Introduce route-independent server component loaders that return typed,
serialized view models. Keep route pages responsible for auth/redirect/notFound
and composition, while loader modules own Prisma selects and serialization.

### Requirements

- Define view model loaders for high-traffic pages:
  - dashboard document list;
  - document editor page;
  - workspace detail;
  - brand studio;
  - settings/account;
  - public share/present after R29.
- Ensure loader output is serializable across the RSC/client boundary.
- Co-locate Prisma `select` shapes with the loader, not in client components.
- Export view-model types from stable modules so client components do not infer
  route-local shapes.
- Keep route pages responsible for `notFound`, `redirect`, metadata, and layout
  composition.
- Add tests for loader shaping where business rules are non-trivial.

### Suggested Issues

1. **R42.1 - Add document editor view-model loader**
   - Shape initial content, deck, comments, tags, capabilities, workspace, and
     share settings in one server-only module.

2. **R42.2 - Add dashboard view-model loader**
   - Shape documents, tags, list cap, onboarding state, and workspace summary.

3. **R42.3 - Add brand/settings view-model loaders**
   - Move Prisma selects and serialization out of route components.

4. **R42.4 - Add serializability checks for view models**
   - Ensure Date/Map/Set/Prisma Json values are converted intentionally before
     crossing into client components.

### Verification

- Loader unit tests with mocked rows.
- Typecheck for client/server prop boundaries.
- App route smoke tests for dashboard, document editor, brand, settings.

## Migration Code Policy

Refactoring should distinguish three different categories:

1. **Schema audit:** keep. Audit is a current release gate and should remain as
   long as persisted data can drift.
2. **Generic migration harness:** keep only if it has a current operational
   owner and an expected near-term use. If no migration descriptors are planned,
   remove the empty CLI/registry and docs references rather than carrying unused
   scaffolding.
3. **One-off migrations:** delete after the target data has been migrated, the
   schema no longer contains the old fields, and release docs no longer mention
   the one-off command.

## Issue Template

Each issue created from this roadmap should include:

- **Subsystem:** owning area and public boundary.
- **Problem:** current code smell or inconsistency, with file references.
- **Decision:** the chosen current-shape behavior.
- **Requirements:** concrete behavior and API constraints.
- **Non-goals:** what the issue must not refactor.
- **Acceptance checks:** tests, typecheck, lint, E2E, or docs checks.
- **Rollback risk:** user-visible behavior that must remain stable.

## Recommended Execution Order

1. R9.1 known unused cleanup and R9.4 future-only placeholder cleanup.
2. R1 persisted deck boundary.
3. R14 schema/tooling hygiene, especially schema drift checks.
4. R10 unified asset subsystem.
5. R2 legacy presentation path removal.
6. R6 small shared helper moves.
7. R7 action boundary helper.
8. R13 non-AI API route boundaries.
9. R5 AI route harness.
10. R12 command system registry cleanup.
11. R3 brand asset contract and schema cleanup.
12. R15 access policy surface cleanup.
13. R18 diagnostics and logging platform.
14. R17 billing domain boundary.
15. R16 collaboration runtime boundary.
16. R19 catalog and registry boundaries.
17. R20 i18n and onboarding scope cleanup.
18. R27 runtime config and feature flags.
19. R21 Lexical editor core boundary.
20. R26 client/server action ports.
21. R23 comments and annotations boundary.
22. R24 document management boundary.
23. R25 test fixture and builder platform.
24. R22 design system boundary.
25. R32 performance budgets and limits.
26. R28 auth and account lifecycle.
27. R29 public render surface boundary.
28. R30 tags, search, and taxonomy.
29. R31 accessibility and shortcuts.
30. R33 deck model and validation boundary.
31. R35 visual runtime boundary.
32. R36 AI prompt and repair pipeline.
33. R34 presentation runtime boundary.
34. R37 export options and output profiles.
35. R38 content conversion pipeline.
36. R39 theme and style cascade boundary.
37. R40 auth session and route protection.
38. R41 app shell and navigation boundary.
39. R42 server component view models.
40. R8 visual export split.
41. R11 document visual editing surfaces.
42. R4 slide editor modularization in small vertical slices.

R4 is intentionally late because the UI split is easier and safer after command
semantics, helper ownership, and current-shape boundaries are clearer.
