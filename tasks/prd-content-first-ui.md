# PRD: Content-First Editor — A Minimal, Napkin-Style Writing & Visual Experience

## Introduction/Overview

The document editor today is a **two-panel, tab-driven workspace**: a left
Markdown column with a fixed block-type toolbar and **Write / Preview tabs**
(`src/app/app/documents/[id]/document-editor.tsx`), and a separate **right-hand
visual panel** (`visual-panel.tsx`). Per-paragraph ("spark") visual generation
only appears in the **Preview** tab (`block-visual-generator.tsx`), so the act of
writing and the act of visualizing live in different places and modes.

Real **Napkin.ai** feels different: there is **one content surface**. You write
prose like a blog post, and when you want a visual you reveal a small affordance
**next to the paragraph you're working on**, generate, and the visual appears
**inline, directly beneath that paragraph**. The chrome is minimal and
**contextual** — toolbars float in only when relevant and fade away otherwise.

This PRD redesigns the editor into a **content-first, single-canvas experience**
with **floating, minimal UI** and **subtle animations**, while **reusing the entire
existing backend unchanged** — the same server actions, collaboration layer,
visual schema, `/api/generate` endpoint, and the directive-free `VisualRenderer`.
It is a **front-end / UX redesign only**.

### What changes vs. what stays

- **Changes:** the editor's layout and interaction model (remove the
  Write/Preview tab split and the always-on right visual panel; introduce one
  scrollable document canvas where each paragraph can own an inline visual
  revealed via a hover "spark" toolbar; replace fixed chrome with floating
  contextual toolbars + one small persistent mini-toolbar; add CSS
  micro-interaction animations).
- **Stays (reused as-is):** `parseMarkdown`/`applyBlockType` and stable block ids;
  `attachVisual`/`detachVisual`/`saveDocumentContent`/`saveDocumentTitle` actions;
  the collaboration hooks (`useCollaboration`/`useYText`); the visual schema and
  `safeParseVisual`/`validateVisual`; `/api/generate`; `VisualRenderer`,
  `VisualEditor`, `StylePanel`, `ExportMenu`; comments, sharing, presence, and
  keyboard-shortcut infrastructure.

## Goals

- Present a **single content canvas** (no Write/Preview tabs) where the user writes
  prose and **inline visuals render directly beneath their source paragraph** in
  document order.
- Let the user **reveal a per-paragraph "spark" toolbar on hover** (a gutter
  affordance beside the paragraph) to generate, replace, or remove that
  paragraph's visual — the central Napkin interaction.
- Replace fixed chrome with **floating contextual toolbars** (appear on
  hover/relevance, animate out otherwise) plus **one small persistent
  mini-toolbar** for always-needed actions.
- Add **subtle CSS micro-interactions** (fade/slide for toolbars, hover/press
  states, visual mount/unmount, a generation "thinking" pulse) — no motion
  library, no layout-shift jank.
- Keep the experience **minimal and easy to follow**: discoverable affordances,
  clear focus states, accessible labels, and keyboard support.
- **Reuse 100% of the existing backend** — no schema, action, endpoint, or renderer
  changes — and keep lint, typecheck, build, and `format:check` green.
- Preserve all current capabilities: autosave, collaboration/presence, comments,
  sharing/embed, visual editing/style/export, and existing keyboard shortcuts.

## User Stories

> Numbering restarts at US-001 for this PRD. Stories are front-end only and are
> sequenced so foundational layout/components land before the affordances that use
> them. Every story reuses existing backend actions/components.

---

### Feature Area A — Single Content Canvas

### US-001: Introduce a unified editor layout scaffold (flag-gated)
**Description:** As a developer, I want a new single-canvas editor component
scaffold so I can build the content-first experience without breaking the current
editor.

**Acceptance Criteria:**
- [ ] Add a new client component (e.g. `content-editor.tsx`) rendered by the editor
      page in place of the tab/two-panel layout, reusing the same props the page
      already passes to `DocumentEditor` (id, initial title/content/visuals, share
      state, canEdit, collaboration inputs, comments).
- [ ] The new layout is a single centered, blog-width column (max content width,
      generous line length) with the title at top and the body below — no
      Write/Preview tabs and no always-on right panel.
- [ ] Writing still flows through the existing collaboration/autosave path
      (`useYText`/`useCollaboration` + `saveDocumentContent`/`saveDocumentTitle`);
      the save-status indicator still appears.
- [ ] Editing is disabled until collaboration is `ready` (reuse the existing gate).
- [ ] No backend/schema/action changes.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-002: Render inline visuals beneath their source paragraph
**Description:** As a user, I want each paragraph's visual to appear right under
that paragraph so my document reads top-to-bottom like a blog with diagrams.

**Acceptance Criteria:**
- [ ] Parsed blocks (`parseMarkdown`, stable `block.id`) render in order; any block
      with an anchored visual shows it inline beneath the block using
      `VisualRenderer` in a `[data-block-visual="<blockId>"]` card (reuse the
      existing inline pattern).
- [ ] The document-level visual (anchor `null`) is shown in its own inline slot
      (e.g. at the top or bottom of the document) — not a separate fixed panel.
- [ ] Initial visuals come from the existing `initialBlockVisuals` /
      `initialVisual` props (no new query).
- [ ] Document order is preserved for ≥3 inline visuals.
- [ ] No backend/schema/action changes.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-003: Inline editing of prose on the single canvas
**Description:** As a user, I want to write and format prose directly on the canvas
so I never switch into a separate "write mode".

**Acceptance Criteria:**
- [ ] The body is editable in place (a textarea or contentEditable surface is
      acceptable as long as it binds to the existing `useYText` content model).
- [ ] Block-type formatting (H1/H2/H3, bullets, paragraph) still works via
      `applyBlockType`, applied to the current selection/caret.
- [ ] Typing reflects live for collaborators (existing collab path) and autosaves.
- [ ] Caret/selection is preserved across formatting actions (reuse existing
      selection-restore approach).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

---

### Feature Area B — Hover "Spark" Paragraph Toolbar

### US-004: Per-paragraph hover gutter affordance
**Description:** As a user, I want a small control to appear next to a paragraph
when I hover it so I can act on just that paragraph.

**Acceptance Criteria:**
- [ ] Hovering (or focusing) a block reveals a floating gutter toolbar positioned
      beside that block (e.g. left/right gutter), with at least a "Generate visual"
      ("spark") button (`aria-label="Generate visual for this block"`).
- [ ] The affordance is hidden by default and only shown for the
      hovered/focused block; it does not shift the text layout when it appears
      (absolute/transform positioning).
- [ ] Only one block's toolbar is visible at a time.
- [ ] The affordance is keyboard-reachable (focus reveals it) and has accessible
      labels.
- [ ] Gating: the spark only appears when `editable` (canEdit && collab ready);
      read-only viewers never see it.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-005: Generate a visual for a paragraph from the spark toolbar
**Description:** As a user, I want to click the spark to generate a visual for that
paragraph so a diagram appears beneath it.

**Acceptance Criteria:**
- [ ] Clicking the spark sends that block's text (`blockText(block)`) to
      `/api/generate` and shows candidate variations inline near the block (reuse
      the existing block generation flow / candidate picker).
- [ ] Selecting a candidate persists it via `attachVisual(documentId, candidate,
      block.id)` and renders it inline beneath the block.
- [ ] Generation/save errors are non-blocking and retryable (`role="alert"` + a
      retry affordance), preserving the candidates/canvas state.
- [ ] Only one generation picker is open at a time.
- [ ] No backend/schema/action changes (reuse `/api/generate` + `attachVisual`).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser (mock-Azure setup per AGENTS.md).

### US-006: Replace or remove a paragraph's visual from the spark toolbar
**Description:** As a user, I want to swap or delete a paragraph's visual so I can
iterate quickly.

**Acceptance Criteria:**
- [ ] When a block already has a visual, the spark toolbar (or the inline visual
      card) offers "Replace" (reopens generation) and "Remove"
      (`aria-label="Remove this block's visual"`).
- [ ] "Remove" calls `detachVisual(documentId, block.id)` and removes the inline
      card optimistically (restores on failure).
- [ ] "Replace" reruns generation and updates the inline visual on selection.
- [ ] No backend/schema/action changes.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

---

### Feature Area C — Inline Visual Editing (Contextual)

### US-007: Open visual editing tools contextually for an inline visual
**Description:** As a user, I want to edit a visual's elements/style without a fixed
side panel so the UI stays minimal.

**Acceptance Criteria:**
- [ ] Selecting/clicking an inline visual reveals contextual editing controls
      (reuse `VisualEditor` for node/edge editing and `StylePanel` for theme/color
      controls) anchored to that visual (e.g. a floating toolbar above the visual or
      a popover), not a permanent right panel.
- [ ] Edits flow through the existing debounced `attachVisual` save path and persist
      after reload.
- [ ] Type switching (the existing kind pills) and variation browsing remain
      available from the contextual controls.
- [ ] Export (`ExportMenu`) is available from the visual's contextual controls.
- [ ] Clicking away dismisses the contextual controls.
- [ ] No backend/schema/action changes.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

---

### Feature Area D — Floating Minimal Chrome

### US-008: Selection/format floating toolbar
**Description:** As a user, I want formatting controls to float in only when I need
them so the canvas stays clean.

**Acceptance Criteria:**
- [ ] The fixed block-type toolbar is replaced by a floating toolbar that appears on
      text focus/selection (block-type buttons: H1/H2/H3, bullet, paragraph) using
      `applyBlockType`.
- [ ] The toolbar is dismissed when focus leaves the editing surface.
- [ ] Toolbar buttons keep the caret/selection (existing `onPointerDown`
      preventDefault pattern).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-009: Persistent mini-toolbar for always-needed actions
**Description:** As a user, I want a small always-visible toolbar for global actions
so core controls are one click away.

**Acceptance Criteria:**
- [ ] A single compact, unobtrusive mini-toolbar (e.g. top-right or bottom-center)
      hosts always-needed actions: save status, Share (`ShareButton`), Comments
      (`CommentsPanel`), and Presence (`Presence`).
- [ ] The mini-toolbar does not cause horizontal overflow at 375/768/1280
      (`document.documentElement.scrollWidth <= clientWidth`).
- [ ] All existing functionality (share, comments, presence, save indicator) still
      works from the mini-toolbar.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-010: Empty-state and onboarding hints on the canvas
**Description:** As a new user, I want gentle hints so I learn the hover-to-generate
interaction.

**Acceptance Criteria:**
- [ ] An empty document shows a subtle placeholder prompting the user to start
      writing.
- [ ] The first time a paragraph is hovered (or via a one-line helper), a hint
      indicates the spark generates a visual for that paragraph.
- [ ] Hints are non-blocking, dismissible, and never overlap content.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

---

### Feature Area E — Animations & Micro-interactions

### US-011: Toolbar and affordance enter/exit animations
**Description:** As a user, I want toolbars to fade/slide in and out so the UI feels
smooth and intentional.

**Acceptance Criteria:**
- [ ] Floating toolbars (spark gutter, selection toolbar, contextual visual
      controls) animate in/out with a short CSS transition (fade + small
      translate), respecting `prefers-reduced-motion` (no motion when reduced).
- [ ] No layout shift is introduced by the animations (transform/opacity only).
- [ ] No animation library is added (CSS transitions/`@keyframes` only).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-012: Visual mount/unmount and generation "thinking" animation
**Description:** As a user, I want a visual to animate in when generated and a
"thinking" state while generating so the experience feels responsive.

**Acceptance Criteria:**
- [ ] When an inline visual is added, it animates in (fade/scale or height reveal);
      when removed, it animates out before unmounting (or fades out).
- [ ] While `/api/generate` is in flight, the spark/inline area shows a subtle
      pulsing/“thinking” indicator (CSS only).
- [ ] Animations respect `prefers-reduced-motion`.
- [ ] No backend changes; reuse the existing loading state from the generation flow.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-013: Button and control hover/press micro-interactions
**Description:** As a user, I want consistent hover/press feedback so controls feel
tactile.

**Acceptance Criteria:**
- [ ] Spark, toolbar, and mini-toolbar buttons have consistent hover and active
      (press) states using the existing zinc palette + `dark:` variants and short
      transitions.
- [ ] Focus-visible states are clear and accessible for keyboard users.
- [ ] Transitions respect `prefers-reduced-motion`.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

---

### Feature Area F — Parity & Cleanup

### US-014: Preserve comments, sharing, presence, and shortcuts in the new editor
**Description:** As a user, I want all existing collaboration features to keep
working in the redesigned editor.

**Acceptance Criteria:**
- [ ] Comments (`CommentsPanel`), sharing/embed (`ShareButton`), presence
      (`Presence`), and the existing keyboard shortcuts all work in the new layout.
- [ ] Text/visual collaboration still syncs across two browsers (existing collab
      behavior) and edits persist via autosave.
- [ ] Read-only viewers (shared docs / non-editors) see inline visuals with no
      editing affordances.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-015: Retire the tab/two-panel editor and reconcile the share/read views
**Description:** As a developer, I want to remove the now-unused tab UI so the
codebase stays clean and consistent.

**Acceptance Criteria:**
- [ ] The editor page renders only the new content-first editor; the
      Write/Preview-tab + right-`VisualPanel` layout is removed (or its now-unused
      code paths deleted) once the new editor reaches feature parity.
- [ ] The read-only share page (`/share/[shareId]`) and embed page
      (`/embed/[shareId]`) remain visually consistent with the new content-first
      layout (inline visuals beneath paragraphs), reusing the directive-free
      `MarkdownPreview` + `VisualRenderer`.
- [ ] No dead imports/exports remain; lint is clean.
- [ ] No backend/schema/action changes.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

## Functional Requirements

- FR-1: The editor MUST present a **single, blog-width content canvas** (no
  Write/Preview tabs, no always-on right visual panel); the title and prose are
  edited in place, bound to the existing collaboration/autosave model.
- FR-2: Parsed blocks (via `parseMarkdown`, keyed by stable `block.id`) MUST render
  in document order, with any anchored visual shown **inline beneath its block**
  using `VisualRenderer`; the document-level visual gets its own inline slot.
- FR-3: Hovering or focusing a block MUST reveal a **floating per-paragraph spark
  toolbar** (one at a time, no layout shift, keyboard-reachable, editable-gated)
  offering Generate, and Replace/Remove when a visual exists.
- FR-4: The spark MUST generate via the existing `/api/generate` using
  `blockText(block)`, present candidate variations inline, and persist the chosen
  visual via `attachVisual(documentId, candidate, block.id)`; Remove uses
  `detachVisual`. No endpoint/action contract change.
- FR-5: Inline visual editing (elements/style/type-switch/variations/export) MUST be
  available **contextually** (floating toolbar/popover anchored to the selected
  visual) by reusing `VisualEditor`, `StylePanel`, and `ExportMenu` — not a fixed
  side panel — persisting through the existing debounced `attachVisual` path.
- FR-6: Fixed chrome MUST be replaced by **floating contextual toolbars** (selection
  formatting toolbar; per-paragraph spark; per-visual controls) plus **one small
  persistent mini-toolbar** hosting save status, Share, Comments, and Presence.
- FR-7: The UI MUST include **subtle CSS-only animations** (toolbar fade/slide,
  visual mount/unmount, generation "thinking" pulse, button hover/press), all
  honoring `prefers-reduced-motion` and avoiding layout shift; **no animation
  library** may be added.
- FR-8: The redesign MUST be **front-end only** — no changes to Prisma schema,
  migrations, server actions, `/api/generate`, the visual schema, or the
  directive-free `VisualRenderer`.
- FR-9: All existing features (autosave, collaboration, presence, comments,
  sharing, embed, visual editing/style/export, keyboard shortcuts) MUST continue to
  work; read-only viewers see inline visuals without editing affordances.
- FR-10: The share (`/share/[shareId]`) and embed (`/embed/[shareId]`) views MUST
  stay consistent with the new content-first layout.
- FR-11: No horizontal overflow at 375/768/1280 across the editor, share, and embed
  views.

## Non-Goals (Out of Scope)

- **No backend changes** of any kind: no schema/migrations, no new or changed server
  actions, no `/api/generate` contract change, no visual-schema change, no
  `VisualRenderer` rendering change.
- **No animation library** (e.g. framer-motion) — CSS transitions/keyframes only.
- **No rich block-based editor** (Notion-style draggable blocks, slash menus, drag
  handles) — prose stays Markdown-backed; blocks are the existing parsed paragraphs.
- **No new visual types**, AI features, or generation modes beyond what the spark
  flow already uses.
- **No selection-popover or slash-command generation** in this iteration (the chosen
  trigger is the **hover gutter spark** only).
- **No changes to auth, workspaces, dashboard, settings, or sharing logic** beyond
  rendering existing controls in the new layout.
- **No mobile-native app** — responsive web only (must remain usable at 375px).

## Design Considerations

- **Content-first canvas:** centered single column, comfortable max-width and line
  height for reading/writing (blog feel); the title is a large inline field at top.
- **Floating chrome:** toolbars use absolute/transform positioning so they never
  reflow text; only the relevant one shows at a time; dismiss on blur/click-away.
- **Spark affordance:** a small, low-contrast icon button in the block gutter that
  brightens on hover/focus; reuse the existing `Sparkles` icon and the block
  generation/candidate-picker logic from `block-visual-generator.tsx`.
- **Inline visuals:** reuse the `[data-block-visual="<blockId>"]` card pattern and
  the directive-free `VisualRenderer`; the document-level visual reuses the same
  card styling in its own slot.
- **Minimal mini-toolbar:** compact, unobtrusive; reuse `ShareButton`,
  `CommentsPanel`, `Presence`, and the save-status indicator as-is.
- **Styling:** zinc palette with `dark:` variants, pill/rounded controls, card
  borders `border-black/[.06]` / `dark:border-white/[.08]`; match existing
  components.
- **Click-outside** for any new popover/menu MUST use the **ref-containment**
  pattern (never `stopPropagation`), per `AGENTS.md`.
- **Accessibility:** every floating affordance has an `aria-label`; focus reveals
  hover-only controls; visible focus states; animations gated by
  `prefers-reduced-motion`.

## Technical Considerations

- **Reuse, don't rebuild:** the new `content-editor.tsx` should compose existing
  pieces — `useCollaboration`/`useYText`/`useDebouncedSave`, `parseMarkdown`/
  `applyBlockType`/`blockText`, `attachVisual`/`detachVisual`/`saveDocumentContent`/
  `saveDocumentTitle`, the candidate-generation flow, `VisualRenderer`/
  `VisualEditor`/`StylePanel`/`ExportMenu`, `CommentsPanel`/`ShareButton`/
  `Presence`. Migrate behavior out of `document-editor.tsx`/`visual-panel.tsx`/
  `block-visual-generator.tsx` rather than reimplementing it.
- **Editable gating:** keep the `editable = canEdit && collab ready` rule; poll the
  document-text surface for `:not([disabled])` in browser QA before driving the
  spark (per AGENTS.md).
- **Generation QA:** use the documented **local mock-Azure** server (process-env
  override) — never the network; candidate edges need non-empty `id`s.
- **React 19 lint rules** (per AGENTS.md): no `setState` in effect bodies; assign
  "latest callback" refs in effects, not during render; subscribe to Yjs via
  effect-registered `observe`.
- **Performance:** floating toolbars and hover state must not re-render the whole
  document on every mouse move; scope hover state to the block (e.g. CSS
  `group-hover` or a single `hoveredBlockId`).
- **Animations:** transform/opacity only; respect `prefers-reduced-motion` via a
  media query or a reduced-motion utility.
- **Quality gate:** lint, typecheck, build, and `format:check` stay green; browser
  QA via `dev-browser --headless` against the production build, verifying no
  horizontal overflow at 375/768/1280.

## Success Metrics

- A user can write a paragraph and generate an inline visual for it in **≤ 2 clicks**
  from hovering the paragraph (spark → select candidate), with the visual appearing
  directly beneath it.
- The editor shows **no fixed Write/Preview tabs and no always-on side panel**; all
  formatting/visual/edit controls are floating/contextual or in the single
  mini-toolbar.
- A document with **≥ 3 inline visuals** reads top-to-bottom (prose + diagrams) and
  matches in the share/embed views.
- All existing features (autosave, collaboration, comments, share/embed, visual
  edit/style/export, shortcuts) pass browser QA in the new editor.
- No horizontal overflow at 375/768/1280; animations honor
  `prefers-reduced-motion`; lint/typecheck/build/format:check green.

## Open Questions

- Where should the **document-level visual** (anchor `null`) live in a content-first
  layout — pinned at the top, at the bottom, or deprecated in favor of per-paragraph
  visuals only?
- Should the editing surface stay a **single textarea** (simplest, reuses current
  selection logic) or move to per-block editable regions (closer to Napkin but more
  invasive)? (Default: keep the single textarea bound to `useYText`.)
- Should the **selection formatting toolbar** (US-008) also offer inline marks
  (bold/italic), or stay block-type only as today? (Default: block-type only — no
  schema/markdown change.)
- For the spark's candidate picker, reuse the **inline block picker** styling
  (`Select <Kind> option <n>`) or the main **variations gallery** styling
  (`Select variation <n> of <m>`)? (Default: the inline block picker.)
- Is a one-time onboarding hint (US-010) sufficient, or is a short dismissible
  coachmark tour desired? (Default: a single non-blocking hint.)
