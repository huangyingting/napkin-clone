# TextIQ Browser UI Audit - Repeat 20-Sweep Pass

**Status:** Current  
**Date/time:** 2026-06-27 22:39-22:51 UTC  
**Tester:** Copilot CLI using `ui-audit` + `dev-browser`  
**App URL:** `http://localhost:4000`  
**Browser:** `dev-browser` managed Chromium, headless  
**Viewports:** Desktop `1440x1000`, mobile `390x844`, supplemental tablet `820x1180`  
**Requested scope:** Repeat the browser UI audit skill for 20 exploratory sweeps across the reachable local app.  
**Auth roles:** Anonymous, seeded owner `e2e-owner@textiq.test`; seeded viewer data present but not used for the repeated pass.  
**Setup assumptions:** Existing local dev server was already responding on port 4000; port 3000 was not running. E2E fixture data was refreshed with `DB_PROVIDER=sqlite DATABASE_URL="file:./prisma/dev.db" AUTH_SECRET=ci-placeholder npm run db:seed:e2e`.  
**Seed data:** E2E fixture document `/app/documents/e2efixturedocument0000001`, workspace `/app/workspaces/e2efixtureworkspace0000001`, public share/present/embed segment `e2e-fixture-deck-e2efixtureshare01`.  
**Blocked permissions:** Real Google OAuth completion, email inbox delivery, real file import/export verification, paid-plan entitlements, and cross-browser comparison.

Screenshots are stored under `docs/feedback/ui-audit-repeat-20-browser-2026-06-27-assets/`;
the first capture is
[`repeat-ui-audit-2026-06-27-s01.png`](ui-audit-repeat-20-browser-2026-06-27-assets/repeat-ui-audit-2026-06-27-s01.png).

## Coverage Summary

Completed **20 browser sweeps** plus 2 supplemental checks with console, failed-request, and 4xx response monitoring enabled.

| Sweep | Area                                       | Viewport | Result                                                                                             |
| ----- | ------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------- |
| 1     | Marketing home                             | Desktop  | Rendered, navigation and hero content visible.                                                     |
| 2     | Marketing home                             | Mobile   | Rendered; content remains readable at narrow width.                                                |
| 3     | Login + invalid credentials                | Desktop  | Invalid email/password message displayed inline.                                                   |
| 4     | Signup + invalid values                    | Desktop  | Form remained in place; no durable inline validation message captured.                             |
| 5     | Forgot password                            | Desktop  | Reset form rendered.                                                                               |
| 6     | Visual gallery                             | Desktop  | Fixture visual gallery rendered.                                                                   |
| 7     | Public share                               | Desktop  | Shared document rendered; `/sign-up` prefetch failed.                                              |
| 8     | Public presentation                        | Desktop  | Deck rendered; `/sign-up` prefetch failed.                                                         |
| 9     | Public embed                               | Desktop  | Embed rendered; `/sign-up` prefetch failed.                                                        |
| 10    | Missing share                              | Desktop  | Not-found state rendered.                                                                          |
| 11    | Owner dashboard + shortcuts + empty search | Desktop  | Dashboard rendered; completed onboarding remains visible.                                          |
| 12    | Workspaces list                            | Desktop  | Seeded workspace visible.                                                                          |
| 13    | Workspace detail                           | Desktop  | Members, invite links, documents, and danger controls visible.                                     |
| 14    | Owner editor + share dialog + slide editor | Desktop  | Editor, share dialog, and slide editor opened.                                                     |
| 15    | Settings + long display name entry         | Desktop  | Settings rendered; long display name accepted in field.                                            |
| 16    | Billing                                    | Desktop  | Free-plan credits and upgrade plans visible.                                                       |
| 17    | Brand Studio                               | Desktop  | Free-plan gating and sample brand preview visible.                                                 |
| 18    | Trash                                      | Desktop  | Empty trash state visible.                                                                         |
| 19    | Dashboard + user menu                      | Mobile   | Authenticated dashboard and mobile user menu opened.                                               |
| 20    | Owner editor                               | Mobile   | Core document content visible, but authoring toolbar actions were absent from the mobile snapshot. |

Supplemental checks covered tablet settings layout and the direct legacy `/sign-up` route, which returned a 404.

## Findings

### 1. Public pages still target the non-existent `/sign-up` route

- **Severity:** Medium
- **Page/workflow:** Public share, present, embed, and direct CTA target.
- **Reproduction steps:**
  1. Open `/share/e2e-fixture-deck-e2efixtureshare01`.
  2. Open `/present/e2e-fixture-deck-e2efixtureshare01`.
  3. Open `/embed/e2e-fixture-deck-e2efixtureshare01`.
  4. Watch console/network output, then open `/sign-up` directly.
- **Expected:** Public CTAs should target the real signup route and produce no 404 prefetches.
- **Actual:** Public pages rendered, but each emitted a 404 for `/sign-up?_rsc=...`; direct `/sign-up` returned the app's 404 page. The real route is `/signup`.
- **Evidence:** [`repeat-ui-audit-2026-06-27-s07.png`](ui-audit-repeat-20-browser-2026-06-27-assets/repeat-ui-audit-2026-06-27-s07.png), [`repeat-ui-audit-2026-06-27-s08.png`](ui-audit-repeat-20-browser-2026-06-27-assets/repeat-ui-audit-2026-06-27-s08.png), [`repeat-ui-audit-2026-06-27-sign-up-404.png`](ui-audit-repeat-20-browser-2026-06-27-assets/repeat-ui-audit-2026-06-27-sign-up-404.png). Console captured 404s for `/sign-up?_rsc=...` on share, present, and embed.
- **Suggested fix:** Replace public-page CTA hrefs from `/sign-up` to `/signup`, and add route-link coverage for share, present, and embed surfaces.

### 2. Default credential login lands on the signed-in marketing page instead of the app dashboard

- **Severity:** Medium
- **Page/workflow:** `/login` with valid owner credentials and no callback URL.
- **Reproduction steps:**
  1. Open `/login` in a fresh browser session.
  2. Enter `e2e-owner@textiq.test` and `e2e-owner-pw-2026`.
  3. Click `Log in`.
- **Expected:** A successful default login should land on `/app` or another authenticated workspace/dashboard destination.
- **Actual:** Login succeeded, but the browser landed on `/`, showing signed-in navigation over the marketing hero with `Get Started Free` messaging.
- **Evidence:** [`repeat-ui-audit-2026-06-27-login-redirect-home.png`](ui-audit-repeat-20-browser-2026-06-27-assets/repeat-ui-audit-2026-06-27-login-redirect-home.png).
- **Suggested fix:** Ensure the credentials sign-in fallback callback URL is `/app`, and add an auth flow test for a login request without `callbackUrl`.

### 3. Signup invalid input has weak persistent validation feedback

- **Severity:** Low
- **Page/workflow:** `/signup`, invalid email and short password.
- **Reproduction steps:**
  1. Open `/signup`.
  2. Enter `not-an-email` and `short`.
  3. Submit the form.
- **Expected:** The page should show persistent inline messages explaining email format and password length requirements.
- **Actual:** The form stayed on `/signup`, but the captured page text showed no durable validation copy after submit. Browser-native validation may have blocked the request, but that feedback is transient and not represented in the page content.
- **Evidence:** [`repeat-ui-audit-2026-06-27-invalid-signup.png`](ui-audit-repeat-20-browser-2026-06-27-assets/repeat-ui-audit-2026-06-27-invalid-signup.png).
- **Suggested fix:** Add explicit inline validation text near the email and password fields before submit or immediately after a blocked submit.

### 4. Completed onboarding remains prominent after all steps are complete

- **Severity:** Low / UX polish
- **Page/workflow:** Authenticated dashboard, desktop and mobile.
- **Reproduction steps:**
  1. Log in as the seeded owner.
  2. Open `/app`.
  3. Observe the onboarding checklist.
- **Expected:** A fully completed checklist should be collapsed, dismissed, or visually de-emphasized.
- **Actual:** The dashboard still showed `2 of 2 steps complete`, both completed steps, and `Mark as complete and dismiss`.
- **Evidence:** [`repeat-ui-audit-2026-06-27-s11.png`](ui-audit-repeat-20-browser-2026-06-27-assets/repeat-ui-audit-2026-06-27-s11.png), [`repeat-ui-audit-2026-06-27-s19.png`](ui-audit-repeat-20-browser-2026-06-27-assets/repeat-ui-audit-2026-06-27-s19.png).
- **Suggested fix:** Auto-collapse or dismiss the checklist after completion, while leaving a way to reopen onboarding help.

### 5. Mobile editor hides core authoring actions in the captured viewport

- **Severity:** Low / mobile usability
- **Page/workflow:** `/app/documents/e2efixturedocument0000001` at `390x844`.
- **Reproduction steps:**
  1. Log in as the owner.
  2. Open the seeded document at mobile width.
  3. Inspect available header/editor controls.
- **Expected:** Key actions such as import, style, slides, present, export, share, and history should remain discoverable on mobile, likely behind a clear overflow menu.
- **Actual:** The mobile snapshot showed the document and status, but not the desktop authoring action groups.
- **Evidence:** [`repeat-ui-audit-2026-06-27-s20.png`](ui-audit-repeat-20-browser-2026-06-27-assets/repeat-ui-audit-2026-06-27-s20.png).
- **Suggested fix:** Add or clarify a mobile editor action menu with text labels/accessibility names for the hidden actions.

## Workflow Notes

- **Marketing/public:** Home and visual gallery render cleanly on desktop and mobile. Public share, present, and embed content render correctly, but their shared CTA route is broken.
- **Authentication:** Invalid login feedback is clear. Valid default login reaches an authenticated state but lands on marketing content instead of the dashboard. Signup needs stronger inline validation.
- **Dashboard/documents:** Dashboard controls, tags, favorites, sorting, empty search, trash, and shortcuts were reachable. The completed onboarding card is still too prominent.
- **Editor/presentation:** The seeded document, live status, share dialog, slide editor, public presentation, and embed all opened. Mobile editor action discoverability needs focused follow-up.
- **Workspace:** Owner workspace detail exposed members, role actions, invite links, and workspace settings/danger controls.
- **Settings/billing/brand:** Account settings, long display-name entry, billing limits, and free-plan Brand Studio gating were reachable.

## UX And Visual Feedback

- Desktop navigation is clear and stable, but signed-in users can still see marketing CTAs on `/`, which feels inconsistent after login.
- Public branded badges are visually unobtrusive, but their route target needs correction.
- The editor desktop toolbar is information-dense but grouped well; mobile needs clearer overflow affordances.
- Empty/error states are present for missing public shares and trash.
- Keyboard shortcut access exists, but a deeper keyboard-only/focus-trap pass is still needed for dialogs, drawers, and slide editor panels.
- Console noise was mostly limited to confirmed 404s and expected aborted React Server Component prefetches during rapid navigation.

## Final Assessment

**Overall quality rating:** 7/10 for the repeated local browser pass. Core app surfaces are reachable and mostly stable, but the repeated audit reproduced a public route bug and an auth redirect UX problem.

**Top 5 fixes:**

1. Replace `/sign-up` targets with `/signup` on public share/present/embed CTAs.
2. Redirect successful default credential login to `/app` instead of signed-in marketing home.
3. Add persistent inline signup validation for invalid email and short password.
4. Collapse or auto-dismiss completed onboarding.
5. Make mobile editor authoring actions discoverable through a clear overflow menu.

**Production-ready areas observed:** marketing home, visual gallery, invalid login feedback, public document rendering, dashboard basics, workspace detail, billing, brand gating, trash, desktop editor, share dialog, and slide editor.

**Follow-up testing:** Google OAuth completion and branding, real password reset email delivery, file import/export downloads, paid-plan export behavior, viewer read-only pass, keyboard-only accessibility, focus trapping, and cross-browser visual regression.

**Recommended automation coverage:** link checker for public CTAs, login default callback test, signup validation test, mobile editor action visibility test, onboarding completed-state test, and public share/present/embed smoke tests with console 404 assertions.
