# Localization And I18n Activation

**Status:** Current  
**Last updated:** 2026-06-26

The localization subsystem owns typed UI message catalogs, locale resolution,
and the gate that keeps the language switcher hidden until enough user-facing
surfaces are translated.

## Source Anchors

| Area                  | Source                                                                               |
| --------------------- | ------------------------------------------------------------------------------------ |
| Message catalogs      | [`src/lib/i18n/messages.ts`](../../src/lib/i18n/messages.ts)                         |
| Translator API        | [`src/lib/i18n/index.ts`](../../src/lib/i18n/index.ts)                               |
| Activation coverage   | [`src/lib/i18n/coverage.ts`](../../src/lib/i18n/coverage.ts)                         |
| Runtime switcher gate | [`src/lib/i18n/config.ts`](../../src/lib/i18n/config.ts)                             |
| Server locale         | [`src/lib/i18n/server.ts`](../../src/lib/i18n/server.ts)                             |
| Client locale context | [`src/lib/i18n/locale-context.tsx`](../../src/lib/i18n/locale-context.tsx)           |
| Language switcher UI  | [`src/components/language-switcher.tsx`](../../src/components/language-switcher.tsx) |

## Catalog Model

Locales are declared in `SUPPORTED_LOCALES`; the current supported set is `en`
and `es`, with `en` as the default locale. Messages are grouped by owning
surface, currently:

- app shell and header;
- dashboard;
- template picker;
- language switcher.

Each surface owns its TypeScript message shape. The merged `catalog` is derived
from surface catalogs, so adding a surface requires updating both its message
type and `catalogBySurface`.

## Activation Gate

The language switcher is behind two gates:

1. `I18N_SWITCHER_ENABLED=true` must be present at runtime.
2. `getI18nActivationStatus().userActivationReady` must be true.

Activation requires 100% translated coverage for every required non-default
locale across catalogued required surfaces and named required surfaces that are
not yet catalogued. Today the uncatalogued blockers are document editor core,
import/export flows, and auth/billing settings.

This means partial catalog infrastructure can ship without exposing incomplete
locale selection to users.

## Locale Resolution

Server components and route handlers read `textiq-locale` from cookies through
`getLocale()`. Invalid or missing values fall back to the default locale. Client
components use the locale context and translator helpers instead of reading the
cookie directly.

## Adding A Surface

When localizing a new surface:

1. Add a surface-owned message type in `messages.ts`.
2. Add default and non-default locale entries for that surface.
3. Add it to `catalogBySurface`.
4. If it is required for public activation, include it in the coverage gate or
   remove the corresponding uncatalogued blocker.
5. Use `createTranslator(locale)` at the view-model or server/component boundary
   instead of scattering raw catalog reads.

## Invariants

1. Default-locale messages define the required key set.
2. Non-default locales must have non-empty values for required keys before user
   activation.
3. The env flag alone never exposes the switcher.
4. Locale cookie reads stay server-side; client code uses context.
5. Catalog keys are surface-owned and stable.

## Primary Tests

- [`src/lib/i18n/i18n.test.ts`](../../src/lib/i18n/i18n.test.ts)
