# PRD: Napkin Parity — Closing the Biggest Feature Gaps

## Introduction/Overview

The current app (US-001–US-020 in `tasks/prd-napkin-clone.md`) is a solid Napkin
clone: auth, dashboard, a Markdown text editor, AI visual generation, five visual
types, type-switching, element/style editing, multi-format export, sharing,
workspaces, real-time collaboration, and inline comments.

However, when compared against the real **Napkin.ai**, several defining features
are missing. This PRD is a **multi-feature roadmap** to close the biggest gaps and
move the clone toward Napkin parity. It groups the work into six feature areas,
each broken into small, independently-shippable user stories:

1. **Icon library + icon swapping** — Napkin's signature: every node can carry a
   searchable icon, with AI-suggested alternatives you can swap between.
2. **Inline per-block "Spark" generation + multiple visuals per document** — In
   Napkin you hover a paragraph and generate a visual *for that selection*, and a
   single document can hold *many* inline visuals. Today the clone generates from
   the whole document and stores only one visual per document.
3. **Visual variations / re-roll** — browse multiple alternate layouts/styles for
   the same content instead of a single regenerate.
4. **More visual types** — timelines, comparisons, funnels, pyramids, Venn,
   cycles, etc., beyond the current five generic types.
5. **Connector / edge editing** — edit arrow style, curve, direction, and labels.
6. **Embeddable visuals** — an `<iframe>` embed code in addition to the existing
   read-only share link.

**Priority lens:** match real-Napkin behavior as closely as is practical with the
existing stack (Next.js 16, Prisma 7, the `nodes + edges + style` visual schema,
the directive-free SVG renderer, and the Azure-backed `/api/generate` endpoint).

## Goals

- Add a **bundled, offline icon library** (no network calls) and let any node show,
  search, swap, or remove an icon.
- Let users **generate a visual from a selected text block** and keep **multiple
  visuals per document**, each anchored to the text it came from.
- Let users **browse and pick among multiple AI variations** of a visual.
- Expand the renderer + generator to support **at least four new visual types**
  (timeline, comparison, funnel, cycle).
- Make **connectors editable** (label, direction, line style, curve).
- Provide a copy-paste **embed snippet** that renders a visual read-only in an
  `<iframe>`.
- Every change keeps lint, typecheck, build, and `format:check` green and preserves
  the SQLite/Postgres portability rules in `AGENTS.md`.

## User Stories

> Numbering continues from the original PRD to avoid collisions. The original PRD
> ends at US-020.

---

### Feature Area A — Icon Library + Icon Swapping

### US-021: Bundle a local icon set and search index
**Description:** As a developer, I need an offline icon set with a searchable index
so nodes can display icons without any network dependency.

**Acceptance Criteria:**
- [ ] Add a single bundled open-source icon set (Lucide, via `lucide-react`, already
      React/SVG-friendly) as the icon source — no runtime network calls.
- [ ] Create `src/lib/icons/catalog.ts` exporting a typed list of available icons:
      `{ name: string; keywords: string[] }[]` (keywords power search).
- [ ] Export a pure `searchIcons(query: string, limit?: number): IconEntry[]` that
      ranks by name/keyword match; empty query returns a curated default set.
- [ ] Add a unit test (`src/lib/icons/catalog.test.ts`, Node test runner + tsx)
      covering exact-match, keyword-match, and empty-query behavior.
- [ ] Typecheck/lint passes.

### US-022: Add icon field to the visual schema
**Description:** As a developer, I need to store an icon reference on a node so it
persists with the visual JSON.

**Acceptance Criteria:**
- [ ] Add optional `icon?: string` (the icon catalog `name`) to `VisualNode` in
      `src/lib/visual/schema.ts`.
- [ ] `validateVisual` accepts nodes with or without `icon`; an unknown icon name is
      ignored gracefully (treated as no icon, not a hard failure) so old/garbled data
      still renders.
- [ ] No database migration needed (icon lives inside `Visual.data Json`).
- [ ] Existing schema/validator tests still pass; add a case for a node with `icon`.
- [ ] Typecheck/lint passes.

### US-023: Render icons inside nodes
**Description:** As a user, I want nodes to show their icon so visuals look like
Napkin's icon-rich diagrams.

**Acceptance Criteria:**
- [ ] `VisualRenderer` draws the node's icon (when `icon` is set and resolves) inside
      the node box, scaled and positioned consistently with the label.
- [ ] Icon color follows the node's `textColor`/theme color so it matches styling.
- [ ] Nodes without an icon render exactly as before (no layout shift regression).
- [ ] Renderer stays directive-free (works in server + client components).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser (the `/visuals` gallery shows at least one fixture with icons).

### US-024: Search and assign an icon to a node
**Description:** As a user, I want to pick an icon for a selected node so I can make
the meaning clearer.

**Acceptance Criteria:**
- [ ] When a node is selected in the visual editor, a "Icon" control opens a searchable
      icon picker (text input + results grid) sourced from `searchIcons`.
- [ ] Choosing an icon sets `node.icon` and re-renders the canvas live.
- [ ] A "Remove icon" action clears `node.icon`.
- [ ] Change persists through the existing debounced `attachVisual` path and survives
      reload.
- [ ] Picker is keyboard-accessible and has `aria-label`s (`Search icons`, `Icon: <name>`).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-025: AI suggests and swaps icons
**Description:** As a user, I want the AI to suggest a fitting icon per node and let me
swap among alternatives, matching Napkin's icon behavior.

**Acceptance Criteria:**
- [ ] The generation prompt (`src/lib/ai/prompt.ts`) asks the model to set a node
      `icon` from the catalog when appropriate; the schema doc lists valid names (or a
      representative subset) so output stays in-vocabulary.
- [ ] Returned icon names are validated against the catalog; invalid ones are dropped
      (node keeps no icon) — no failed generation because of a bad icon.
- [ ] The icon picker shows a small "Suggestions" row (top `searchIcons` matches for
      the node label) so swapping is one click.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using the local mock-Azure setup described in `AGENTS.md`
      (US-011 note) so no real Azure key is required.

---

### Feature Area B — Inline Per-Block Generation + Multiple Visuals Per Document

### US-026: Anchor visuals to a text block (schema/data model)
**Description:** As a developer, I need each visual to optionally remember which text
block it was generated from so a document can hold multiple anchored visuals.

**Acceptance Criteria:**
- [ ] Add nullable `anchorBlockId String?` and `orderIndex Int @default(0)` to the
      `Visual` model in **both** `prisma/schema.prisma` and (regenerated via
      `npm run db:schema:sqlite`) `prisma/schema.sqlite.prisma`.
- [ ] Add a migration in **both** histories (`DB_PROVIDER=postgres` and
      `DB_PROVIDER=sqlite` `migrate dev`) per the `AGENTS.md` dual-history rule.
- [ ] Existing single-visual documents keep working (null anchor = document-level
      visual, the current behavior).
- [ ] `npm run db:generate` + typecheck/build pass under the default (sqlite) provider.

### US-027: Stable block ids in the Markdown model
**Description:** As a developer, I need each Markdown block to have a stable id so a
visual can be tied to a specific paragraph.

**Acceptance Criteria:**
- [ ] `parseMarkdown` (`src/lib/markdown.ts`) assigns each block a deterministic id
      derived from its position/content (stable across re-parses of unchanged text).
- [ ] A unit test verifies ids are stable when surrounding text is unchanged and
      change only for edited blocks.
- [ ] Typecheck/lint passes.

### US-028: Generate a visual from a selected block
**Description:** As a user, I want to generate a visual for one paragraph so I can
illustrate a specific idea, like Napkin's inline spark.

**Acceptance Criteria:**
- [ ] Hovering a block in the editor reveals a "Generate visual" spark affordance in
      the margin/gutter.
- [ ] Clicking it POSTs **only that block's text** to `/api/generate` and shows the
      candidate picker scoped to that block.
- [ ] The chosen visual is saved via an updated `attachVisual` that accepts an
      `anchorBlockId`, creating a **new** `Visual` row (not overwriting other blocks'
      visuals).
- [ ] Owner/member access scoping is preserved (re-validate with `validateVisual`
      server-side).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser (mock-Azure setup).

### US-029: Display multiple inline visuals in the editor and reader
**Description:** As a user, I want each block's visual shown next to its text so the
document reads like a Napkin doc.

**Acceptance Criteria:**
- [ ] The editor renders each anchored visual inline near its source block (and the
      legacy document-level visual still shows when present).
- [ ] The read-only share page (`/share/[shareId]`) renders all anchored visuals inline
      in document order.
- [ ] Deleting a block's visual removes only that visual; others are unaffected.
- [ ] No horizontal overflow at 1280/768/375 (assert `scrollWidth <= clientWidth`).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

---

### Feature Area C — Visual Variations / Re-roll

### US-030: Return and browse multiple variations
**Description:** As a user, I want to see several layout/style variations of a visual
and pick the one I like, matching Napkin's variation browsing.

**Acceptance Criteria:**
- [ ] The candidate picker shows all returned candidates (already 3–6) as a
      browsable gallery with clear "variation N of M" labeling.
- [ ] A "More variations" / re-roll button requests a fresh batch without losing the
      current selection until a new one is chosen.
- [ ] Selecting a variation updates the canvas and persists via `attachVisual`.
- [ ] Loading and error states are non-blocking and retryable (reuse existing pattern).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser (mock-Azure setup).

### US-031: Keep a short variation history per visual (session-scoped)
**Description:** As a user, I want to step back to a previously generated variation in
the same session so I don't lose a good option after re-rolling.

**Acceptance Criteria:**
- [ ] The visual panel keeps the last N (e.g. 10) generated candidates in client state
      for the current document session.
- [ ] A "Recent" strip lets the user re-select any of them; re-selecting persists it.
- [ ] History is cleared on full reload (no DB/schema change; purely client state).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

---

### Feature Area D — More Visual Types

### US-032: Add timeline and cycle visual types
**Description:** As a user, I want timeline and cycle visuals so I can show sequences
and loops the way Napkin does.

**Acceptance Criteria:**
- [ ] Extend `VISUAL_KINDS`/`VISUAL_TYPES` (and the `*_KIND_TO_PRISMA` maps) with
      `timeline` and `cycle`, keeping the `String`-column portability rule (no enums).
- [ ] `VisualRenderer` has a deterministic sub-renderer for each (timeline = ordered
      horizontal steps; cycle = nodes around a ring with directed edges).
- [ ] Add a fixture for each in `src/lib/visual/fixtures.ts`; both appear on `/visuals`.
- [ ] `layout.ts` exposes hit-box layouts for both so the editor's overlay works.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-033: Add comparison and funnel visual types
**Description:** As a user, I want comparison and funnel visuals to present
side-by-side options and staged narrowing.

**Acceptance Criteria:**
- [ ] Add `comparison` and `funnel` to the kind/type unions + maps (no enums).
- [ ] Deterministic sub-renderers: comparison = N columns of grouped items; funnel =
      stacked decreasing bands driven by `node.value`/order.
- [ ] Fixtures added; both render on `/visuals`; `layout.ts` hit-boxes added.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-034: Make new types selectable and generatable
**Description:** As a user, I want the new types available in the type switcher and AI
generation so I can actually use them.

**Acceptance Criteria:**
- [ ] The type-switcher pills include the new kinds (US-032/033).
- [ ] The generation prompt enumerates the new types so the model can target them, and
      passing `type` regenerates as that kind (existing `/api/generate` `type` path).
- [ ] Switching to a new type auto-selects a matching candidate and persists.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser (mock-Azure setup, returning the requested kind).

---

### Feature Area E — Connector / Edge Editing

### US-035: Select and edit a connector's label and direction
**Description:** As a user, I want to click a connector to rename it or flip its
direction so the diagram reads correctly.

**Acceptance Criteria:**
- [ ] The editor overlay adds hit-areas along edges; clicking selects the edge.
- [ ] A selected edge can have its `label` edited inline (reuse the node inline-edit
      pattern) and its direction flipped (swap `from`/`to`) or arrowhead toggled
      (`directed`).
- [ ] Changes re-render live and persist via the existing debounced `attachVisual`.
- [ ] Selecting an edge is keyboard-accessible with an `aria-label` (e.g.
      `Edit connector <label>`).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-036: Connector line style (straight / curved)
**Description:** As a user, I want to choose a straight or curved connector so the
layout looks cleaner.

**Acceptance Criteria:**
- [ ] Add an optional `style?: "straight" | "curved"` (default `straight`) to
      `VisualEdge` in `src/lib/visual/schema.ts` (validated, backward compatible).
- [ ] `VisualRenderer` draws curved edges as a smooth path when `style === "curved"`,
      straight otherwise; arrowhead placement stays correct at the target boundary.
- [ ] A style toggle appears for the selected edge and persists.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

---

### Feature Area F — Embeddable Visuals

### US-037: Public embed route
**Description:** As a user, I want a minimal embeddable page for a shared document's
visual so I can put it on another site.

**Acceptance Criteria:**
- [ ] Add `/embed/[shareId]` rendering the document's visual(s) read-only with no app
      chrome (no header/nav), reusing `VisualRenderer`.
- [ ] Only works when the document `isShared` is true; otherwise `notFound()` (mirrors
      `/share/[shareId]` scoping).
- [ ] The page is safe to frame (does not set headers that block embedding for this
      route) and contains no auth/session widgets.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-038: Copy embed code from the share dialog
**Description:** As a user, I want a copy-paste `<iframe>` snippet so embedding is one
click, like sharing in Napkin.

**Acceptance Criteria:**
- [ ] The existing share UI gains an "Embed" section showing a read-only `<iframe …>`
      snippet pointing at `/embed/[shareId]`.
- [ ] A "Copy" button copies the snippet to the clipboard and confirms via a
      `role="status"` message.
- [ ] The embed section only appears when sharing is enabled.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

## Functional Requirements

- FR-1: Bundle one offline icon set; expose `searchIcons()` and an icon catalog with
  keywords. No runtime network calls for icons.
- FR-2: Add optional `VisualNode.icon` (catalog name); render it inside nodes; ignore
  unknown names gracefully.
- FR-3: Provide a searchable icon picker for the selected node with assign/remove and
  AI/keyword suggestions.
- FR-4: AI generation may set node `icon`s from the catalog; invalid names are dropped,
  never failing generation.
- FR-5: Add `Visual.anchorBlockId` (nullable) and `Visual.orderIndex` with migrations in
  both provider histories; null anchor = document-level (legacy) visual.
- FR-6: `parseMarkdown` assigns stable block ids.
- FR-7: Allow generating a visual from a single block and storing it as a new `Visual`
  row anchored to that block; support multiple visuals per document.
- FR-8: Render anchored visuals inline in the editor and the read-only share page in
  document order.
- FR-9: Present generated candidates as browsable variations with re-roll and a
  session-scoped recent strip.
- FR-10: Add `timeline`, `cycle`, `comparison`, and `funnel` visual kinds with
  deterministic renderers, fixtures, hit-box layouts, type-switcher entries, and prompt
  coverage (no Prisma enums — `String` columns + app-level unions).
- FR-11: Make connectors selectable; allow editing label, direction/arrowhead, and a
  `straight | curved` line style; persist via `attachVisual`.
- FR-12: Add `/embed/[shareId]` (chrome-free, share-gated) and an "Embed" copy snippet in
  the share UI.
- FR-13: All stories keep lint, typecheck, build, and `format:check` green and honor the
  SQLite/Postgres dual-history + generated-`schema.sqlite.prisma` rules in `AGENTS.md`.

## Non-Goals (Out of Scope)

- No custom icon **uploads** or third-party icon **APIs** (single bundled set only).
- No freeform canvas / arbitrary drawing — visuals stay structured `nodes + edges`.
- No animation, transitions, or interactive/clickable published visuals.
- No version history, rollback, or persistent (DB-backed) variation history.
- No billing, paid tiers, or per-feature entitlement (existing rate limiting stays).
- No mobile-native apps (responsive web only).
- No real Azure key requirement for verification — use the documented local mock-Azure.
- No change to the auth, workspace-role, or comments models beyond what each story states.

## Design Considerations

- **Reuse the directive-free renderer.** All new visual types and icon drawing must keep
  `VisualRenderer` server+client safe (no `"use client"`, no hooks, deterministic SVG,
  explicit arrowhead polygons — per `AGENTS.md`).
- **Reuse the editor overlay pattern (US-013).** Edge selection and the icon picker should
  layer on the existing absolutely-positioned SVG overlay + `layout.ts` hit-boxes so
  hotspots never drift from the drawing.
- **Match existing styling.** Zinc palette with `dark:` variants, pill buttons, card
  borders; reuse the style panel layout for the icon picker and edge controls.
- **Keep `layout.ts` the single source of geometry** for any new type so editor hotspots
  and the renderer can't diverge.

## Technical Considerations

- **Icon set:** `lucide-react` renders SVG paths and is tree-shakeable; build the catalog
  from its exported icon names + a small keyword map. The renderer (server-safe) should
  emit icon SVG geometry without client-only APIs.
- **Schema portability:** new kinds are `String` unions, not Prisma enums; after editing
  `prisma/schema.prisma`, rerun `npm run db:schema:sqlite` and create migrations under
  **both** `DB_PROVIDER` values (per `AGENTS.md`).
- **`attachVisual` evolves** from one-visual-per-document to multi-visual: accept an
  optional `anchorBlockId`, upsert by `(documentId, anchorBlockId)`, and keep the
  null-anchor row as the legacy document-level visual for backward compatibility.
- **Testing:** pure logic (icon search, stable block ids, new-type layouts, variation
  selection) gets Node-test-runner + tsx unit tests next to the module; UI stories use the
  local mock-Azure server for generation, never the network.
- **Inline generation** sends a single block's text, so it stays within the existing
  10k-char input cap and quota logic — no endpoint contract change beyond honoring `type`.

## Success Metrics

- Users can add or swap a node icon in ≤ 2 clicks; AI-generated visuals include relevant
  icons on most nodes.
- A single document can hold ≥ 3 inline, independently-anchored visuals that persist and
  render in the share/embed views.
- At least 4 new visual types are generatable, switchable, editable, and exportable with
  no horizontal overflow at 1280/768/375.
- Connector label/direction/style edits persist across reload.
- An embedded visual renders correctly in a third-party `<iframe>` with no app chrome.
- No regression: lint, typecheck, build, and `format:check` stay green.

## Open Questions

- Icon set size vs. bundle weight — ship the full Lucide set or a curated subset for the
  catalog/search index?
- Inline layout: visuals **below** each block (single column) or in a **right rail**
  aligned to blocks? (Napkin uses inline-below; right rail is simpler to lay out.)
- Should the legacy single document-level visual be auto-migrated to a block anchor, or
  left as-is (null anchor) indefinitely?
- For embeds, do we need a size/aspect parameter in the snippet, or a fixed responsive
  wrapper?
- Should re-roll count against the AI quota the same as initial generation?
