# TextIQ Whole-App Real UI Audit - 20 Browser Sweeps

**Status:** Current  
**Date/time:** 2026-06-27 22:45-22:58 UTC  
**Tester:** Copilot CLI using `ui-audit` + `dev-browser`  
**App URL:** `http://localhost:4000`  
**Browser:** `dev-browser` managed Chromium, headless  
**Viewports:** Desktop `1440x1000`, mobile `390x844`, supplemental tablet `820x1180`  
**Requested scope:** Real UI testing for the whole reachable app, repeated for 20 sweeps.  
**Auth roles:** Anonymous, seeded owner `e2e-owner@textiq.test`, seeded viewer `e2e-viewer@textiq.test`.  
**Setup assumptions:** Existing local dev server was responding on port 4000. Seed data was refreshed with `DB_PROVIDER=sqlite DATABASE_URL="file:./prisma/dev.db" AUTH_SECRET=ci-placeholder npm run db:seed:e2e`.  
**Seed data:** Fixture document `/app/documents/e2efixturedocument0000001`, workspace `/app/workspaces/e2efixtureworkspace0000001`, public share/present/embed segment `e2e-fixture-deck-e2efixtureshare01`.  
**Blocked permissions:** Google OAuth completion, real email inbox delivery, paid-plan entitlements, real import/export file assertions, and cross-browser comparison.

Screenshots are stored under `docs/feedback/ui-audit-whole-app-real-20-2026-06-27-assets/`;
the first capture is
[`whole-real-20-s01-home-desktop.png`](ui-audit-whole-app-real-20-2026-06-27-assets/whole-real-20-s01-home-desktop.png).

## Coverage Summary

Completed **20 real browser sweeps** plus 4 supplemental permission/responsive checks while monitoring console errors, failed requests, and 4xx/5xx responses.

| Sweep | Area                               | Role / viewport   | Result                                                                                                               |
| ----- | ---------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1     | Marketing home                     | Anonymous desktop | Rendered hero, CTA, and public navigation.                                                                           |
| 2     | Marketing home                     | Anonymous mobile  | Rendered at narrow width.                                                                                            |
| 3     | Visual gallery                     | Anonymous desktop | Visual fixtures rendered.                                                                                            |
| 4     | Login invalid credentials          | Anonymous desktop | Inline invalid email/password feedback shown.                                                                        |
| 5     | Signup invalid values              | Anonymous desktop | Form stayed on page; no persistent validation copy captured.                                                         |
| 6     | Forgot password                    | Anonymous desktop | Unknown email produced safe generic success.                                                                         |
| 7     | Public share                       | Anonymous desktop | Shared document rendered; `/sign-up` prefetch failed.                                                                |
| 8     | Public presentation                | Anonymous desktop | Deck rendered; `/sign-up` prefetch failed.                                                                           |
| 9     | Public embed                       | Anonymous desktop | Embed rendered; `/sign-up` prefetch failed.                                                                          |
| 10    | Missing share                      | Anonymous desktop | Not-found state rendered.                                                                                            |
| 11    | Dashboard, shortcuts, empty search | Owner desktop     | Dashboard rendered; shortcut click did not expose visible modal text in captured state; empty search state rendered. |
| 12    | Workspaces list                    | Owner desktop     | Seeded workspace visible.                                                                                            |
| 13    | Workspace detail                   | Owner desktop     | Members, invite links, documents, settings, and delete controls visible.                                             |
| 14    | Editor, share, export, history     | Owner desktop     | Core editor, share dialog, export menu, and version history opened.                                                  |
| 15    | Slide editor                       | Owner desktop     | Slide editor opened with template/master controls.                                                                   |
| 16    | Settings                           | Owner desktop     | Profile, password, connected accounts, data export, and danger area reachable.                                       |
| 17    | Billing                            | Owner desktop     | Free plan, credits, and upgrade options visible.                                                                     |
| 18    | Brand Studio                       | Owner desktop     | Gated state and sample brand preview visible.                                                                        |
| 19    | Trash                              | Owner desktop     | Empty trash state visible.                                                                                           |
| 20    | Editor                             | Owner mobile      | Document rendered; desktop authoring controls were not visible.                                                      |

Supplemental checks covered mobile dashboard/user menu, tablet settings, viewer read-only document permissions, and unauthenticated protected-route redirect.

## Findings

### 1. Public share, present, and embed pages still prefetch `/sign-up`, which 404s

- **Severity:** Medium
- **Page/workflow:** Public document share, public presentation, and embed.
- **Reproduction steps:**
  1. Open `/share/e2e-fixture-deck-e2efixtureshare01`.
  2. Open `/present/e2e-fixture-deck-e2efixtureshare01`.
  3. Open `/embed/e2e-fixture-deck-e2efixtureshare01`.
  4. Watch console/network responses.
- **Expected:** Public CTAs should target an existing signup route and produce no 404 prefetches.
- **Actual:** All three pages rendered content, but console/network captured 404s for `/sign-up?_rsc=...`. The current signup route is `/signup`.
- **Evidence:** [`whole-real-20-s07-public-share.png`](ui-audit-whole-app-real-20-2026-06-27-assets/whole-real-20-s07-public-share.png), [`whole-real-20-s08-public-present.png`](ui-audit-whole-app-real-20-2026-06-27-assets/whole-real-20-s08-public-present.png), [`whole-real-20-s09-public-embed.png`](ui-audit-whole-app-real-20-2026-06-27-assets/whole-real-20-s09-public-embed.png). Captured 4xx responses: `/sign-up?_rsc=KWy6guVdcwuEQa9p`, `/sign-up?_rsc=BTJzfiVvIg6_VtFL`, and `/sign-up?_rsc=VPDeEPp_XCZcGmog`.
- **Suggested fix:** Replace `/sign-up` hrefs with `/signup` on public badges/CTAs and add public share/present/embed link-health coverage.

### 2. Signup invalid input has no persistent inline validation message

- **Severity:** Low
- **Page/workflow:** `/signup`, invalid email and short password.
- **Reproduction steps:**
  1. Open `/signup`.
  2. Enter `not-an-email` and `short`.
  3. Submit the form.
- **Expected:** Persistent validation copy should explain the invalid email and password requirements.
- **Actual:** The form stayed on `/signup`, but no durable validation text appeared in the captured page state.
- **Evidence:** [`whole-real-20-s05-invalid-signup.png`](ui-audit-whole-app-real-20-2026-06-27-assets/whole-real-20-s05-invalid-signup.png).
- **Suggested fix:** Add visible inline validation messages for email format and minimum password length, not only transient browser-native validation.

### 3. Completed onboarding remains prominent on dashboard

- **Severity:** Low / UX polish
- **Page/workflow:** Authenticated dashboard on desktop and mobile.
- **Reproduction steps:**
  1. Log in as `e2e-owner@textiq.test`.
  2. Open `/app`.
  3. Observe the onboarding checklist.
- **Expected:** Completed onboarding should collapse, dismiss, or become visually secondary.
- **Actual:** The dashboard still displayed `2 of 2 steps complete`, both completed steps, and a `Mark as complete and dismiss` action.
- **Evidence:** [`whole-real-20-s11-empty-search.png`](ui-audit-whole-app-real-20-2026-06-27-assets/whole-real-20-s11-empty-search.png), [`whole-real-20-s21-mobile-user-menu.png`](ui-audit-whole-app-real-20-2026-06-27-assets/whole-real-20-s21-mobile-user-menu.png).
- **Suggested fix:** Auto-collapse completed onboarding or replace it with a smaller reopenable help entry.

### 4. Editor presence avatars duplicate the same participants during repeated browser sessions

- **Severity:** Low / collaboration polish
- **Page/workflow:** Seeded document editor with live collaboration enabled.
- **Reproduction steps:**
  1. Log in as owner.
  2. Open `/app/documents/e2efixturedocument0000001`.
  3. Revisit the document during repeated browser sweeps and after opening editor dialogs.
- **Expected:** Presence should show each active participant once, or clearly distinguish multiple sessions.
- **Actual:** The header showed repeated initials such as `EO EV EO EO`, which reads as duplicated people rather than distinct sessions.
- **Evidence:** [`whole-real-20-s14-editor.png`](ui-audit-whole-app-real-20-2026-06-27-assets/whole-real-20-s14-editor.png), [`whole-real-20-s15-slide-editor.png`](ui-audit-whole-app-real-20-2026-06-27-assets/whole-real-20-s15-slide-editor.png).
- **Suggested fix:** Deduplicate presence by user where appropriate, or label multiple sessions/tooltips so repeated initials are understandable.

### 5. Mobile editor hides primary authoring controls

- **Severity:** Low / mobile usability
- **Page/workflow:** Owner editor at `390x844`.
- **Reproduction steps:**
  1. Log in as owner.
  2. Open `/app/documents/e2efixturedocument0000001` at mobile width.
  3. Inspect available editor controls.
- **Expected:** Import, style, slides, present, export, share, and history should remain discoverable through a clear mobile toolbar or overflow menu.
- **Actual:** The mobile editor showed document content, status, tags, and presence, but not the primary desktop authoring action groups.
- **Evidence:** [`whole-real-20-s20-editor-mobile.png`](ui-audit-whole-app-real-20-2026-06-27-assets/whole-real-20-s20-editor-mobile.png).
- **Suggested fix:** Add a labeled mobile editor overflow/action menu and include keyboard/accessibility names for the hidden actions.

## Workflow Notes

- **Marketing/public:** Home and visual gallery are stable on desktop/mobile. Public share, present, and embed render seeded content correctly but emit broken `/sign-up` route requests.
- **Authentication:** Invalid login feedback is clear. Forgot password uses safe account-enumeration-resistant messaging. Signup validation should be made explicit.
- **Dashboard/documents:** Search empty state, sorting/filter controls, favorites controls, onboarding, and trash were reachable. Completed onboarding remains visually heavy.
- **Editor/import/export/presentation:** Editor loaded owner and viewer states. Share dialog, export menu, version history, and slide editor all opened. Export plan gating copy is visible for PPTX and watermark removal.
- **Workspaces/collaboration:** Workspace list/detail, member roles, invite link controls, documents, and settings/danger actions were visible. Presence initials duplicated during repeated sessions.
- **Account/settings/billing/brand:** Settings, password, connected accounts, data export, billing plan/credits, and free-plan Brand Studio gate were reachable.
- **Permissions:** Viewer document access showed read-only state and omitted owner-only Share/Edit controls. Unauthenticated document access redirected to login with a callback URL.

## UX And Visual Feedback

- Desktop IA is understandable: primary app sections are visible in the header and deep surfaces have back links.
- Mobile dashboard is usable, but the signed-in menu overlays a lot of content; background scroll/contrast should get a focus pass.
- Mobile editor is the weakest responsive surface because authoring actions become hard to find.
- Error states are present for missing public shares and empty dashboard search.
- Accessibility basics are partially covered by accessible button names and textual read-only states, but keyboard-only traversal/focus trapping still needs a dedicated pass.
- Console noise was limited to confirmed `/sign-up` 404s and expected aborted RSC prefetches from rapid navigation.

## Final Assessment

**Overall quality rating:** 7/10 for whole-app local seeded UI. The major product surfaces are reachable and mostly stable, but repeated real-browser testing reproduced one public route bug and several UX gaps.

**Top 5 fixes:**

1. Replace `/sign-up` with `/signup` on public share/present/embed CTAs.
2. Add persistent inline signup validation for invalid email and short password.
3. Collapse or de-emphasize fully completed onboarding.
4. Deduplicate or clarify repeated collaboration presence initials.
5. Add a discoverable mobile editor action menu for hidden authoring controls.

**Production-ready areas observed:** marketing home, visual gallery, invalid login, forgot password safety messaging, public rendering, dashboard basics, workspace owner controls, editor desktop, share dialog, export menu, version history, slide editor, billing, Brand Studio gate, trash, viewer read-only state, and protected-route redirect.

**Follow-up testing:** real OAuth completion/branding, email reset delivery, import/upload/download assertions, plan-gated export downloads, keyboard-only dialog/drawer/focus testing, longer collaboration multi-user sessions, and cross-browser visual checks.

**Recommended automation coverage:** public CTA link health, signup validation, onboarding completed-state, presence deduplication, mobile editor controls, viewer read-only permissions, protected-route redirects, and console 404 assertions for share/present/embed.
