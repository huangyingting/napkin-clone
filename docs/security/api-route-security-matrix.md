# API Route Security Matrix

**Epic:** #495 — API Security and Public Surface Governance
**Issue:** #509
**Status:** Current — enforced by `src/app/api/api-route-security-matrix.test.ts`
**Last updated:** 2026-06-23

---

## Purpose

This matrix is the single, authoritative inventory of every HTTP route under
`src/app/api/**/route.ts`: how it is gated, what it returns when it denies a
request, and who owns it. Adding a route to the filesystem WITHOUT adding a row
here fails the guard test, so a new public surface can never ship unclassified.

The guard test (`src/app/api/api-route-security-matrix.test.ts`):

- globs `src/app/api/**/route.ts` and normalizes each to a route key,
- parses the **Route** column of the table below, and
- fails if any filesystem route is missing a row, or if the table lists a route
  that no longer exists.

Routes that intentionally carry no app-level gate (only the framework/auth
handler itself) are tracked in the test's `NO_APP_GATE_ALLOWLIST` so the
"public by design" decision is explicit and reviewable.

## Classifications

| Classification          | Meaning                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `public+rate-limited`   | No session required; abuse-controlled by rate limit / quota.       |
| `authenticated-session` | Requires a valid Auth.js session (`getCurrentUser`).               |
| `document-capability`   | Requires a role-derived capability on a specific document.         |
| `share-policy`          | Gated by the public share/embed/present link policy.               |
| `entitlement-gated`     | Requires a session AND a plan entitlement.                         |
| `webhook-signature`     | Verified by a provider webhook signature (Stripe).                 |
| `internal-secret`       | Verified by an internal shared secret header (service-to-service). |
| `framework-auth`        | The Auth.js handler itself; public by design (no app-level gate).  |

## Shared denial helper

Most app-gated routes return denials through `src/lib/api/errors.ts`
(`unauthorized()`, `forbidden()`, `notFound()`, `featureDisabled()`,
`validationError()`, `tooManyRequests()`), which emit a canonical
`{ "error": string, "code": string }` JSON body. The slide-asset route is the
deliberate exception: it serves images and returns **plain-text**
privacy-preserving bodies (see Notes).

---

## Matrix

| Route                                 | Classification                         | Auth/session          | Rate limit                      | Capability / share / entitlement / signature gate | Denial status / body                                                                                                 | Owner            | Notes                                                                                                                |
| ------------------------------------- | -------------------------------------- | --------------------- | ------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| `account/export`                      | `authenticated-session`                | Required              | No                              | Reads scoped to session `user.id`                 | 401 `{error:"Unauthorized.",code:"UNAUTHORIZED"}`; 500 on failure                                                    | Platform/Privacy | "Download my data"; never accepts a client-supplied id.                                                              |
| `auth/[...nextauth]`                  | `framework-auth`                       | Handled by Auth.js    | No                              | Auth.js handler (sign-in/out, callbacks)          | Delegated to Auth.js                                                                                                 | Platform/Auth    | Public by design — in `NO_APP_GATE_ALLOWLIST`. No app-level gate is added on purpose.                                |
| `billing/webhook`                     | `webhook-signature`                    | None                  | No                              | Stripe signature (`stripe-signature` header)      | 200 `{message:"ok"}` when Stripe disabled (intentional); 400 missing signature; 500 handler error                    | Billing          | 200-when-disabled is intentional so the app runs without Stripe creds. Do NOT normalize this away.                   |
| `brand`                               | `authenticated-session`                | Required              | No                              | Lists brands for session `user.id`                | 401 `{error:"Unauthorized.",code:"UNAUTHORIZED"}`                                                                    | Brand            | List endpoint for the visual-context popover.                                                                        |
| `brand/font`                          | `entitlement-gated`                    | Required              | No                              | `resolveBrandEntitlements().canFontUpload`        | 401 unauthorized; 403 `{error:<upgrade msg>,code:"FORBIDDEN"}`; 400 bad form; 413 too large; 415 wrong type          | Brand/Billing    | 403 carries a product upgrade message (intentional).                                                                 |
| `brand/logo`                          | `entitlement-gated`                    | Required              | No                              | `resolveBrandEntitlements().canBrand`             | 401 unauthorized; 403 `{error:<upgrade msg>,code:"FORBIDDEN"}`; 400 bad form; 413 too large; 415 wrong type          | Brand/Billing    | 403 carries a product upgrade message (intentional).                                                                 |
| `collab/authorize`                    | `document-capability`                  | Required              | No                              | `getDocumentCapabilities` + `decideRoomAccess`    | 401 unauthorized; 403 forbidden (missing room or no view access — never leaks existence); 200 `{ok,role,readOnly}`   | Collab           | Called by the WebSocket upgrade handler. 403 deliberately covers missing/deleted docs.                               |
| `collab/flush`                        | `internal-secret`                      | None (service-to-svc) | No                              | Constant-time `x-collab-internal-secret` compare  | 503 disabled (no secret set); 401 invalid secret; 400 malformed; 404 missing document; 200 `{ok:true}`               | Collab           | Internal recovery-snapshot endpoint (#497). Disabled (503) when `COLLAB_INTERNAL_SECRET` is unset.                   |
| `generate`                            | `public+rate-limited`                  | Optional              | Per-user + anon IP + anon trial | Credit metering for authenticated users           | 400/413 validation; 429 rate/quota (+`Retry-After`); 402 insufficient credits; 503 Azure misconfig; 504 timeout; 502 | AI               | Public by design. Abuse denials emit `api-abuse` diagnostics (#512).                                                 |
| `generate-deck`                       | `public+rate-limited`                  | Optional              | Per-user + anon IP + anon trial | Feature flag `AI_DECK_GEN_ENABLED`; credits       | 404 when flag OFF (intentional); 400/413; 429 (+`Retry-After`); 402; 503; 504; 502                                   | AI               | 404-when-disabled hides the route by design. Do NOT normalize this away. Emits `api-abuse` diagnostics (#512).       |
| `import`                              | `public+rate-limited`                  | None                  | Per client IP                   | Parser timeout bounds each parse                  | 429 rate limit (+`Retry-After`); 400 bad form / read; 413/415 invalid file; 422 empty / parse-timeout / parse-failed | AI/Import        | Public by design. Heavy parsers run server-side only. Emits `api-abuse` diagnostics (#512).                          |
| `slide-assets/[documentId]/[...path]` | `share-policy` + `document-capability` | Optional              | No                              | `decideSlideAssetAccess` (capability OR share)    | 404 plain `Not found` (missing asset/doc — privacy); 403 plain `Forbidden` (exists but unauthorized); 200 bytes      | Presentation     | Plain-text bodies on purpose (image route). Privacy 404 must NEVER become a 403. Decision tested in `route.test.ts`. |
| `user/entitlements`                   | `authenticated-session`                | Required              | No                              | Derives plan/credit state for session `user.id`   | 401 `{error:"Unauthorized.",code:"UNAUTHORIZED"}`                                                                    | Billing          | Body normalized in #511 (was `"Unauthorized"` without a trailing period).                                            |

---

## Intentional behaviors (do NOT "normalize" these)

- **`billing/webhook` returns 200 when Stripe is disabled** so the app builds
  and runs without Stripe credentials.
- **`generate-deck` returns 404 when `AI_DECK_GEN_ENABLED` is OFF** to keep the
  route invisible until an operator opts in.
- **`slide-assets` returns a privacy 404** (plain text) for missing assets /
  documents, and a plain-text 403 only when an asset provably exists but the
  caller is unauthorized. A privacy 404 must never be downgraded to a 403,
  which would confirm the asset exists.
- **`auth/[...nextauth]`** is public by design and carries no app-level gate.

## Related

- Error helper: `src/lib/api/errors.ts` (#511).
- Abuse diagnostics: `src/lib/diagnostics/api-abuse.ts` (#512).
- Access policy: [../architecture/security/access-and-sharing.md](../architecture/security/access-and-sharing.md).
- Release gate: [../operations/release-gate.md](../operations/release-gate.md).
