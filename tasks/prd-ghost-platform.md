# PRD: Ghost-Style Platform — Lexical Editor, Theme, Sharing & Organization

## Introduction/Overview

This PRD brings the Napkin Clone substantially closer to **Ghost** — both its
**Koenig editor** and its **Casper theme / publishing polish** — while keeping the
app's signature Napkin capability: turning text into AI-generated, editable visuals.

It merges two efforts into one roadmap:

1. **A Ghost/Koenig-style editor + site-wide Ghost theme.** Today the editor stores
   **Markdown** in `Document.content` and edits it in a plain `<textarea>` with
   Write/Preview tabs, a fixed toolbar, a right-hand visual panel, and a
   Preview-only "spark" generator (`document-editor.tsx`,
   `block-visual-generator.tsx`, `visual-panel.tsx`). We replace this with a
   **block editor built on [Lexical](https://lexical.dev/)** (the framework Ghost's
   Koenig uses): a clean single canvas with a "+" line button, a "/" slash menu, a
   floating selection toolbar, and **Napkin visuals as first-class "Visual cards"**
   created via a **per-paragraph hover spark**. The **whole website** also adopts
   **Ghost's typography and theme** (Casper's font system, color tokens, and content
   typography).

2. **Ghost-style sharing & organization polish.** Shared links currently **unfurl
   with nothing** (no Open Graph/Twitter meta or preview image), share URLs are
   **opaque cuids**, the dashboard shows a **generic file icon** instead of a real
   preview, there is **no reading time**, organization is **favorites-only** (no
   tags), and read-only visuals **can't be zoomed**. We borrow Ghost's proven
   patterns: SEO/social cards + auto OG images, **slug permalinks**, a **post-feed
   dashboard** (first-visual thumbnail + excerpt + reading time), **tags**, and a
   **visual lightbox**.

Because the editor work **adopts Lexical** with **full backend latitude**, the
stored document format changes from Markdown to **Lexical editor state (JSON)** with
a migration path; collaboration, autosave, sharing, and embedding update to the new
format. The existing visual subsystem (schema, `/api/generate`,
`VisualRenderer`/`VisualEditor`/`StylePanel`/`ExportMenu`) is **reused**. Motion may
use a **lightweight animation library**.

### What changes vs. what stays

- **Changes:** the editor implementation (Lexical block editor); the stored content
  format (Lexical JSON); the content autosave + collaboration binding; the read-only
  render on share/embed; how visuals are anchored (to a Lexical node); **site-wide
  typography/fonts/theme** (zinc → Ghost tokens); **share URLs** (opaque id → slug);
  new **SEO/OG metadata + OG image**; **dashboard previews** (icon → first visual +
  excerpt + reading time); new **tags**; a **visual lightbox**. A motion library may
  be added.
- **Stays (reused):** the **visual schema** and `safeParseVisual`/`validateVisual`;
  **`/api/generate`**; `VisualRenderer`, `VisualEditor`, `StylePanel`, `ExportMenu`;
  comments, presence, the share/embed routes and their `isShared` scoping;
  auth/workspaces/dashboard shells; `parseMarkdown`; the SQLite + Postgres
  dual-provider rules.

## Goals

- Deliver a **Lexical-based block editor** with a clean single canvas, a "+"
  line-gutter button, a "/" slash menu, and a floating selection format toolbar.
- Support the **core Ghost block set**: paragraph, H2/H3 headings, bullet/numbered
  lists, blockquote, divider, plus inline marks (bold, italic, link).
- Make Napkin **visuals first-class Lexical "Visual cards"** rendered inline,
  **created via a per-paragraph hover spark**, editable contextually, and
  replaceable/removable.
- Change the stored format to **Lexical editor state (JSON)** with a **migration**
  for existing Markdown documents (no data loss).
- Update **autosave + real-time collaboration** to the Lexical/Yjs model so
  multi-user editing still works.
- Keep **share/embed read-only views** consistent (Lexical rendered read-only with
  inline visuals).
- Add **richer-but-tasteful animations** (block/card mount-unmount, toolbar and
  slash-menu reveals, generation "thinking" state), honoring
  `prefers-reduced-motion`.
- Apply a **site-wide Ghost theme**: Ghost's font system (sans UI stack, serif
  long-form option, mono), Ghost color tokens (incl. `#15171A` primary text + accent
  + light/dark modes), and Ghost content typography (heading scale, ~720px reading
  measure, accent-bar blockquotes) across marketing, auth, dashboard, settings,
  editor, and share/embed.
- Make shared links **unfurl beautifully** with Open Graph + Twitter Card meta and an
  **auto-generated preview image**.
- Give documents **readable slug-based permalinks** (`/share/<slug>-<shareId>`),
  backward-compatible with existing `shareId` links.
- Make the dashboard read like a **Ghost post feed**: a real **first-visual
  thumbnail**, a text **excerpt**, and **reading time / word count**.
- Add **tags** for organizing and filtering documents.
- Add a **visual lightbox** (click to zoom) on the read-only share/embed views.
- Keep lint, typecheck, build, and `format:check` green and preserve SQLite/Postgres
  portability (dual migration histories + generated `schema.sqlite.prisma`).

## User Stories

> Numbering restarts at US-001 for this PRD. Stories are sequenced
> dependencies-first and each is sized for one focused session. The editor is a large
> architectural change introduced **behind the existing one** and only swapped in at
> US-018 after parity. Feature Areas **G–M** (theme + sharing/organization) are
> largely **independent of the editor** and can be implemented in parallel.

---

### Feature Area A — Lexical Foundation & Storage Format

### US-001: Add Lexical dependencies and a minimal editor shell
**Description:** As a developer, I want Lexical installed and a minimal rich-text
editor mounting so later stories can build blocks on it.

**Acceptance Criteria:**
- [ ] Add `lexical` and `@lexical/react` (and needed plugins, e.g. `@lexical/list`,
      `@lexical/rich-text`, `@lexical/link`, `@lexical/utils`) to dependencies.
- [ ] Create a new client component (e.g. `lexical-editor.tsx`) that mounts a
      `LexicalComposer` with `RichTextPlugin`, `HistoryPlugin`, and a content-editable
      surface; it renders behind a flag/route and does not replace the current editor
      yet.
- [ ] Typing into the surface works (paragraphs, undo/redo) with no console errors.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-002: Add a Lexical content format column with migrations
**Description:** As a developer, I want to persist Lexical editor state so documents
can store structured content.

**Acceptance Criteria:**
- [ ] Add a nullable `contentJson Json?` column to `Document` in
      `prisma/schema.prisma` (keep `content` for backward-compat/plain-text fallback);
      rerun `npm run db:schema:sqlite`.
- [ ] Create migrations in **both** provider histories (`DB_PROVIDER=postgres` and
      `DB_PROVIDER=sqlite`) and regenerate the client.
- [ ] `contentJson` stores a serialized Lexical editor state (validated as JSON).
- [ ] Typecheck/lint passes.
- [ ] Tests pass.

### US-003: Save and load Lexical editor state
**Description:** As a user, I want my Lexical document to persist so my writing is
saved.

**Acceptance Criteria:**
- [ ] Add a `saveDocumentLexical(documentId, stateJson)` server action
      (access-scoped via `getAccessibleDocument`, `updateMany`) that stores the
      serialized state in `contentJson`.
- [ ] The editor loads `contentJson` as its initial state when present.
- [ ] A plain-text projection of the document is also written to `content` (for AI
      block text, search, and read-only fallback).
- [ ] Saving is debounced; a save-status indicator reflects saved/saving states.
- [ ] Typecheck/lint passes.
- [ ] Tests pass.
- [ ] Verify in browser.

### US-004: Migrate existing Markdown documents into Lexical on first open
**Description:** As an existing user, I want my old Markdown documents to open in the
new editor without losing content.

**Acceptance Criteria:**
- [ ] A pure converter (`src/lib/lexical/from-markdown.ts`, framework-free,
      unit-tested) maps the existing supported Markdown (headings H1–H3, bullet
      lists, paragraphs) to a Lexical editor state JSON.
- [ ] When a document has no `contentJson` but has `content`, the editor initializes
      from the converted Markdown (and the first save persists `contentJson`).
- [ ] An empty document opens with a single empty paragraph.
- [ ] `src/lib/lexical/from-markdown.test.ts` covers headings, bullets, paragraphs,
      and empty input.
- [ ] Typecheck/lint passes.
- [ ] Tests pass.

### US-005: Real-time collaboration on the Lexical document
**Description:** As a collaborator, I want real-time co-editing in the Lexical editor
so multi-user editing still works.

**Acceptance Criteria:**
- [ ] Replace the `Y.Text` content binding with Lexical's Yjs collaboration
      (`@lexical/yjs` `CollaborationPlugin`) bound to the existing collab provider
      (`useCollaboration`/the collab websocket server).
- [ ] Two browsers editing the same document see each other's changes merge (CRDT),
      and presence still shows peers.
- [ ] Editing is disabled until the room is `ready` (reuse the existing gate /
      degraded fallback).
- [ ] Local changes still trigger the debounced DB save (US-003).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser (two separate browser instances per AGENTS.md).

---

### Feature Area B — Ghost Block Editing Essentials

### US-006: Floating selection format toolbar
**Description:** As a user, I want a toolbar to appear when I select text so I can
format inline.

**Acceptance Criteria:**
- [ ] Selecting text shows a floating toolbar near the selection with: bold, italic,
      link, H2, H3, quote, and bullet/numbered list toggles.
- [ ] Each control applies/removes the corresponding Lexical formatting to the
      selection and reflects active state.
- [ ] The toolbar hides when the selection is collapsed or focus leaves the editor.
- [ ] Controls have accessible `aria-label`s and are keyboard-operable.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-007: "+" line button and "/" slash menu to insert blocks
**Description:** As a user, I want a "+" button and a "/" command menu so I can
insert block types quickly (Ghost-style).

**Acceptance Criteria:**
- [ ] An empty paragraph shows a "+" button in the gutter that opens an insert menu;
      typing "/" at the start of an empty block opens the same menu (filterable by
      typed text).
- [ ] The menu lists core blocks: Heading 2, Heading 3, Bullet list, Numbered list,
      Quote, Divider.
- [ ] Selecting an item inserts/transforms the current block accordingly and focus
      returns to the editor.
- [ ] The menu is keyboard-navigable (arrow keys + Enter) and closes on Escape.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-008: Core block nodes render and round-trip
**Description:** As a user, I want headings, lists, quotes, and dividers to render
correctly and persist.

**Acceptance Criteria:**
- [ ] Heading (H2/H3), bullet list, numbered list, blockquote, and divider nodes
      render with the app's styling (+ `dark:` variants) and save/restore via
      `contentJson` after reload.
- [ ] The plain-text projection (US-003) includes block text in document order.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

---

### Feature Area C — Napkin Visual Card

### US-009: Define a Lexical "Visual" decorator node
**Description:** As a developer, I want a custom Lexical node that holds a visual so
visuals are first-class blocks.

**Acceptance Criteria:**
- [ ] Create a `VisualNode` (Lexical `DecoratorNode`) that stores a `Visual` JSON
      payload and a stable id, with `exportJSON`/`importJSON` so it serializes into
      `contentJson`.
- [ ] The node renders via the directive-free `VisualRenderer` inside the editor.
- [ ] A `Visual` with invalid data is handled gracefully (`safeParseVisual`) without
      crashing the editor.
- [ ] Typecheck/lint passes.
- [ ] Tests pass (node serialize/deserialize round-trip).

### US-010: Per-paragraph hover spark to generate a visual
**Description:** As a user, I want a spark control beside a paragraph to generate a
visual for that paragraph.

**Acceptance Criteria:**
- [ ] Hovering/focusing a text block reveals a gutter "spark" button
      (`aria-label="Generate visual for this block"`), shown one block at a time,
      with no layout shift, gated on `editable` (canEdit && collab ready).
- [ ] Clicking it sends the block's text to `/api/generate` and shows candidate
      variations inline near the block (reuse the existing generation flow).
- [ ] Selecting a candidate inserts a `VisualNode` (US-009) directly **after** the
      source block.
- [ ] Errors are non-blocking and retryable (`role="alert"` + retry).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser (mock-Azure per AGENTS.md).

### US-011: Persist and reload visual cards
**Description:** As a user, I want generated visuals to persist so they reappear on
reload.

**Acceptance Criteria:**
- [ ] `VisualNode`s are serialized into `contentJson` and re-render on reload in
      document order.
- [ ] The relationship between a visual and its source block is preserved through
      save/load (the node lives in the document order, after its source block).
- [ ] **Decision (resolved):** `contentJson` is the editor's source of truth, AND on
      save each `VisualNode`'s payload is **mirrored to a `Visual` row** keyed by a
      node-stable anchor id (reusing `attachVisual`) so the existing share/embed,
      dashboard-thumbnail, and version-history features keep working unchanged.
- [ ] Typecheck/lint passes.
- [ ] Tests pass.
- [ ] Verify in browser.

### US-012: Contextual editing for a selected visual card
**Description:** As a user, I want to edit a visual's elements/style/type without a
fixed side panel.

**Acceptance Criteria:**
- [ ] Selecting a `VisualNode` reveals contextual controls (reuse `VisualEditor`,
      `StylePanel`, type-switch pills, variation browsing, and `ExportMenu`) anchored
      to the card (floating toolbar/popover), not a permanent right panel.
- [ ] Edits update the node's payload and persist via the Lexical save path
      (US-003).
- [ ] Clicking away dismisses the controls (ref-containment, never
      `stopPropagation`).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-013: Replace or remove a visual card
**Description:** As a user, I want to swap or delete a visual so I can iterate.

**Acceptance Criteria:**
- [ ] A selected `VisualNode` offers "Replace" (reopens generation for the source
      block) and "Remove" (`aria-label="Remove visual"`, deletes the node).
- [ ] Remove deletes only that node; other content/visuals are untouched and the
      change persists after reload.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

---

### Feature Area D — Read-Only Views

### US-014: Render Lexical read-only on share and embed pages
**Description:** As a viewer, I want shared/embedded documents to render the new
format read-only with inline visuals.

**Acceptance Criteria:**
- [ ] `/share/[shareId]` and `/embed/[shareId]` render the document from
      `contentJson` (Lexical read-only render) with blocks and inline `VisualNode`s
      via the directive-free `VisualRenderer`.
- [ ] Documents that only have legacy `content` (not yet migrated) still render
      (convert-on-read using the US-004 converter, or render the plain-text
      projection).
- [ ] Read-only viewers see no editing affordances (no spark, no "+"/slash, no
      contextual controls).
- [ ] No horizontal overflow at 375/768/1280.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

---

### Feature Area E — Animations & Micro-interactions

### US-015: Add motion library and block/card transitions
**Description:** As a user, I want blocks and visual cards to animate in/out so the
editor feels polished.

**Acceptance Criteria:**
- [ ] Add a lightweight animation library (e.g. `framer-motion`) and use it for
      block/card mount and unmount (fade/scale or height reveal) and for the
      slash-menu/toolbar reveals.
- [ ] Animations are transform/opacity-based (no jarring layout shift) and respect
      `prefers-reduced-motion` (no motion when reduced).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-016: Generation "thinking" state and control micro-interactions
**Description:** As a user, I want a thinking indicator while generating and tactile
button feedback.

**Acceptance Criteria:**
- [ ] While `/api/generate` is in flight, the spark/inline area shows an animated
      "thinking" indicator.
- [ ] Spark, toolbar, slash-menu, and contextual-control buttons have consistent
      hover/active/focus-visible states using the theme palette + `dark:` variants.
- [ ] All motion respects `prefers-reduced-motion`.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

---

### Feature Area F — Editor Parity & Cleanup

### US-017: Preserve comments, presence, sharing, and shortcuts in the new editor
**Description:** As a user, I want all existing collaboration features to keep
working.

**Acceptance Criteria:**
- [ ] Comments (`CommentsPanel`), sharing/embed (`ShareButton`), presence
      (`Presence`), save status, and existing keyboard shortcuts all work in the
      Lexical editor.
- [ ] Comment anchoring still functions: text-anchored comments keep storing the
      **selected text string** (the existing `anchorText` field) and visual-anchored
      comments keep the **`anchorNodeId`** — **not** Lexical node keys/offsets (which
      aren't stable across sessions), so anchoring survives the format change.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-018: Swap in the Lexical editor and retire the textarea/tab editor
**Description:** As a developer, I want the new editor to fully replace the old one
so the codebase is consistent.

**Acceptance Criteria:**
- [ ] The editor page renders only the Lexical editor; the Write/Preview textarea +
      right-`VisualPanel` + `block-visual-generator` layout is removed (dead code
      deleted).
- [ ] No dead imports/exports remain; lint is clean.
- [ ] All prior editor features have an equivalent in the new editor (autosave,
      collab, comments, share/embed, visual generate/edit/style/export, shortcuts).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

---

### Feature Area G — Ghost Theme & Typography (Site-Wide)

> Independent of the editor work; can be implemented first or in parallel. US-019
> (design tokens) is foundational for the rest of this area.

### US-019: Define Ghost theme tokens (fonts + colors) in Tailwind v4
**Description:** As a developer, I want Ghost's fonts and color tokens defined as
theme variables so the whole app can use them consistently.

**Acceptance Criteria:**
- [ ] In `src/app/globals.css` (`@theme inline`), define a Ghost font system:
      `--font-sans` (system stack incl. Inter), `--font-serif` (`Georgia, Times,
      serif`), `--font-mono` (`Menlo, Courier, monospace`).
- [ ] Define Ghost color tokens for light and dark mode: primary text
      (`#15171A` light), secondary/midgrey text, borders/wash, page background, and
      accent green/yellow/red, plus a single configurable **accent color**
      (`--ghost-accent-color`) defaulting to the app's existing **indigo** brand (so
      it stays cohesive with the default Indigo visual theme).
- [ ] Self-host **Inter** via `next/font` and wire it to `--font-sans`; `--font-serif`
      uses the system **Georgia** stack and `--font-mono` the system Menlo/Courier
      stack (so only one font is downloaded), matching the existing `next/font`
      pattern.
- [ ] Existing pages still build and render (tokens added, not yet fully applied).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-020: Apply Ghost typography to long-form content (editor + read views)
**Description:** As a reader/writer, I want document content to use Ghost's reading
typography so it looks like a Ghost post.

**Acceptance Criteria:**
- [ ] Document content (the Lexical editor surface and the read-only share/embed
      render) uses a centered **~720px reading measure**, Ghost heading scale and
      spacing, comfortable body line-height, and accent-bar blockquotes.
- [ ] Headings use the **sans** stack (Inter); long-form document **body uses the
      serif** stack (Georgia) for a classic Ghost editorial reading feel; code uses
      the mono stack. (App chrome stays sans — only document content is serif.)
- [ ] Light and dark mode both render correctly using the US-019 tokens.
- [ ] No horizontal overflow at 375/768/1280.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-021: Apply Ghost theme to app chrome (header, dashboard, settings, auth)
**Description:** As a user, I want the whole app UI to match the Ghost theme so the
experience is consistent.

**Acceptance Criteria:**
- [ ] The site header/nav, dashboard, document cards, settings, and auth
      (login/signup) pages use the Ghost font system and color tokens (US-019),
      replacing ad-hoc zinc styling where the Ghost look applies.
- [ ] Buttons, inputs, and cards adopt Ghost-style treatment (e.g. pill/rounded
      buttons, Ghost borders/wash, accent color for primary actions).
- [ ] Light and dark mode are consistent across these surfaces.
- [ ] No horizontal overflow at 375/768/1280.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-022: Theme the marketing/landing page in Ghost style
**Description:** As a visitor, I want the landing page to look like a Ghost site so
the brand is cohesive.

**Acceptance Criteria:**
- [ ] The marketing home (`src/app/page.tsx`) hero, sections, CTA, and footer use the
      Ghost font system, color tokens, and typography scale.
- [ ] The page remains a server component with no client/session widgets and renders
      correctly in light/dark mode.
- [ ] No horizontal overflow at 375/768/1280.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

---

### Feature Area H — Reading Time, Excerpt & Word Count

> Independent of the editor; pure helpers + presentation.

### US-023: Document text-stats helper (reading time, word count, excerpt)
**Description:** As a developer, I need pure helpers to derive reading time, word
count, and an excerpt from a document so multiple views can show them consistently.

**Acceptance Criteria:**
- [ ] Create `src/lib/document-stats.ts` (framework-free) exporting
      `wordCount(text)`, `readingTimeMinutes(text)` (≈200 wpm, min 1), and
      `excerpt(text, maxChars?)` that strips Markdown syntax and trims on a word
      boundary with an ellipsis.
- [ ] Add `src/lib/document-stats.test.ts` (node --test + tsx) covering empty input,
      short text (1 min), long text rounding, and excerpt truncation.
- [ ] The module is framework-free (no React import).
- [ ] Typecheck/lint passes.
- [ ] Tests pass.

### US-024: Show reading time and word count in the editor
**Description:** As a writer, I want to see reading time and word count so I know how
long my document is.

**Acceptance Criteria:**
- [ ] The editor displays "<n> min read" and a word count derived from the current
      content (via US-023 helpers), updating as the content changes.
- [ ] It does not cause horizontal overflow at 375/768/1280.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

---

### Feature Area I — Dashboard as a Ghost-Style Post Feed

### US-025: Render the first visual as the dashboard card thumbnail
**Description:** As a user, I want each document card to show its first visual so the
dashboard is visual like Ghost's post feed.

**Acceptance Criteria:**
- [ ] The dashboard query loads each document's first visual
      (`visuals: { orderBy: [{ orderIndex }, { createdAt }], take: 1 }`,
      `safeParseVisual`'d).
- [ ] When a document has a visual, the card thumbnail renders it via the
      directive-free `VisualRenderer`; otherwise it falls back to the existing
      generic file-icon thumbnail.
- [ ] No layout shift or overflow at 375/768/1280; grid stays
      `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-026: Add excerpt and reading time to dashboard cards
**Description:** As a user, I want a short excerpt and reading time on each card so I
can scan my documents.

**Acceptance Criteria:**
- [ ] Each card shows a 1–2 line excerpt (US-023 `excerpt`) and "<n> min read"
      beneath the title/edited date.
- [ ] Empty documents show no excerpt (or a muted "No content yet").
- [ ] No overflow at 375/768/1280.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

---

### Feature Area J — Pretty Permalinks (Slugs)

### US-027: Add a slug column to Document with migrations
**Description:** As a developer, I need a slug field so documents can have readable
share URLs.

**Acceptance Criteria:**
- [ ] Add a nullable, unique `slug String? @unique` column to `Document` in
      `prisma/schema.prisma`; rerun `npm run db:schema:sqlite`.
- [ ] Create migrations in **both** provider histories (`DB_PROVIDER=postgres` and
      `DB_PROVIDER=sqlite`) and regenerate the client.
- [ ] Add a pure `slugify(title)` helper in `src/lib/slug.ts` with a unit test
      (lowercase, hyphenate, strip punctuation, collapse dashes, max length).
- [ ] Typecheck/lint passes.
- [ ] Tests pass.

### US-028: Generate a slug when sharing and resolve slug-based share URLs
**Description:** As a user, I want my share link to use a readable slug so it's
memorable and shareable.

**Acceptance Criteria:**
- [ ] When sharing is enabled, the document gets a `slug` from its title (via
      `slugify`, US-027); the displayed share URL is `/share/<slug>-<shareId>` (the
      full existing 12-char `shareId` is appended unchanged).
- [ ] `/share/[shareId]` resolves a request whose param matches **either** the
      legacy bare `shareId` **or** the `<slug>-<shareId>` form (parse the `shareId`
      as the segment after the last `-` and look it up); a non-shared/unknown id
      still `notFound()`s. Because the URL carries the full unique `shareId`, the
      `slug` is purely decorative and need not be unique.
- [ ] The embed URL (`/embed/...`) and the copy-link/embed snippets use the same
      resolved form.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

---

### Feature Area K — SEO & Social Sharing

### US-029: Add SEO + Open Graph/Twitter meta to the share page
**Description:** As a sharer, I want my link to unfurl with a title, description, and
image so it looks professional on social/chat.

**Acceptance Criteria:**
- [ ] `/share/[shareId]` exports Next.js `generateMetadata` producing: page title
      (document title + site name), description (US-023 excerpt), canonical URL, and
      Open Graph + Twitter Card tags (`og:title`/`og:description`/`og:image`/
      `og:type`/`twitter:card=summary_large_image`).
- [ ] A non-shared/unknown document yields safe default/no-index metadata (no leak).
- [ ] Verified via page `<head>` containing the expected meta tags.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-030: Auto-generate an Open Graph preview image for shared documents
**Description:** As a sharer, I want an auto-generated preview image so my unfurled
link has a visual.

**Acceptance Criteria:**
- [ ] Add an OG image route (Next.js `ImageResponse`, e.g.
      `src/app/share/[shareId]/opengraph-image.tsx`) that renders a 1200×630 card
      with the document title, an excerpt, and site branding.
- [ ] The image is share-gated (only for `isShared` documents); unknown/non-shared
      returns a safe default or 404.
- [ ] `og:image`/`twitter:image` (US-029) point at this route.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser (open the image URL and the share page head).

---

### Feature Area L — Visual Lightbox

### US-031: Click-to-zoom lightbox for visuals on read-only views
**Description:** As a viewer, I want to zoom a visual full-screen so I can read
detail-dense diagrams.

**Acceptance Criteria:**
- [ ] On `/share/[shareId]`, clicking a visual opens a full-screen overlay showing
      the enlarged `VisualRenderer` output. (Share only — **not** `/embed`, which
      stays minimal inside its iframe.)
- [ ] The overlay closes on backdrop click, an explicit close button, and Escape;
      it traps focus and restores it on close (accessible).
- [ ] The lightbox component uses the ref-containment dismissal pattern (never
      `stopPropagation`) and respects `prefers-reduced-motion`.
- [ ] No horizontal overflow at 375/768/1280.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

---

### Feature Area M — Tags

### US-032: Add a Tag model and Document↔Tag relation with migrations
**Description:** As a developer, I need tags stored so documents can be organized.

**Acceptance Criteria:**
- [ ] Add a `Tag` model (`id`, `name`, `slug`, scoped to the owner/user) and a
      many-to-many relation to `Document` in `prisma/schema.prisma`; rerun
      `npm run db:schema:sqlite`.
- [ ] Create migrations in **both** provider histories and regenerate the client.
- [ ] Tag names are unique per owner; `slug` derives from `slugify` (US-027).
- [ ] Typecheck/lint passes.
- [ ] Tests pass.

### US-033: Add and remove tags on a document
**Description:** As a user, I want to tag a document so I can group related work.

**Acceptance Criteria:**
- [ ] The editor (or document card menu) has a tag control to add an existing tag,
      create a new tag, and remove a tag, via access-scoped server actions
      (`addTag`/`removeTag`).
- [ ] Tags show as chips on the document; changes persist after reload.
- [ ] Tag input is keyboard-accessible with `aria-label`s.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

### US-034: Filter the dashboard by tag
**Description:** As a user, I want to filter my documents by tag so I can focus on a
topic.

**Acceptance Criteria:**
- [ ] The dashboard shows the user's tags as a filter control; selecting one shows
      only documents with that tag; the selection persists in the URL search params.
- [ ] An empty-results state shows when no documents match the tag.
- [ ] Clearing the filter returns to all documents.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser.

## Functional Requirements

### Editor & theme

- FR-1: The editor MUST be built on **Lexical** (`lexical` + `@lexical/react`) as a
  single block-based writing canvas.
- FR-2: The system MUST store document content as **Lexical editor state JSON** in a
  new `Document.contentJson` column (migrations in **both** provider histories;
  rerun `npm run db:schema:sqlite`), keeping `content` as a plain-text projection for
  AI text, search, and legacy fallback.
- FR-3: The system MUST **convert existing Markdown** documents to Lexical on first
  open via a pure, unit-tested converter, with no content loss.
- FR-4: The editor MUST provide a **"+" line button** and a **"/" slash menu** to
  insert core blocks: H2, H3, bullet list, numbered list, quote, divider.
- FR-5: The editor MUST provide a **floating selection toolbar** with bold, italic,
  link, H2, H3, quote, and list controls.
- FR-6: Napkin visuals MUST be **first-class Lexical `VisualNode` decorator nodes**
  rendered inline via the directive-free `VisualRenderer`, **created via a
  per-paragraph hover spark** (not the slash menu).
- FR-7: The spark MUST generate via the existing **`/api/generate`** using the source
  block's text, present candidate variations, and insert the chosen visual as a node
  after the source block; visuals MUST be replaceable and removable.
- FR-8: Selecting a `VisualNode` MUST reveal **contextual editing** (reuse
  `VisualEditor`, `StylePanel`, type-switch, variations, `ExportMenu`); edits persist
  via the Lexical save path.
- FR-9: **Real-time collaboration** MUST use Lexical's Yjs binding (`@lexical/yjs`) on
  the existing collab provider; presence and the ready/degraded gate are preserved;
  local edits still debounce-save to the DB.
- FR-10: **Share and embed** pages MUST render the Lexical content read-only with
  inline visuals and no editing affordances; legacy-only documents still render.
- FR-11: The UI MUST include **animations** (a lightweight library is allowed) for
  block/card mount-unmount, toolbar/slash-menu reveals, and a generation "thinking"
  state, all honoring `prefers-reduced-motion` and avoiding layout shift.
- FR-12: Comments, presence, save status, and existing keyboard shortcuts MUST
  continue to work; the old textarea/tab editor MUST be removed once parity is
  reached.
- FR-13: The **whole website** MUST adopt a **Ghost theme**: Ghost's font system
  (`--font-sans` system/Inter stack, `--font-serif` `Georgia, Times, serif`,
  `--font-mono` `Menlo, Courier, monospace`) and Ghost color tokens (primary text
  `#15171A`, secondary/border/wash, accent green/yellow/red + a configurable accent),
  defined in Tailwind v4 `@theme` and applied to marketing, auth, dashboard,
  settings, editor, and share/embed in both light and dark mode.
- FR-14: Document **content typography** MUST follow Ghost: ~720px reading measure,
  Ghost heading scale/spacing, comfortable body line-height, accent-bar blockquotes,
  and the mono stack for code — applied consistently in the editor and read-only
  views.
- FR-15: Any web font MUST be loaded via `next/font` (self-hosted, non-blocking) — no
  blocking external font request.

### Sharing & organization

- FR-16: Provide framework-free, unit-tested helpers for **word count, reading time,
  and excerpt** (`src/lib/document-stats.ts`) and **slugify** (`src/lib/slug.ts`).
- FR-17: Show **reading time + word count** in the editor and **excerpt + reading
  time** on dashboard cards.
- FR-18: Render each dashboard card's **first visual as its thumbnail** (via
  `VisualRenderer`), falling back to the generic icon when there is no visual.
- FR-19: Add a unique **`Document.slug`** column (dual-provider migrations) and serve
  **slug-based share URLs** (`/share/<slug>-<shareId>`, full unique `shareId`
  appended) while still resolving legacy bare-`shareId` links.
- FR-20: Add **SEO + Open Graph/Twitter** metadata to the share page via
  `generateMetadata`, including an **auto-generated 1200×630 OG image** route; both
  are share-gated and leak nothing for non-shared documents.
- FR-21: Add a **visual lightbox** (click-to-zoom, Escape/backdrop/close, focus trap,
  reduced-motion aware) on read-only views.
- FR-22: Add a **`Tag`** model + Document relation (dual-provider migrations),
  access-scoped add/remove tag actions, tag chips on documents, and a **dashboard tag
  filter** persisted in the URL.

### Cross-cutting

- FR-23: Every story keeps lint, typecheck, build, and `format:check` green and
  honors the SQLite/Postgres dual-history + generated-`schema.sqlite.prisma` rules in
  `AGENTS.md`.

## Non-Goals (Out of Scope)

- **No reuse of Ghost's actual Koenig packages** (`@tryghost/koenig-lexical`) — we
  build our own Lexical config (their packages assume Ghost's renderer/server).
- **No full Koenig card parity** — only the core block set (FR-4) plus the Visual
  card. Image/bookmark/embed/gallery/code-with-syntax/HTML/email cards are out.
- **No slash-menu "Visual" command** — visuals are created via the hover spark only
  (the slash menu inserts standard blocks).
- **No drag-to-reorder blocks** in v1 (can be a follow-up).
- **No Markdown export** of the new format in v1 (the plain-text projection is for
  AI/search/fallback, not full round-trip Markdown).
- **No theme switcher / multiple selectable themes** — a single Ghost-style theme
  (with light/dark via `prefers-color-scheme`); no per-user font/accent picker in v1.
- **No restyling of the visual renderer's internal SVG output** — the Ghost theme,
  thumbnail, and lightbox reuse existing SVG output; the diagram drawing is unchanged.
- **No memberships, paid subscriptions, Stripe, or paywalled content** (Ghost's
  membership platform is out of scope).
- **No email newsletters / delivery / subscriber management.**
- **No public author profiles, RSS feeds, public site index, or public Content API**
  in this PRD (possible follow-ups).
- **No code injection, custom themes marketplace, or Portal widget.**
- **No tag hierarchy / internal-vs-public tag distinction** — flat, owner-scoped tags
  only.
- **No new visual types or AI modes** beyond what the existing spark flow uses.
- **No changes to auth, workspaces, or settings** beyond rendering the editor/theme
  and saving content.
- **No real Azure key requirement** for verification — use the documented local
  mock-Azure setup.
- **No mobile-native app** — responsive web only (usable at 375px).

## Design Considerations

- **Ghost feel (editor):** clean centered canvas, generous typography, gutter "+"
  button, "/" slash menu, and a floating selection toolbar — minimal persistent
  chrome.
- **Ghost feel (sharing/org):** a post-feed dashboard with a real preview image,
  title, excerpt, and a meta line ("Edited … · 3 min read"); tag chips where
  relevant.
- **Reuse the visual subsystem:** `VisualRenderer` (read-only, directive-free) inside
  the `VisualNode`, the dashboard thumbnail, and the lightbox; `VisualEditor`/
  `StylePanel`/`ExportMenu` for contextual editing; the candidate-generation flow
  from `block-visual-generator.tsx`.
- **Theme tokens (US-019):** Ghost font system — **sans (Inter) for app chrome and
  headings**, **serif (Georgia) for long-form document body**, mono for code — Ghost
  color tokens (`#15171A` text, **indigo** accent, borders/wash), pill/rounded
  controls, ~720px reading measure, accent-bar blockquotes — replacing the current
  zinc palette where the Ghost look applies; keep `dark:` variants and
  `prefers-color-scheme` support.
- **OG image** uses Next.js `ImageResponse` (Satori) — text + branding only (not the
  live SVG, which Satori can't fully render); keep it simple and on-brand.
- **Slugs** mirror Ghost: lowercase, hyphenated, punctuation stripped; the full
  12-char `shareId` suffix guarantees uniqueness and preserves share-gating, so the
  `slug` itself is decorative.
- **Click-outside / lightbox dismissal** MUST use the **ref-containment** pattern
  (never `stopPropagation`), per `AGENTS.md`.
- **Accessibility:** `aria-label`s on all floating affordances, tag inputs, and the
  lightbox; keyboard navigation for the slash menu, toolbar, and lightbox; focus trap
  + restore in the lightbox; visible focus states; `prefers-reduced-motion` honored.

## Technical Considerations

- **Big change, introduce safely:** build the Lexical editor behind a flag/separate
  component first (US-001) and only swap it in at US-018 after parity, so `main`
  stays usable throughout. Feature Areas G–M don't depend on the editor swap.
- **Storage:** Lexical editor state JSON in `Document.contentJson` (Prisma `Json`,
  validates on both SQLite and Postgres). Keep a plain-text projection in `content`.
  No Prisma enums anywhere (string columns + app-level unions if needed).
- **Collaboration:** moving from `Y.Text` (current `useYText` binding) to Lexical's
  Yjs `CollaborationPlugin` is the riskiest piece — it changes how the shared doc is
  represented. Validate cross-browser sync with **two separate browser instances**
  (the BroadcastChannel caveat in `AGENTS.md`). Keep the 2.5s degraded fallback.
- **AI block text:** derive the source block's text from the Lexical node (selection
  or node traversal); stays within the existing 10k-char `/api/generate` cap.
- **Theme tokens are foundational + low-risk:** US-019 only adds Tailwind v4 `@theme`
  variables (fonts/colors) and a `next/font` load. Reference Ghost's Casper tokens
  (`--font-sans`, `--font-serif: Georgia, Times, serif`,
  `--font-mono: Menlo, Courier, monospace`, `--color-darkgrey: #15171A`, accent
  green/yellow/red). The app already honors `prefers-color-scheme`, so theme colors
  must define both modes.
- **Slug resolution:** `/share/[shareId]` parses the trailing `shareId` (the segment
  after the last `-`) from `<slug>-<shareId>` and looks up by that full `shareId`,
  preserving the `isShared` gate and `notFound()` behavior; legacy bare-`shareId`
  links keep working. The `shareId` is a 12-char unambiguous nanoid, so the `slug`
  needs no uniqueness of its own.
- **OG metadata:** use `generateMetadata` (server) reading the same share-gated query;
  the OG image route must also be share-gated. Absolute URLs require a base URL (reuse
  `NEXT_PUBLIC_APP_URL`).
- **Dashboard preview cost:** load one visual per card (`take: 1`) in the same query
  (avoid N+1); `safeParseVisual` guards garbled rows.
- **Tags:** owner-scoped uniqueness; actions use `requireUser()` and access-scope the
  document; the dashboard filter is client-side over the loaded list or a scoped query
  (document the choice).
- **React 19 lint rules** (per `AGENTS.md`): no `setState` in effect bodies; assign
  "latest callback" refs in effects, not during render; subscribe to Yjs/Lexical via
  effect-registered listeners.
- **Migrations:** after editing `prisma/schema.prisma`, rerun
  `npm run db:schema:sqlite` and create migrations under **both** `DB_PROVIDER`
  values (sqlite last, then `npm run db:generate`).
- **Testing:** pure logic (Markdown→Lexical converter, `VisualNode` serialize/
  deserialize, plain-text projection, document stats, slugify) gets Node-test-runner +
  tsx unit tests next to the module; UI/metadata stories use the local mock-Azure
  server where generation is involved and verify in browser via `dev-browser
  --headless` against the production build, asserting `<head>` meta and no horizontal
  overflow at 375/768/1280.
- **Bundle size:** Lexical + plugins + a motion library increase the client bundle;
  keep imports scoped (per-plugin) and lazy-load contextual visual-editing controls
  where practical.

## Success Metrics

- A user can write in a Ghost-style block canvas: insert blocks via "+"/"/", format
  via the floating toolbar, and the document persists as Lexical JSON across reloads.
- A user can generate an inline visual for a paragraph in **≤ 2 clicks** from the
  hover spark, and edit/replace/remove it from contextual controls.
- Existing Markdown documents open in the new editor with **no content loss**.
- Real-time co-editing works across two browsers; presence, comments, sharing, and
  embed all pass browser QA.
- The **entire site** (marketing, auth, dashboard, settings, editor, share/embed)
  renders in the Ghost theme — Ghost fonts and color tokens — consistently in light
  and dark mode, and document content reads like a Ghost post (~720px measure, Ghost
  heading/body typography, accent-bar blockquotes).
- A shared link **unfurls** with title, description, and an auto-generated image on
  social/chat previews; share URLs are **readable slugs** while old links keep
  working.
- The dashboard shows **real visual thumbnails + excerpts + reading time**, reading
  like a Ghost post feed; users can **tag** documents and **filter** by tag.
- Viewers can **zoom** a visual on read-only views.
- No horizontal overflow at 375/768/1280; animations honor `prefers-reduced-motion`;
  lint/typecheck/build/format:check green.

## Resolved Decisions

> These were the PRD's open questions; each is now decided with rationale. The
> acceptance criteria above already reflect them.

1. **Visual persistence model → store in BOTH.** `contentJson` is the editor's source
   of truth (drives render + document order), and on save each `VisualNode`'s payload
   is **mirrored to a `Visual` row** (reusing `attachVisual`, keyed by a node-stable
   anchor id). *Rationale:* many shipped features already key on `Visual` rows — the
   dashboard thumbnail (US-025), share/embed read views, and the product-maturity
   **version history** + `attachVisual`/`detachVisual`. Storing only in `contentJson`
   would force rewrites of all of them; mirroring keeps them working with one extra
   write per save.

2. **Collaboration cutover → full, clean replacement of `Y.Text` with `@lexical/yjs`**
   (no dual-format transition). *Rationale:* the collab server holds **no durable
   state** (in-memory `Y.Doc` per room; the DB is the durable store), so there are no
   live rooms to migrate. Running two content CRDTs in parallel is far more complex
   and bug-prone. A freshly opened room seeds from `contentJson` (or converted
   Markdown).

3. **Legacy migration timing → lazy convert on first open.** *Rationale:* no risky
   one-shot batch job; load is spread out and only touches documents people actually
   open; the first save persists `contentJson`. A bare-text fallback covers anything
   not yet converted.

4. **Comment text anchoring → keep storing the selected text string** (existing
   `anchorText`) for text anchors and `anchorNodeId` for visual anchors; **do not** use
   Lexical node keys or character offsets. *Rationale:* the current model already
   stores `anchorText`/`anchorNodeId` (verified in `comments-actions.ts`), which is
   format-agnostic and survives the Markdown→Lexical change; Lexical node keys are not
   stable across sessions.

5. **Scope creep → drag-to-reorder and extra cards (image/embed/code/callout) are
   explicitly deferred** to a follow-up PRD (already in Non-Goals). *Rationale:* keep
   this roadmap shippable; the core block set + Visual card is enough for Ghost feel.

6. **Plain-text projection → dropping bold/italic/link in `content` is acceptable.**
   Marks live only in `contentJson`. *Rationale:* the `content` projection exists for
   AI block text, search, and read-only fallback, none of which need inline
   formatting.

7. **Ghost body font → serif body (Georgia) for long-form document content, sans
   (Inter) for headings and all app chrome**, mono for code. *Rationale:* the
   serif-body/sans-heading combo gives the distinctive Ghost editorial reading feel
   while keeping the product UI clean and modern; it's one token flip to change later.

8. **Accent color → indigo** (the app's existing default visual theme), exposed as a
   single configurable `--ghost-accent-color`. *Rationale:* keeps brand continuity with
   the default Indigo visual theme and avoids a jarring palette shift.

9. **Web font → self-host Inter via `next/font`** for `--font-sans`; serif (Georgia)
   and mono come from system stacks (no download). *Rationale:* consistent
   cross-platform UI rendering with only one downloaded font; matches the repo's
   existing `next/font` pattern (currently Geist).

10. **OG image → title + excerpt + branding only** (static, on-brand), no live visual.
    *Rationale:* Satori (Next.js `ImageResponse`) can't reliably render the diagram
    SVG; a clean text card is fast and predictable.

11. **Slug uniqueness → not required.** The share URL is `/share/<slug>-<shareId>` and
    lookup uses the **full 12-char unique `shareId`**; the `slug` is decorative.
    *Rationale:* `shareId` is already a unique unambiguous nanoid, so no extra
    uniqueness machinery is needed and legacy bare-`shareId` links keep working.

12. **Tag scope → flat, owner-scoped tags** (no workspace sharing, no hierarchy).
    *Rationale:* simplest useful model; matches Non-Goals. Workspace-shared tags can be
    a follow-up.

13. **Lightbox → `/share` only, not `/embed`.** *Rationale:* embeds are minimal and
    already constrained inside a host iframe, where a full-screen overlay is awkward
    and clipped.

14. **Reading time → 200 wpm constant, text only** (visuals don't add time).
    *Rationale:* the standard, predictable convention; matches the
    `readingTimeMinutes` helper (min 1).
