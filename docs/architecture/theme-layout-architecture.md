# Theme, Master, and Layout Architecture for Slides

> Status: Accepted — first slice of Epic #378.

## Summary

This document defines the five-layer styling cascade that gives Slides
predictable, reversible brand application. It describes each layer's scope and
responsibilities, the reset-to-inherited semantic for overrides, master-slide
structure, layout-to-slide binding, and the migration path from the existing
deck/slide fields.

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

The deck references a token set via `Deck.themeId`. Built-in token sets match
the existing `DeckTheme` names (`indigo`, `ocean`, `forest`, `sunset`, `grape`,
`default`) so legacy decks continue working without migration.

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
(or only) master is used. A deck with no `masters` array falls back to the
token-derived defaults, preserving full backward compatibility.

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

These fields are unchanged from the existing schema — no migration required.

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

## Compatibility with Existing Fields

| Existing field                                                | Treatment in new architecture                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `Deck.theme` (`DeckTheme`)                                    | Stable; maps 1-to-1 to a built-in `DeckThemeTokenSet` id.                      |
| `Deck.themeId`                                                | Preferred selector for the token set; fallback to `Deck.theme`.                |
| `Deck.layouts`                                                | Unchanged; becomes the layout catalogue for Layer 3.                           |
| `Slide.background` / `backgroundGradient` / `backgroundImage` | Unchanged; are Layer 4 overrides.                                              |
| `Slide.accent`                                                | Unchanged; is a Layer 4 color override.                                        |
| `Slide.layout` (`SlideLayoutHint`)                            | Legacy renderer hint; survives alongside the new reusable layout system.       |
| `Slide.theme` (copy on each slide)                            | Legacy read-only copy; renderers should prefer `Deck.theme` / `themeId`.       |
| `Deck.masters`                                                | **New, optional.** Absent → single implicit master derived from the token set. |
| `Slide.masterRef`                                             | **New, optional.** Absent → use the first/only master.                         |

No migration is required for any existing deck record. All new fields are
optional with sensible fallbacks.

---

## Future Work (out of scope for this slice)

- Master editor UI (#378 child issue).
- Normalise built-in layouts into the new layout contract (#378).
- Layout application rules that preserve manual overrides (#378).
- Theme/layout validation helpers (#378).
- `MasterSlide.themeId` vs deck `themeId` precedence if per-master theming is introduced (#future).
