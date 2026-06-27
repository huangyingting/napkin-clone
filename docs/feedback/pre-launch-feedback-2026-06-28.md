# Pre-Launch QA Feedback - 2026-06-28

**Status:** Current  
**Last updated:** 2026-06-28

This note captures browser QA findings from the 2026-06-28 pre-launch pass and
separates items already fixed in code from follow-up work that remains open.

## Fixed In Code

| Item                          | Status                               | Notes                                                                                                                                                                                        |
| ----------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branding CTA link             | Fixed                                | The public "Made with TextIQ" badge links to `/signup` instead of the former `/sign-up` 404 route.                                                                                           |
| Login redirect                | Fixed                                | Missing or invalid auth callback URLs now fall back to `/app`, so email/password login lands on the dashboard by default.                                                                    |
| Login submit order            | Fixed                                | Email/password forms render before Google OAuth on login and signup, so the first submit button is the credential flow.                                                                      |
| Version-history author labels | Fixed forward; legacy fallback added | New deck snapshots carry the authenticated user. Legacy snapshots without `createdById` display the document owner as a fallback; this does not reconstruct the original actor for old rows. |
| Editor shortcut conflict      | Fixed                                | `Ctrl/Cmd + E` remains inline code. Toggle Write / Preview moved to `Ctrl/Cmd + Shift + P`.                                                                                                  |

## Open Follow-Ups

| Area                             | Priority                     | Feedback / action                                                                                                                                                                                                                                                                                                             |
| -------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prisma schema application        | P0 operational               | The document-editor crash was caused by a database missing `Document.shareMetadataMode` and `Document.shareDiscoverable` plus a stale Turbopack/Next cache. Keep schema changes paired with `npm run db:push`, Prisma client generation, cache cleanup when needed, and a clean production build before release verification. |
| Dev server stability             | Blocker for dev-mode testing | `npm run dev` reported Turbopack panics while production build was unaffected. Investigate `server.mjs`, Next package resolution, and why Turbopack appears despite `turbopack: false`.                                                                                                                                       |
| Logged-in home page              | UX                           | Authenticated users still see marketing hero and "Get Started Free" messaging on `/`. Consider redirecting to `/app` or rendering a signed-in dashboard-oriented hero.                                                                                                                                                        |
| Onboarding checklist             | UX                           | The dashboard can show "2 of 2 steps complete" while keeping the checklist visible. Consider auto-dismissing or collapsing completed onboarding.                                                                                                                                                                              |
| Free-plan export watermark       | UX                           | Export copy says the free plan includes a watermark. Add a clearer point-of-export preview or example before download.                                                                                                                                                                                                        |
| Brand Studio gated state         | UX                           | The Brands page asks for an upgrade before showing much feature value. Add a lightweight preview or sample brand experience before the upgrade prompt.                                                                                                                                                                        |
| Header context without workspace | UX                           | Documents outside a workspace show only "Back" in the editor header. Consider adding consistent document or personal workspace context.                                                                                                                                                                                       |
| Visual node editing affordances  | UX / accessibility           | Node editing depends on toolbar controls and selected-node buttons that are not obvious to new users. Add clearer affordances, labels, or tooltips.                                                                                                                                                                           |
| Slide ratio vs export ratio      | UX                           | Slide editor ratio controls and Visual export size controls can look overlapping. Clarify the distinction between slide aspect ratio and export aspect ratio.                                                                                                                                                                 |
| Mobile layout                    | UX / QA                      | Basic navigation works at narrow widths, but critical flows still need dedicated mobile testing and mobile-specific layout review.                                                                                                                                                                                            |
| Visual alt text                  | Accessibility                | Some generated visual/image content may not expose sufficient alternative text. Audit public and editor visual render paths for meaningful accessible names.                                                                                                                                                                  |

## Validation Already Run For Fixed Items

```bash
node --import tsx --test src/lib/auth/callback-url.test.ts src/lib/shortcuts/catalog.test.ts src/lib/shortcuts/match.test.ts
npm run typecheck
npm run db:schema:check
```

Touched TypeScript and TSX files were also linted directly with `npx eslint`.
