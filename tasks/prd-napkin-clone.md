# PRD: Napkin Clone — Text-to-Visuals Platform

## Introduction/Overview

Build a web application that turns plain text into editable visuals (diagrams, flowcharts, mind maps, infographics, and data charts). A user pastes or writes text, clicks a "generate" action, and the system uses an LLM to interpret the text and propose multiple relevant visuals. The user picks one, customizes it (colors, text, layout, individual elements), then exports it (PNG, SVG, PDF, PPTX) or shares a link. The product supports user accounts, cloud-saved documents, and team collaboration with real-time co-editing and commenting.

This is a full-product clone of [napkin.ai](https://www.napkin.ai/). The problem it solves: non-designers spend too long building professional diagrams in tools like PowerPoint. This app makes high-quality visuals appear in seconds directly from text.

## Goals

- Convert arbitrary text into multiple AI-generated, editable visuals.
- Support five visual families: flowcharts/process diagrams, mind maps, list/bullet infographics ("scenes"), data charts (bar/pie/line), and simple concept diagrams.
- Provide a canvas editor where every element (color, text, shape, position) is editable.
- Let users sign in, save documents to the cloud, and resume editing later.
- Enable team collaboration: shared workspaces, real-time co-editing, and inline comments.
- Export visuals as PNG, SVG, PDF, and PPTX, and share read-only links.
- Keep the editing experience fast and responsive on desktop browsers.

## User Stories

### US-001: Initialize project scaffold
**Description:** As a developer, I need a Next.js + TypeScript + Tailwind project so all later work has a consistent foundation.

**Acceptance Criteria:**
- [ ] Next.js (App Router) project created with TypeScript and Tailwind CSS configured
- [ ] ESLint + Prettier configured with an npm script for each
- [ ] `npm run dev`, `npm run build`, `npm run lint`, `npm run typecheck` all succeed
- [ ] Base layout renders a placeholder home page
- [ ] Typecheck passes
- [ ] Verify in browser

### US-002: Set up database and ORM
**Description:** As a developer, I need a database schema and ORM so app data persists.

**Acceptance Criteria:**
- [ ] Prisma (or chosen ORM) configured with a Postgres datasource via `DATABASE_URL`
- [ ] Initial schema models defined: `User`, `Document`, `Visual`, `Workspace`, `WorkspaceMember`, `Comment`
- [ ] Initial migration generates and applies successfully against a local database
- [ ] A seed script inserts one demo user and one demo document
- [ ] Typecheck passes

### US-003: Email/password authentication
**Description:** As a user, I want to sign up and log in with email and password so my work is tied to my account.

**Acceptance Criteria:**
- [ ] Auth library (e.g. Auth.js/NextAuth) configured with a credentials provider
- [ ] Sign-up page creates a user with a securely hashed password (bcrypt/argon2)
- [ ] Login page authenticates and creates a session (HTTP-only cookie)
- [ ] Invalid credentials show an inline error and never reveal which field was wrong
- [ ] Authenticated session exposes the current user on server and client
- [ ] Typecheck passes
- [ ] Verify in browser

### US-004: Google SSO login
**Description:** As a user, I want to sign in with Google so I don't need a separate password.

**Acceptance Criteria:**
- [ ] Google OAuth provider configured via env vars (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
- [ ] "Continue with Google" button on the login/signup pages starts the OAuth flow
- [ ] Successful Google login creates or links a `User` record and starts a session
- [ ] Login state persists across page reloads
- [ ] Typecheck passes
- [ ] Verify in browser

### US-005: Protected routes and auth guards
**Description:** As a user, I want app pages to require login so my documents stay private.

**Acceptance Criteria:**
- [ ] Unauthenticated visits to `/app/*` redirect to the login page
- [ ] Authenticated users are redirected away from login/signup to the dashboard
- [ ] A reusable server-side helper returns the current user or `null`
- [ ] Logout clears the session and redirects to the marketing home page
- [ ] Typecheck passes
- [ ] Verify in browser

### US-006: Marketing landing page
**Description:** As a visitor, I want a landing page explaining the product so I understand it before signing up.

**Acceptance Criteria:**
- [ ] Hero section with headline, subtext, and a "Get Started Free" CTA linking to signup
- [ ] "How it works" section with the 4 steps (paste text, generate, polish, export)
- [ ] "Use cases" section (presentations, blog, social, docs)
- [ ] Responsive layout down to 768px width
- [ ] Typecheck passes
- [ ] Verify in browser

### US-007: Document dashboard
**Description:** As a user, I want to see my saved documents so I can open or create them.

**Acceptance Criteria:**
- [ ] Dashboard lists the current user's documents (title, last-updated, thumbnail placeholder)
- [ ] "New document" button creates a document and navigates to the editor
- [ ] Each document card links to its editor
- [ ] Empty state shown when the user has no documents
- [ ] Documents are scoped to the logged-in user only (no cross-user leakage)
- [ ] Typecheck passes
- [ ] Verify in browser

### US-008: Document editor — text panel
**Description:** As a user, I want a text editor in the document so I can write/paste the source text.

**Acceptance Criteria:**
- [ ] Editor page has a left text panel and a right canvas/visual area
- [ ] Text content autosaves to the document (debounced) and persists on reload
- [ ] Document title is editable inline and saved
- [ ] Text panel supports basic blocks (paragraphs, bullet lists, headings)
- [ ] Typecheck passes
- [ ] Verify in browser

### US-009: Visual data model and renderer
**Description:** As a developer, I need a structured visual format and a renderer so generated visuals can be displayed and edited consistently.

**Acceptance Criteria:**
- [ ] A typed schema defines a visual as nodes + edges + style (JSON, versioned)
- [ ] An SVG-based renderer draws a visual from the schema
- [ ] Renderer supports the five visual types: flowchart, mind map, list/scene, chart, concept diagram
- [ ] A sample fixture of each type renders correctly
- [ ] Typecheck passes
- [ ] Verify in browser

### US-010: AI generation endpoint
**Description:** As a developer, I need a server endpoint that turns text into visual schemas via an LLM so the UI can request generations.

**Acceptance Criteria:**
- [ ] `POST /api/generate` accepts text + optional desired visual type
- [ ] Endpoint calls Azure OpenAI (endpoint, deployment, and key via env vars; default deployment targets the `gpt-5.5` model) with a structured-output prompt
- [ ] Input text longer than 10,000 characters is rejected with a clear error before any LLM call
- [ ] Response returns 3+ candidate visuals validated against the visual schema
- [ ] Invalid/garbled LLM output is rejected and retried or returns a clear error
- [ ] Anonymous requests are allowed but limited to a small trial quota tracked by a signed anonymous-ID cookie (not IP); authenticated requests are rate-limited per user
- [ ] Typecheck passes

### US-011: Generate visuals from text in the editor
**Description:** As a user, I want to click "generate" and see visual options so I can choose one.

**Acceptance Criteria:**
- [ ] A "Generate" button in the editor sends the current text to `/api/generate`
- [ ] A loading state shows while generation is in progress
- [ ] Returned candidate visuals display as selectable thumbnails
- [ ] Selecting a candidate renders it in the main canvas and attaches it to the document
- [ ] Generation errors show a non-blocking, retryable message
- [ ] Typecheck passes
- [ ] Verify in browser

### US-012: Switch visual type
**Description:** As a user, I want to regenerate the selected idea as a different visual type so I can find the best fit.

**Acceptance Criteria:**
- [ ] A visual-type switcher offers flowchart, mind map, list/scene, chart, concept diagram
- [ ] Choosing a type regenerates the current selection in that style
- [ ] The canvas updates to the new visual while preserving the source text
- [ ] Typecheck passes
- [ ] Verify in browser

### US-013: Edit visual text and elements
**Description:** As a user, I want to edit the text and shapes inside a visual so I can refine it.

**Acceptance Criteria:**
- [ ] Clicking a node/label makes its text editable inline; changes persist to the document
- [ ] Nodes can be moved by drag-and-drop and the new position saves
- [ ] A node can be deleted, and connected edges update accordingly
- [ ] Edits are reflected immediately in the rendered SVG
- [ ] Typecheck passes
- [ ] Verify in browser

### US-014: Color and style customization
**Description:** As a user, I want to change colors and styles so the visual matches my brand.

**Acceptance Criteria:**
- [ ] A style panel lets the user pick a color theme/palette applied to the visual
- [ ] Individual element fill/stroke/text color can be overridden
- [ ] Font size/weight options available for labels
- [ ] Style changes persist to the document and survive reload
- [ ] Typecheck passes
- [ ] Verify in browser

### US-015: Export as PNG and SVG
**Description:** As a user, I want to export a visual as PNG or SVG so I can use it elsewhere.

**Acceptance Criteria:**
- [ ] "Export" menu offers PNG and SVG
- [ ] SVG export downloads the exact rendered vector
- [ ] PNG export downloads a rasterized image at a selectable scale (1x/2x)
- [ ] Exported file contains only the visual (no editor chrome)
- [ ] Typecheck passes
- [ ] Verify in browser

### US-016: Export as PDF and PPTX
**Description:** As a user, I want to export as PDF or PPTX so I can drop visuals into documents and slides.

**Acceptance Criteria:**
- [ ] "Export" menu offers PDF and PPTX
- [ ] PDF export contains the visual on a correctly sized page
- [ ] PPTX export produces a valid file with the visual as an image/shape on one slide
- [ ] Both files open without corruption in standard viewers
- [ ] Typecheck passes
- [ ] Verify in browser

### US-017: Shareable read-only link
**Description:** As a user, I want to share a link to my document so others can view it without editing.

**Acceptance Criteria:**
- [ ] "Share" produces a unique public URL for the document
- [ ] The public page renders text + visuals read-only with no edit controls
- [ ] Sharing can be toggled off, which makes the link return "not available"
- [ ] Private documents are never viewable without a valid share link
- [ ] Typecheck passes
- [ ] Verify in browser

### US-018: Workspaces and member invitations
**Description:** As a user, I want a shared workspace so my team can access the same documents.

**Acceptance Criteria:**
- [ ] A user can create a workspace and is added as its owner
- [ ] Owner can generate a shareable invite link (with a role) that grants access when an invitee opens it while logged in
- [ ] Invite links can be revoked, after which they no longer grant access
- [ ] Documents can belong to a workspace and are visible to its members
- [ ] Role-based access enforced: viewer vs. editor permissions respected
- [ ] Typecheck passes
- [ ] Verify in browser

### US-019: Real-time collaborative editing
**Description:** As a team member, I want to edit a document at the same time as others so we collaborate live.

**Acceptance Criteria:**
- [ ] Two browsers editing the same document see each other's text/visual changes within ~1s
- [ ] Concurrent edits merge without overwriting each other (CRDT or OT-based sync)
- [ ] Presence indicators show who else is currently in the document
- [ ] Disconnection and reconnection re-sync without data loss
- [ ] Typecheck passes
- [ ] Verify in browser

### US-020: Inline comments
**Description:** As a team member, I want to leave comments on text or visuals so we can give feedback.

**Acceptance Criteria:**
- [ ] A user can select text or a visual element and attach a comment
- [ ] Comments display in a side thread with author and timestamp
- [ ] Comments can be replied to and resolved
- [ ] Comments persist and are visible to all workspace members with access
- [ ] Typecheck passes
- [ ] Verify in browser

## Functional Requirements

- FR-1: The system must let users sign up and log in via email/password and Google SSO.
- FR-2: The system must restrict `/app/*` routes to authenticated users.
- FR-3: The system must let an authenticated user create, list, open, rename, and delete documents scoped to their account or workspace.
- FR-4: The editor must provide a text panel whose contents autosave to the document.
- FR-5: The system must expose `POST /api/generate` that converts text into 3+ candidate visual schemas via Azure OpenAI with structured output.
- FR-6: Generation must allow a limited anonymous trial without login, and rate-limit authenticated requests per user.
- FR-7: The system must render visuals from a versioned JSON schema as SVG for five visual types.
- FR-8: The user must be able to select a candidate, switch its visual type, and have it attached to the document.
- FR-9: The user must be able to edit node text, move/delete nodes, and edit edges, with changes persisted.
- FR-10: The user must be able to change color themes and per-element styles, persisted to the document.
- FR-11: The system must export a visual as PNG, SVG, PDF, and PPTX.
- FR-12: The system must generate a toggleable read-only public share link per document.
- FR-13: The system must support workspaces with link-based invitations and viewer/editor roles.
- FR-14: The system must support real-time multi-user editing with conflict-free merging and presence via a self-hosted sync server.
- FR-15: The system must support inline comments with replies and resolution on text and visual elements.
- FR-16: All secrets (DB URL, OAuth, Azure OpenAI credentials) must be read from environment variables, never hardcoded.

## Non-Goals (Out of Scope)

- Native mobile apps and mobile editing (view-only on mobile is acceptable but not required for v1).
- Generating visuals offline without an LLM provider (a provider key is required).
- Multi-language UI (interface is English-only; generated visuals may follow source-text language).
- Billing, paid plans, and quota enforcement beyond basic per-user rate limiting.
- Advanced PPTX fidelity (animations, editable native shapes); a single-slide image export is sufficient.
- Version history / document revision rollback.
- Custom font uploads and full brand-kit management.

## Design Considerations

- Desktop-first editor: left text panel, central canvas, right style/inspector panel.
- Visuals rendered as SVG so they are crisp and exportable as vectors.
- Reuse a single themeable token set for colors so themes apply consistently across visual types.
- Loading and error states must be non-blocking; generation should never freeze the editor.
- Keep visual schema versioned so future renderer changes stay backward-compatible.

## Technical Considerations

- Stack: Next.js (App Router) + React + TypeScript + Tailwind CSS.
- Auth: Auth.js/NextAuth with credentials + Google providers; HTTP-only cookie sessions.
- Database: Postgres via Prisma; migrations checked into the repo.
- LLM: Azure OpenAI via a provider abstraction using structured-output (JSON schema) prompting; the default deployment targets the `gpt-5.5` model and the latest stable Azure OpenAI API version; endpoint, deployment name, API version, and key via env vars; validate every response against the visual schema before use.
- Real-time: a CRDT library (e.g. Yjs) with a self-hosted websocket server for sync and presence (no third-party managed service).
- Input limits: generation input text is capped at 10,000 characters; requests over the cap are rejected before calling the LLM.
- Anonymous trial: unauthenticated users may generate visuals up to a small quota (e.g. 3 generations) tracked by a signed anonymous-ID cookie persisted in the browser (a `localStorage` token mirrors it) rather than IP, since many users share an IP behind NAT; the quota does not reset over time (once exhausted, login is required); saving documents requires login.
- Exports: SVG natively; PNG via canvas rasterization; PDF and PPTX via established libraries.
- Rate limiting on generation endpoint to control cost and abuse.
- Store secrets in `.env`; never commit them.

## Success Metrics

- A user can go from pasted text to a chosen, rendered visual in under 10 seconds (excluding LLM latency).
- 90%+ of generation requests return at least one schema-valid visual.
- Two users can co-edit a document with changes visible within ~1 second.
- A visual can be exported to PNG/SVG/PDF/PPTX that opens correctly in standard viewers.
- No cross-user or cross-workspace data leakage in access tests.

## Open Questions

- None outstanding. All prior decisions are resolved: Azure OpenAI `gpt-5.5` on the latest stable API version, 10,000-character input cap, and a non-resetting anonymous trial quota tracked by a signed anonymous-ID cookie.
