# Global Deck Template — Authoring Workflow

**Status:** Current
**Last updated:** 2026-06-24

This document is the authoring-facing companion to
[theme-layout.md](theme-layout.md). It explains the **global deck template
contract** — the set of token groups a deck-level template defines — and how to
author or extend one, both for built-in themes and brand-derived custom token
sets.

It documents implemented behavior only. For the cascade mechanics and resolver
APIs see [theme-layout.md](theme-layout.md); for the persisted shape see
[../data-model/deck.md](../data-model/deck.md).

## The template contract

A deck template is the outermost layer of the cascade and is represented by a
`DeckThemeTokenSet` (`src/lib/presentation/deck-theme-tokens.ts`). It defines:

| Group                    | Fields                                                                                                              | Resolver                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `colors`                 | `slideBg`, `surface`, `accent`, `onBg`, `onSurface`, `onAccent`, `muted` (hex)                                      | `resolveSlideStyle`                            |
| `typography`             | `fontFamily`, `headingFontFamily?`, `scale` (FontScale), `roles?` (per-role tokens)                                 | `resolveRoleToken` / `resolveTextElementStyle` |
| `typography.roles[role]` | `fontSize`, `color`, `weight`, `fontFamily?`, `italic?`, `underline?`, `lineHeight?`, `paragraphSpacing?`, `align?` | `resolveRoleToken`                             |
| `spacing`                | `slidePaddingPt`, `gridUnitPt`                                                                                      | layout engine                                  |
| `shape`                  | `cornerRadiusPt`, `shadowCss`, `fill?`, `stroke?`, `strokeWidth?`, `opacity?`                                       | `resolveShapeDefaults` (consumers)             |
| `bullet?`                | `markerColor?`, `gapPct?`, `indentPct?`, `numberStyle?`                                                             | `resolveBulletDefaults`                        |
| `connector?`             | `color?`, `width?`, `dash?`, `startArrow?`, `endArrow?`                                                             | `resolveConnectorDefaults`                     |
| `visual?`                | `styleThemeId?`, `transparentBackground?`                                                                           | `resolveVisualDefaults`                        |
| `image?`                 | `fitMode?`, `radiusPct?`, `maskShape?`, `shadow?`                                                                   | `resolveImageDefaults`                         |
| `defaultBackground`      | `BackgroundTreatment` (solid / gradient / image)                                                                    | `resolveSlideBackground`                       |

The `bullet`, `connector`, `visual`, and `image` groups and the extended
`shape` fields are **optional**; absent fields fall back to deterministic
defaults (e.g. bullet marker → `accent`, connector color → `onBg`). A template
that omits them renders exactly as before they existed.

## Semantic text roles

`DECK_TEXT_ROLES` = `h1`, `h2`, `h3`, `subtitle`, `body`, `bullet`, `caption`,
`footer`, `shapeLabel`. A template may author full per-role typography under
`typography.roles`; any role it omits is derived from `typography.scale` +
color tokens via `deriveRoleToken`, so **every theme exposes complete role
typography**. A text-bearing element opts into the template by carrying a
`textRole`; without one it falls back to the text-element mapping (`role: "title"` →
`h1`, `role: "body"` → `body`).

## Reset-to-inherited

Local overrides live on `styleOverride` (text/bullets) and `textStyleOverride`
(shape labels) as a `Partial<TextElementStyle>`. The resolver merges a present
field over the role token (`origin: element`) and inherits an absent field
(`origin: deck`). **Resetting a property to the theme value means deleting that
key from the override object**; resetting a whole element means dropping the
override object entirely. The concrete `style` / `textStyle` fields remain
during the transition for renderers that have not yet adopted the resolvers.

## Worked cascade example

Given a deck whose template sets `h1` to Space Grotesk 42 / `#111827` / 700 and
a master with a navy background:

```
deck template   roles.h1 = { fontFamily: "Space Grotesk", fontSize: 42, color: "#111827", weight: 700 }
  → master      background = { type: "solid", color: "#0b1020" }
    → layout    (title slot geometry)
      → slide   accent = "#22d3ee"        (slide-level override)
        → element  styleOverride = { color: "#ffffff" }   (local override)
```

Resolving a title element (`textRole: "h1"`) yields:

| Field      | Value         | Origin    |
| ---------- | ------------- | --------- |
| fontFamily | Space Grotesk | `deck`    |
| fontSize   | 42            | `deck`    |
| weight     | 700           | `deck`    |
| color      | `#ffffff`     | `element` |
| background | `#0b1020`     | `master`  |

Deleting the element's `styleOverride.color` resets `color` back to `#111827`
with `origin: deck`.

## Authoring a custom (brand-derived) template

`brandToTokenSet` (`src/lib/presentation/deck-brand-tokens.ts`) builds a
`DeckThemeTokenSet` from a saved brand, and `applyBrandToDeck` stores it on
`Deck.customTokenSet` and installs brand master chrome **without touching any
element `style` / `styleOverride`**, so existing local overrides are preserved.

When authoring or generating a custom token set:

- It must pass `validateCustomTokenSet` (`deck-schema.ts`): all `colors` must be
  hex, `typography.scale` numeric, any `typography.roles[*]` must use a known
  role key with a hex `color`, and optional `bullet` / `connector` / `visual` /
  `image` groups must be well-formed. Malformed token sets are rejected before
  persistence.
- Custom fonts that PPTX cannot embed surface as a deck-level `missing-font`
  **warning** via export preflight (`export-preflight.ts`) — never a crash.

## How generated slides map into roles and slots

New slides carry semantic identity up front:

- `buildSlideElementsFromContent` (`deck.ts`) emits document-derived elements
  and binds layout slots (`title` → title, bullets → body, visuals → visual).
- The `+ Add` templates (`slide-templates.ts`) bind every materialized element
  to its slot (two-column body columns get `body#0` / `body#1`; the visual
  spotlight binds `visual` + `caption`).
- Legacy slides without bindings remain unbound at runtime. If persisted
  role/slot stamping is needed, add an explicit offline migration descriptor
  rather than application-layer enrichment.

The slot vocabulary (`SLIDE_SLOT_KINDS`) and `LayoutSlotBinding` shape live in
`src/lib/presentation/slide-slots.ts`.
