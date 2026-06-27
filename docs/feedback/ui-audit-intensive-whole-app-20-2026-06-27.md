# TextIQ Intensive Whole-App UI Audit - 20 Sweeps

**Status:** Current  
**Date/time:** 2026-06-27 23:08-23:25 UTC  
**Tester:** Copilot CLI using `ui-audit` + `dev-browser`  
**App URL:** `http://localhost:4000`  
**Browser:** `dev-browser` managed Chromium, headless  
**Viewports:** Desktop `1440x1000`, mobile `390x844`, supplemental tablet `820x1180`  
**Requested scope:** Real whole-app UI testing repeated 20 times, with broad button clicking plus drag, drop/chooser, and scale checks.  
**Auth roles:** Anonymous, seeded owner `e2e-owner@textiq.test`, seeded viewer `e2e-viewer@textiq.test`.  
**Setup assumptions:** Existing local dev server was responding on port 4000. Seed data was refreshed with `DB_PROVIDER=sqlite DATABASE_URL="file:./prisma/dev.db" AUTH_SECRET=ci-placeholder npm run db:seed:e2e`.  
**Seed data:** Fixture document `/app/documents/e2efixturedocument0000001`, workspace `/app/workspaces/e2efixtureworkspace0000001`, public share/present/embed segment `e2e-fixture-deck-e2efixtureshare01`.  
**Blocked permissions:** Real Google OAuth completion, email inbox delivery, paid-plan entitlements, cross-browser comparison, and destructive confirmations such as delete/remove/revoke/sign out/regenerate were intentionally not executed.

Screenshots are stored under `docs/feedback/ui-audit-intensive-whole-app-20-2026-06-27-assets/`;
the first capture is
[`intensive-real-20-s01-home-desktop.png`](ui-audit-intensive-whole-app-20-2026-06-27-assets/intensive-real-20-s01-home-desktop.png).

## Coverage Summary

Completed **20 intensive browser sweeps** plus 4 supplemental permission/responsive checks. The run clicked **48 reachable non-destructive buttons**, skipped **35 destructive, identity-changing, file-mutating, or paid-plan buttons**, opened the import file chooser, triggered a real PDF download, dragged in the slide editor, and tested scale up/down with keyboard zoom plus the slide ratio control.

| Sweep | Area                | Role / viewport   | Interaction coverage                                                                |
| ----- | ------------------- | ----------------- | ----------------------------------------------------------------------------------- |
| 1     | Marketing home      | Anonymous desktop | Public links/buttons inventory, safe clicks.                                        |
| 2     | Marketing home      | Anonymous mobile  | Safe clicks, drag scroll.                                                           |
| 3     | Visual gallery      | Anonymous desktop | Gallery rendering and safe controls.                                                |
| 4     | Login               | Anonymous desktop | Invalid credential submit.                                                          |
| 5     | Signup              | Anonymous desktop | Invalid email/short-password submit.                                                |
| 6     | Forgot password     | Anonymous desktop | Unknown-email reset submit.                                                         |
| 7     | Public share        | Anonymous desktop | Public CTA/link state, safe controls.                                               |
| 8     | Public presentation | Anonymous desktop | Previous/next controls and arrow-key navigation.                                    |
| 9     | Public embed        | Anonymous desktop | Embed render.                                                                       |
| 10    | Missing share       | Anonymous desktop | Not-found actions.                                                                  |
| 11    | Dashboard           | Owner desktop     | Shortcuts/user menu/favorites/actions, empty search.                                |
| 12    | Workspaces list     | Owner desktop     | Workspace list controls and user menu.                                              |
| 13    | Workspace detail    | Owner desktop     | Safe controls; destructive member/invite/delete controls skipped.                   |
| 14    | Editor              | Owner desktop     | Toolbar buttons, style/page guide/share/export/history, import chooser, PDF export. |
| 15    | Slide editor        | Owner desktop     | Opened slide editor, dragged canvas, scaled up/down, opened ratio control.          |
| 16    | Settings            | Owner desktop     | Safe controls and long display-name entry.                                          |
| 17    | Billing             | Owner desktop     | Plan/upgrade surface; paid-plan buttons skipped.                                    |
| 18    | Brand Studio        | Owner desktop     | Gated preview surface; upgrade action skipped.                                      |
| 19    | Trash               | Owner desktop     | Empty trash and back/user controls.                                                 |
| 20    | Editor              | Owner mobile      | Mobile editor controls, drag scroll, responsive state.                              |

Supplemental checks covered mobile dashboard/user menu, tablet settings, viewer read-only document state, and unauthenticated protected-route redirect.

## Findings

### 1. Public share, present, and embed pages still request `/sign-up`, which 404s

- **Severity:** Medium
- **Page/workflow:** Public share, presentation, and embed CTAs.
- **Reproduction steps:**
  1. Open `/share/e2e-fixture-deck-e2efixtureshare01`.
  2. Open `/present/e2e-fixture-deck-e2efixtureshare01`.
  3. Open `/embed/e2e-fixture-deck-e2efixtureshare01`.
  4. Watch console/network responses.
- **Expected:** Public CTAs should target the valid `/signup` route and produce no route-prefetch 404s.
- **Actual:** All three pages rendered content but emitted 404 responses for `/sign-up?_rsc=...`.
- **Evidence:** [`intensive-real-20-s07-public-share.png`](ui-audit-intensive-whole-app-20-2026-06-27-assets/intensive-real-20-s07-public-share.png), [`intensive-real-20-s08-public-present.png`](ui-audit-intensive-whole-app-20-2026-06-27-assets/intensive-real-20-s08-public-present.png), [`intensive-real-20-s09-public-embed.png`](ui-audit-intensive-whole-app-20-2026-06-27-assets/intensive-real-20-s09-public-embed.png). Console/network captured three `/sign-up` 404s.
- **Suggested fix:** Replace `/sign-up` hrefs with `/signup` on public badges/CTAs and add link-health assertions for share, present, and embed pages.

### 2. Signup invalid input lacks persistent inline validation feedback

- **Severity:** Low
- **Page/workflow:** `/signup`, invalid email and short password.
- **Reproduction steps:**
  1. Open `/signup`.
  2. Enter `not-an-email` and `short`.
  3. Submit the form.
- **Expected:** Persistent inline copy should explain email format and password length requirements.
- **Actual:** The page stayed on the signup form, but no durable validation text appeared in the captured page state.
- **Evidence:** [`intensive-real-20-s05-invalid-signup.png`](ui-audit-intensive-whole-app-20-2026-06-27-assets/intensive-real-20-s05-invalid-signup.png).
- **Suggested fix:** Add visible inline validation messages near the email and password fields instead of relying only on transient browser-native validation.

### 3. Completed onboarding remains visually prominent after completion

- **Severity:** Low / UX polish
- **Page/workflow:** Authenticated dashboard.
- **Reproduction steps:**
  1. Log in as the seeded owner.
  2. Open `/app`.
  3. Observe the onboarding checklist after seeded completion.
- **Expected:** Completed onboarding should collapse, dismiss, or become secondary.
- **Actual:** The checklist still showed `2 of 2 steps complete`, completed steps, and a dismiss action before document content.
- **Evidence:** [`intensive-real-20-s11-dashboard.png`](ui-audit-intensive-whole-app-20-2026-06-27-assets/intensive-real-20-s11-dashboard.png).
- **Suggested fix:** Auto-collapse completed onboarding or replace it with a smaller reopenable help entry.

### 4. Editor presence duplicates the same participant initials during repeated sessions

- **Severity:** Low / collaboration polish
- **Page/workflow:** Collaborative document editor.
- **Reproduction steps:**
  1. Open the seeded document as owner.
  2. Repeat editor sweeps and open editor panels.
  3. Observe the presence stack.
- **Expected:** Presence should show each participant once or clearly distinguish multiple browser sessions.
- **Actual:** The editor repeatedly showed initials such as `EO EV EO EO`, which reads as duplicate people.
- **Evidence:** [`intensive-real-20-s14-editor-buttons-export.png`](ui-audit-intensive-whole-app-20-2026-06-27-assets/intensive-real-20-s14-editor-buttons-export.png), [`intensive-real-20-supp-slide-after-drag-scale.png`](ui-audit-intensive-whole-app-20-2026-06-27-assets/intensive-real-20-supp-slide-after-drag-scale.png).
- **Suggested fix:** Deduplicate presence by user where appropriate, or add tooltips/session labels so repeated initials are understandable.

### 5. Mobile editor hides primary authoring controls

- **Severity:** Low / mobile usability
- **Page/workflow:** Owner document editor at `390x844`.
- **Reproduction steps:**
  1. Log in as owner.
  2. Open `/app/documents/e2efixturedocument0000001` on mobile.
  3. Inspect available controls and drag-scroll the page.
- **Expected:** Import, style, slides, present, export, share, and history should remain discoverable through a clear mobile toolbar or overflow menu.
- **Actual:** The mobile editor showed document content, status, and presence, but not the full desktop authoring action set.
- **Evidence:** [`intensive-real-20-s20-editor-mobile.png`](ui-audit-intensive-whole-app-20-2026-06-27-assets/intensive-real-20-s20-editor-mobile.png), [`intensive-real-20-mobile-drag-scroll.png`](ui-audit-intensive-whole-app-20-2026-06-27-assets/intensive-real-20-mobile-drag-scroll.png).
- **Suggested fix:** Add a labeled mobile editor action menu and include accessible names for hidden actions.

## Workflow Notes

- **Buttons and controls:** 48 non-destructive buttons were clicked across public, dashboard, workspace, editor, settings, billing, brand, trash, and viewer states. Destructive or identity-changing controls were inventoried but not confirmed.
- **Drag/drop/scale:** Mobile drag-scroll worked. Slide editor drag was executed on the canvas; scale up/down via `Ctrl++` / `Ctrl+-` completed, and the slide ratio control exposed `16:9`, `4:3`, and slide ratio options.
- **Import/export:** The editor import file chooser opened successfully. PDF export triggered a real download with suggested filename `E2E Fixture Deck.pdf`.
- **Authentication:** Invalid login shows clear feedback. Forgot password returns safe generic success. Protected document routes redirect unauthenticated users to login with a callback URL.
- **Dashboard/documents:** Search empty state, favorite toggles, card actions, shortcuts/user menu, tags, and sort/filter controls were exercised. Favorite toggles mutate seeded state but did not break navigation.
- **Editor/presentation:** Toolbar panels, share, export, version history, slide editor, presentation controls, viewer read-only controls, and public presentation were reachable.
- **Workspaces/settings/billing/brand:** Workspace details, invite/member controls, settings, data/export surfaces, billing, and Brand Studio gate were reachable; destructive confirmations were skipped.

## UX And Visual Feedback

- Desktop navigation remains coherent under repeated clicking, but icon-only utility controls like `?` and avatar buttons rely on accessible names rather than visible labels.
- The slide editor exposes powerful controls but becomes dense quickly; ratio and master/template controls need strong keyboard/focus coverage.
- Public pages look clean but their badge CTA route is still broken.
- Mobile editor is still the least discoverable core surface.
- Error and empty states are present for invalid login, forgot password, missing share, empty dashboard search, and trash.

## Final Assessment

**Overall quality rating:** 7/10 for intensive local whole-app UI testing. Core surfaces stayed reachable during broad button clicking, import/export, drag, and scale checks, but repeated testing confirmed several launch-polish issues.

**Top 5 fixes:**

1. Replace `/sign-up` public CTA targets with `/signup`.
2. Add persistent inline validation on signup.
3. Collapse or de-emphasize completed onboarding.
4. Deduplicate or clarify repeated collaboration presence initials.
5. Add a discoverable mobile editor action menu.

**Production-ready areas observed:** marketing home, visual gallery, invalid login, forgot password, public share/present/embed rendering, dashboard search/filter/card controls, workspace detail, editor desktop toolbar, import chooser, PDF export, share dialog, export menu, version history, slide editor drag/scale basics, billing, Brand Studio gate, trash, viewer read-only state, and protected-route redirect.

**Follow-up testing:** destructive confirmation flows in a disposable database, real OAuth completion, email reset delivery, real file upload contents, paid-plan exports, keyboard-only focus trapping, multi-user collaboration session cleanup, and cross-browser visual checks.

**Recommended automation coverage:** public CTA link health, signup validation, completed onboarding state, presence deduplication, mobile editor action visibility, import chooser, PDF export download, slide editor ratio/drag controls, viewer read-only permissions, and protected-route redirect.
