# Theme, Master, and Layout Architecture for Slides

> Status: Accepted — first slice of Epic #378.

## Summary

This document defines the five-layer styling cascade that gives Slides
predictable, reversible brand application. It describes each layer's scope and
responsibilities, the reset-to-inherited semantic for overrides, master-slide
structure, and layout-to-slide binding.

---

## Motivation

The current deck model has themes, slide-level overrides, reusable layouts,
and placeholder elements. As the product adds brand kits, AI-generated decks,
PPTX import/export, and richer templates, ad-hoc per-element styling will not
scale. Users expect "apply this brand" or "change all title fonts" to work
without editing every element. A layered token model makes global changes
cheap and local hand-edits safe.

---

## The Five-Layer Cascade

```
Deck theme tokens
      ↓  (applies to all slides in the deck)
  Master slide
      ↓  (applies to all slides that reference this master)
    Layout
      ↓  (applies to placeholders on a specific slide)
      Slide override
            ↓  (per-slide bg / accent)
            Element override
                  ↓  (per-element font / color / size)
                  Resolved value
```

Each inner layer **extends** the outer layer. An absent inner-layer field
inherits the resolved value from the next outer layer. Deleting an override
field ("reset to inherited") causes the cascade to fall back automatically —
no separate "default" record is needed.

---

## Layer 1 — Deck Theme Token Set

A `DeckThemeTokenSet` (defined in `src/lib/presentation/deck-theme-tokens.ts`)
is a flat bundle of design tokens that covers the visual language of the entire
deck:

| Token group         | Fields                                                                               |
| ------------------- | ------------------------------------------------------------------------------------ |
| `colors`            | `slideBg`, `surface`, `accent`, `onBg`, `onSurface`, `onAccent`, `muted`             |
| `typography`        | `fontFamily`, `headingFontFamily?`, `scale` (pt sizes for h1/h2/h3/body/list/footer) |
| `spacing`           | `slidePaddingPt`, `gridUnitPt`                                                       |
| `shape`             | `cornerRadiusPt`, `shadowCss`                                                        |
| `defaultBackground` | `BackgroundTreatment` (solid / gradient / image)                                     |

The deck references a token set via required `Deck.themeId`. Built-in token
sets match the `DeckTheme` names (`indigo`, `ocean`, `forest`, `sunset`,
`grape`, `default`). Brand/custom decks set `Deck.themeId` to the custom token
set id and carry `Deck.customTokenSet`.

---

## Layer 2 — Master Slide

A **master slide** (`MasterSlide`) is a deck-level record that holds structural
chrome shared by every slide assigned to it:

```
MasterSlide
├─ themeId         → which DeckThemeTokenSet to inherit
├─ background?     → optional BackgroundTreatment override for all slides
├─ showPageNumbers → boolean (default false)
├─ logoUrl?        → brand logo image URL
├─ logoPlacement?  → corner anchor for the logo
└─ footerText?     → global footer string (may include {{pageNumber}})
```

**Master scope:** One deck may carry multiple named masters (e.g., "Title",
"Content", "Section") stored in `Deck.masters`. Each `Slide` references a
master by `masterRef` id. When `masterRef` is absent the deck's first
(or only) master is used. A deck with no `masters` array uses token-derived
defaults.

The master **does not** own placeholder layouts — those belong to Layer 3.
The master owns chrome (background, logo, footer, page numbers) that sits
behind or around all slide content.

---

## Layer 3 — Layout

A `SlideLayout` (already defined in `deck.ts`) is a named set of placeholder
elements (`PlaceholderElement[]`) positioned within the slide canvas. Each
placeholder binds by `placeholderType` (`title`, `subtitle`, `body`, `visual`,
`footer`).

Layout application rules:

1. Applying a layout **upserts** existing same-type placeholder instances
   (merging box geometry from the layout, preserving text content).
2. **Free-form elements** (kind ≠ `"placeholder"`) are never touched by a
   layout operation — they sit above the placeholder layer.
3. "Reset layout" discards existing placeholder instances and re-installs the
   layout's definitions from scratch, leaving free-form elements intact.
4. A slide may have **no layout** (all free-form) — in that case only the
   master chrome and slide overrides apply.

The built-in layout catalogue (`defaultLayouts()`) provides `blank`,
`title-slide`, `title-content`, and `two-column` for every `SlideFormat`.
Custom decks may extend `Deck.layouts` with additional named layouts.

---

## Layer 4 — Slide Override

Per-slide override fields on `Slide`:

| Field                | Overrides                                    |
| -------------------- | -------------------------------------------- |
| `background`         | theme `slideBg` and master `background`      |
| `backgroundGradient` | same (gradient wins over solid `background`) |
| `backgroundImage`    | same (image wins over gradient and solid)    |
| `accent`             | theme `accent`                               |

**Reset to inherited:** Delete (or set to `undefined`) the override field.
The cascade then resolves the value from the master/theme layer.

These fields are part of the current schema.

---

## Layer 5 — Element Override

Per-element style properties on `TextElement.style`, `ShapeElement.style`,
etc.:

- `fontFamily`, `fontSize`, `bold`, `italic`, `color`, `align`, …
- `fill`, `stroke`, `cornerRadius`, `shadow`, …

A present field value overrides the placeholder's resolved style. A `null`
sentinel (or field deletion) signals "inherited": the renderer falls back to
the layout's placeholder style, which in turn falls back to the theme
typography tokens.

---

## Reset-to-Inherited Semantics

The general rule:

> **An absent (or `undefined`) field at layer N means "inherit from layer N−1".**

The cascade is purely functional: resolvers accept each layer's partial record
and fold them left → right, so "reset" at any layer is simply omitting the
field in the stored record. No "reset" flag is needed.

A future "Revert to theme" action will delete all slide- and element-level
overrides for a given attribute, making the cascade produce the same output as
if the overrides were never set.

---

## Master Scope and Multi-Master Decks

A standard deck has exactly one master (`Deck.masters[0]`). Advanced decks
(e.g., imported PPTX or brand-kit templates) may carry multiple masters. The
editor exposes master selection per slide; the presentation renderer and
exporter resolve the master for every slide independently before rendering.

Master scope rules:

- A master belongs to one deck; it is never shared across decks.
- Changing a master field (e.g., footer text) immediately affects **all slides**
  that reference that master — this is the mechanism behind "global change".
- Layouts are independent of masters; the same layout can be used under any
  master.

---

## Current Field Roles

| Existing field                                                | Treatment in new architecture                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `Deck.themeId`                                                | Required selector for the deck token set.                                      |
| `Deck.layouts`                                                | Unchanged; becomes the layout catalogue for Layer 3.                           |
| `Slide.background` / `backgroundGradient` / `backgroundImage` | Unchanged; are Layer 4 overrides.                                              |
| `Slide.accent`                                                | Unchanged; is a Layer 4 color override.                                        |
| `Slide.layout` (`SlideLayoutHint`)                            | Document-derived layout hint.                                                  |
| `Deck.masters`                                                | Optional explicit masters. Absent → single implicit master from the token set. |
| `Slide.masterRef`                                             | Optional master reference. Absent → use the first/only master.                 |
| `TextElement.textRole` / `BulletsElement.textRole`            | Optional semantic role (`h1`…`shapeLabel`); selects the template role token.   |
| `TextElement.styleOverride` / `BulletsElement.styleOverride`  | Optional `Partial<TextElementStyle>` local override over the resolved role.    |
| `ShapeElement.textRole` / `ShapeElement.textStyleOverride`    | Semantic role + local override for the shape label.                            |

All fields above are part of the current deck shape.

---

## Semantic Text Roles (#603)

`DECK_TEXT_ROLES` (in `deck-theme-tokens.ts`) is the canonical, ordered role
vocabulary: `h1`, `h2`, `h3`, `subtitle`, `body`, `bullet`, `caption`,
`footer`, `shapeLabel`. A theme's `DeckThemeTokenSet.typography.roles` map may
define a `TextRoleToken` (font family, size, color, weight, italic, underline,
line height, paragraph spacing, alignment) per role. Any absent role is derived
deterministically from the base `FontScale` + color tokens via
`deriveRoleToken`, so **every** theme exposes complete role typography. Use
`resolveRoleToken(tokenSet, role)` to read the effective token (authored partial
merged over derived defaults).

## Resolved Text Styles (#602)

`style-cascade.ts` exposes pure resolvers that turn the deck template role token
plus local element overrides into a final `ResolvedTextStyle`:

- `resolveTextElementStyle(deck, textElement)` — text `role: "title"` maps to
  `h1`, `"body"` to `body`; an explicit `textRole` wins.
- `resolveBulletsElementStyle(deck, bulletsElement)` — defaults to `bullet`.
- `resolveShapeLabelStyle(deck, shapeElement)` — defaults to `shapeLabel`, reads
  `textStyleOverride`.

Each resolved style carries an `origin` map (`deck` | `layout` | `slide` |
`element`) per field, so an inspector can explain whether a value is inherited
or locally overridden. `fontSize` is in points (the role-token unit), making the
resolvers authoritative for export specs.

## Override and Reset-to-Inherited Semantics (#605)

`styleOverride` / `textStyleOverride` hold only the locally changed fields. A
present field wins (`origin: element`); an absent field inherits the resolved
role token (`origin: deck`). **Resetting** a property to the theme value means
deleting that key from the override object, after which the resolver
re-derives the inherited value. The concrete `style` / `textStyle` fields remain
during the transition for renderers that have not yet adopted the resolvers.

## Non-Text Defaults (#601)

`DeckThemeTokenSet` carries optional default token groups for non-text
elements: `bullet` (marker color, gap, indent, number style), `connector`
(color, width, dash, arrowheads), `visual` (restyle theme, transparent
background), `image` (fit mode, radius, mask, shadow), and an extended `shape`
(fill, stroke, stroke width, opacity in addition to corner radius and shadow).
All groups are optional; `deck-theme-tokens.ts` exposes
`resolveBulletDefaults` / `resolveConnectorDefaults` / `resolveImageDefaults` /
`resolveVisualDefaults` which fill absent fields with deterministic fallbacks
(e.g. bullet marker → accent, connector color → onBg). Existing rendering is
unaffected when these groups are absent because they are defaults a consumer
opts into.

---

## Future Work (out of scope for this slice)

- Master editor UI (#378 child issue).
- Normalise built-in layouts into the new layout contract (#378).
- Layout application rules that preserve manual overrides (#378).
- Theme/layout validation helpers (#378).
- `MasterSlide.themeId` vs deck `themeId` precedence if per-master theming is introduced (#future).
