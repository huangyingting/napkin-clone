# End-to-end tests (Playwright)

These Playwright specs cover critical product flows (issue #107). They live
**only** in `e2e/` so the unit gate (`npm test` →
`node --test "src/**/*.test.ts"`) never picks them up. They are **not** run by
the required CI workflow — run them locally or in a dedicated E2E job.

## What's covered

| Spec                            | Coverage                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `public-pages.spec.ts`          | Home / login / signup render (smoke)                                            |
| `auth-redirect.spec.ts`         | Protected `/app*` → `/login?callbackUrl=...` (preserves path)                   |
| `oauth-disabled.spec.ts`        | Google CTA hidden when the provider is unconfigured                             |
| `workspace.spec.ts`             | Create / import, empty state, viewer restriction (auth-gated)                   |
| `share-fallback.spec.ts`        | Unknown share/present/embed links → not-found fallback                          |
| `billing-brand.spec.ts`         | Billing unlimited-credit UI + Brand Studio font persistence                     |
| `slides-smoke.spec.ts`          | Slides edit/save/present/export smoke (auth-gated, skips cleanly without creds) |
| `screenshot-regression.spec.ts` | Slide screenshot regression with deterministic fixtures (opt-in via env var)    |

## Prerequisites

1. Install the Chromium browser binary (one-time):

   ```bash
   npx playwright install chromium
   ```

2. Start the app (in a separate terminal). The unlimited-credit UI is gated by
   `BILLING_UNLIMITED_CREDITS`, and Google OAuth visibility by
   `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`:

   ```bash
   export DB_PROVIDER=sqlite
   export DATABASE_URL="file:./prisma/dev.db"
   export AUTH_SECRET=dev-secret
   npm run db:generate
   npm run db:migrate   # or db:reset to seed
   npm run dev
   ```

## Run

```bash
npm run test:e2e
```

By default the specs target `http://localhost:3000`. Override with
`E2E_BASE_URL` (or `BASE_URL`). To have Playwright start the dev server for you,
set `E2E_WEB_SERVER=1`:

```bash
E2E_WEB_SERVER=1 npm run test:e2e
```

## Environment variables

Public-page, auth-redirect, OAuth-disabled, and share-fallback specs run with no
extra configuration. Authenticated flows skip cleanly unless you provide seeded
credentials:

| Variable                    | Used by                           | Purpose                                                   |
| --------------------------- | --------------------------------- | --------------------------------------------------------- |
| `E2E_BASE_URL` / `BASE_URL` | all                               | App base URL (default `http://localhost:3000`)            |
| `E2E_WEB_SERVER`            | config                            | `1` to let Playwright run `npm run dev`                   |
| `E2E_USER_EMAIL/PASSWORD`   | workspace, billing, brand, slides | A seeded owner/editor login                               |
| `E2E_VIEWER_EMAIL/PASSWORD` | workspace                         | A seeded viewer-only login                                |
| `E2E_VIEWER_DOC_URL`        | workspace                         | A document URL the viewer can open read-only              |
| `E2E_BRAND_FONT_URL`        | brand                             | Path to a `.woff2`/`.ttf` font to upload                  |
| `BILLING_UNLIMITED_CREDITS` | billing                           | Match the server's unlimited-credit gate                  |
| `AUTH_GOOGLE_ID/SECRET`     | oauth-disabled                    | Match the server's Google provider configuration          |
| `E2E_SLIDES_DOC_URL`        | slides-smoke                      | Full URL to a seeded document with a Slides presentation  |
| `E2E_SCREENSHOT_REGRESSION` | screenshot-regression             | Set to `1` to enable screenshot comparison tests          |
| `E2E_REGRESSION_SHARE_ID`   | screenshot-regression             | A share id for the public present/embed regression slides |

## Slides smoke (`slides-smoke.spec.ts`)

The Slides smoke spec covers the core edit → save → present → export flow. It
degrades cleanly at every step:

- Without `E2E_USER_EMAIL`/`E2E_USER_PASSWORD`: all authenticated tests skip.
- Without `E2E_SLIDES_DOC_URL`: persistence and present tests skip.
- The unauthenticated redirect and 404 share tests always run.

To run only the slides smoke:

```bash
E2E_USER_EMAIL=owner@example.com \
E2E_USER_PASSWORD=secret \
E2E_SLIDES_DOC_URL=http://localhost:3000/app/documents/YOUR_DOC_ID \
npx playwright test slides-smoke.spec.ts
```

## Screenshot regression (`screenshot-regression.spec.ts`)

Screenshot regression tests are **opt-in** via `E2E_SCREENSHOT_REGRESSION=1`.
They use a deterministic deck fixture (no server required for fixture-integrity
tests) and compare rendered slides against stored baselines.

### Generate baselines

```bash
E2E_SCREENSHOT_REGRESSION=1 npx playwright test screenshot-regression.spec.ts --update-snapshots
```

### Run comparison

```bash
E2E_SCREENSHOT_REGRESSION=1 npx playwright test screenshot-regression.spec.ts
```

### Tolerances

Screenshot comparisons use a 2% max-diff pixel ratio and a 0.2 per-pixel
threshold to absorb minor sub-pixel rendering differences across OS/GPU. These
values are defined in the spec and can be tightened once a stable baseline is
established.
