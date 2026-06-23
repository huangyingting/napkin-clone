# Brand And Billing

**Status:** Current  
**Last updated:** 2026-06-23

This document describes plan entitlements, AI credit metering, and brand style
ownership. It covers the product-tier decisions that affect visual generation,
deck generation, exports, and brand-kit UI.

## Source Files

| Area                       | Source                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| Entitlements               | [`src/lib/billing/entitlements.ts`](../../../src/lib/billing/entitlements.ts)             |
| Credits                    | [`src/lib/billing/credits.ts`](../../../src/lib/billing/credits.ts)                       |
| Usage ledger               | [`src/lib/billing/usage-ledger.ts`](../../../src/lib/billing/usage-ledger.ts)             |
| Billing provider interface | [`src/lib/billing/provider.ts`](../../../src/lib/billing/provider.ts)                     |
| Stripe provider            | [`src/lib/billing/stripe-provider.ts`](../../../src/lib/billing/stripe-provider.ts)       |
| Brand entitlements         | [`src/lib/billing/brand-entitlements.ts`](../../../src/lib/billing/brand-entitlements.ts) |
| Brand schema               | [`src/lib/brand/schema.ts`](../../../src/lib/brand/schema.ts)                             |
| Brand transforms           | [`src/lib/brand/transforms.ts`](../../../src/lib/brand/transforms.ts)                     |
| Font upload helpers        | [`src/lib/brand/upload.ts`](../../../src/lib/brand/upload.ts)                             |
| Brand server actions       | [`src/app/app/brands/actions.ts`](../../../src/app/app/brands/actions.ts)                 |
| Brand Studio UI            | [`src/app/app/brands/brand-studio.tsx`](../../../src/app/app/brands/brand-studio.tsx)     |

## Plans And Entitlements

Plans are defined in `PLAN_ENTITLEMENTS`.

| Plan   | Credits | Period  | Export/features                                           |
| ------ | ------- | ------- | --------------------------------------------------------- |
| `free` | 500     | 7 days  | PNG/PDF export, watermark present.                        |
| `plus` | 10,000  | 30 days | SVG/PPTX export, brand styles, no watermark.              |
| `pro`  | 30,000  | 30 days | Plus features, custom font upload, custom branding flags. |

Entitlement checks are pure and safe to import anywhere. UI and server actions
must treat unknown plan strings as the free tier.

## AI Credit Metering

AI routes compute a request cost from source word count. Authenticated users are
checked against their current credit state; generation is blocked when the
balance is insufficient.

Credit state behavior:

- `getUserCreditState` resets the balance when the plan period elapsed;
- `deductCredits` uses an atomic conditional DB update guarded by
  `creditBalance >= cost`;
- usage ledger reservation/capture/refund ensures failed model calls do not
  consume credits;
- `BILLING_UNLIMITED_CREDITS` skips authenticated credit deduction when enabled.

Anonymous users are not credit-metered by user plan; they use signed-cookie and
hashed-IP quota from the AI route layer.

## Brand Styles

Brand styles are owned by a single user. Brand actions require authentication and
plan entitlement checks before create/update/delete.

Brand data includes:

- name;
- color palette;
- background/node/edge colors;
- font family;
- optional font data URL;
- optional logo URL.

`validateBrandInput` owns structural validation. Brand actions serialize Prisma
rows into client-safe `BrandStyle` objects before returning them.

Custom font upload is gated separately from brand styles. A plan may allow brand
styles without allowing arbitrary font upload.

## Where Entitlements Apply

| Surface              | Entitlement use                              |
| -------------------- | -------------------------------------------- |
| AI visual generation | credit balance / usage ledger                |
| AI deck generation   | feature flag + credit balance / usage ledger |
| Export               | SVG/PPTX availability and watermark removal  |
| Brand Studio         | brand style access and custom font upload    |
| Public share badge   | attribution/watermark visibility             |

## Invariants

1. Unknown plans resolve to free-tier entitlements.
2. Authenticated AI generation is credit-metered unless unlimited credits are
   explicitly enabled.
3. Credit deduction is atomic.
4. Brand mutations require ownership plus brand entitlement.
5. Custom font upload requires the font-upload entitlement.

## Primary Tests

- [`src/lib/billing/entitlements.test.ts`](../../../src/lib/billing/entitlements.test.ts)
- [`src/lib/billing/credits.test.ts`](../../../src/lib/billing/credits.test.ts)
- [`src/lib/billing/usage-ledger.test.ts`](../../../src/lib/billing/usage-ledger.test.ts)
- [`src/lib/billing/brand-entitlements.test.ts`](../../../src/lib/billing/brand-entitlements.test.ts)
- [`src/lib/billing/stripe-provider.test.ts`](../../../src/lib/billing/stripe-provider.test.ts)
- [`src/lib/brand/brand.test.ts`](../../../src/lib/brand/brand.test.ts)
- [`src/lib/brand/font-face.test.ts`](../../../src/lib/brand/font-face.test.ts)
- [`e2e/billing-brand.spec.ts`](../../../e2e/billing-brand.spec.ts)
