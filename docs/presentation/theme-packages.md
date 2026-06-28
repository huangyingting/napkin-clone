# Presentation Theme Packages

**Status:** Current  
**Last updated:** 2026-06-28

Theme packages are the presentation editor's bundled slide-design units. A
package combines the deck-level theme tokens, the chrome-only master, and the
slide templates that should be offered after the user selects that theme.

Theme packages do not change the persisted v6 deck model. Applying a package
writes existing deck fields:

- `Deck.design.themeId`
- `Deck.design.themeOverrides.tokenSet`
- `Deck.masters`
- `Deck.defaultMasterId`
- `Deck.customTemplates`
- `Slide.masterId`

No package id, package version, or template source metadata is persisted outside
those existing fields.

## Package Catalog

The first package catalog contains eight independent packages. `default` is not
one of those packages; it is an alias that resolves to `clarity` for older decks
or callers that still ask for the default package.

| Package     | Role                                                               |
| ----------- | ------------------------------------------------------------------ |
| `clarity`   | General business decks with quiet, content-first layouts.          |
| `ocean`     | Product, data, and operations decks with clear blue-green layouts. |
| `aurora`    | Technology and SaaS keynote decks.                                 |
| `monolith`  | Corporate and consulting decks with structured navy/gold layouts.  |
| `editorial` | Brand, narrative, and report decks with editorial typography.      |
| `noir`      | Premium dark pitch decks with amber accents.                       |
| `terra`     | Sustainability, research, and strategy decks.                      |
| `pulse`     | Launch, startup, and marketing decks with high-contrast geometry.  |

Each package provides six templates:

- Cover
- Section divider
- Content
- Two-column
- Quote or stat
- Closing

The professional packages are derived from the validated prototype decks under
`prototypes/slide-themes`. `clarity` and `ocean` follow the same quality bar and
data shape rather than falling back to the older generic built-in slide
templates.

## Apply Behavior

Applying a package is deterministic:

- `design.themeId` is set to the package id.
- `design.themeOverrides.tokenSet` is replaced with the package token set.
- `masters` is replaced with the package master catalog.
- `defaultMasterId` is set to the package master id.
- Existing slides keep their `elements`, `content`, `templateId`, and
  `designOverrides`.
- Existing slides have `masterId` updated to the package default master.
- Old package templates with ids matching `theme:*:*` are removed.
- User-created custom templates are preserved.
- The package's templates are added to `Deck.customTemplates`.

Slide-level overrides are explicit user edits and are not cleared by package
application. A slide that already has `designOverrides.background` or accent
continues to use that override until the user clears it.

## Template Identity

Package templates use string ids in this form:

```text
theme:<package-id>:<template-kind>
```

The supported template kinds are:

```text
cover | section | content | two-column | quote | closing
```

Examples:

```text
theme:terra:cover
theme:pulse:two-column
theme:clarity:closing
```

User-created templates keep their existing `custom-*` ids. The id prefix is the
only distinction needed by v6; the schema already treats template ids as strings.
Package template ids are reserved and cannot be updated or deleted through the
user custom-template commands.

## Editor Surfaces

The theme picker presents packages as the primary theme choices. Selecting a
theme package replaces the deck's theme tokens, master catalog, default master,
and installed package templates.

The Add slide picker prioritizes the currently installed package templates. When
package templates are present, they form the main template family. User-created
templates stay in the Custom group. Generic built-in templates are fallback
options for decks that do not yet have package templates.

The current slide's template apply and reapply commands can use either package
template ids or user custom template ids. Reapplying a package template replaces
or preserves content according to the existing template reapply mode; switching
packages does not reapply templates to existing slides automatically.

## Master Boundary

Masters remain chrome-only in v6. Package masters contain global chrome such as
footer and page number elements. Decorative shapes that define a package's visual
personality live inside the package templates as locked slide elements, not in
the master.
