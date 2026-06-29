# Presentation Theme Packages

**Status:** Current  
**Last updated:** 2026-06-29

Theme packages are the v7 presentation editor's bundled visual-style units. A
package owns theme tokens, named style refs, optional decorations, and package
assets. Semantic templates are global v7 registry entries, not package-local
templates.

Theme packages do not reintroduce v6 deck fields. Applying a package writes the
v7 theme binding on the deck:

- `DeckV7.theme.packageId`
- `DeckV7.theme.packageVersion`
- optional `DeckV7.theme.overrides`

Slides keep their `SlideNode.template.kind`, `children`, content, local style,
and source metadata. Switching a package changes visual resolution, not the
semantic slide tree.

## Package Catalog

The package catalog contains eight independent packages. `default` is not one
of those packages; it is an alias that resolves to `clarity` for older decks or
callers that still ask for the default package. The package ids remain stable
even when the visible style names are refreshed.

| Package     | Visible style         | Role                                                      |
| ----------- | --------------------- | --------------------------------------------------------- |
| `clarity`   | Swiss Minimal Grid    | Precise brand systems with light grids and blue emphasis. |
| `ocean`     | Iridescent Gradient   | Holographic pitch decks with glass panels and gradients.  |
| `aurora`    | Dark Aurora Corporate | Dark finance and strategy reports with luminous glass.    |
| `monolith`  | Brutalist Bold        | High-impact black, red, and lime creative decks.          |
| `editorial` | Editorial Serif Luxe  | Cream, cobalt, and gold editorial storytelling decks.     |
| `noir`      | Luxe Maroon Magazine  | Premium maroon and gold portfolio or brand decks.         |
| `terra`     | Vibrant Pop           | Playful yellow, red, and blue creative brief decks.       |
| `pulse`     | Tech Terminal Mono    | Neon terminal-style decks with mono typography and grids. |

The canonical semantic template catalog is defined globally by
`SEMANTIC_TEMPLATE_KINDS` in `src/lib/presentation-vnext/template-registry.ts`.
It includes opening, core, compare, proof, flow, decision, business, and closing
templates such as `cover`, `executive-summary`, `evidence`, `table`, `roadmap`,
`recommendation`, and `appendix`.

Several semantic kinds may reuse the same render family. For example,
`comparison` and `tradeoff` may share a two-column physical layout, while
`evidence` and `table` share table rendering. The semantic id is still the
runtime template id so AI plans and editor UI can reason in content terms.

All eight packages are derived from the validated prototype pipeline under
`prototypes/slide-themes`. The visual source is the native v7
`ThemePackageV1` manifest in `prototypes/slide-themes/theme-packages-v7.ts`.
The generator validates those packages, compiles every global semantic template
kind into schema-valid `DeckV7` preview decks, writes generated v7 package JSON,
and renders static previews through the shared v7 render tree. Run the full
pipeline with `npm run slide-themes:generate`; use `npm run slide-themes:build`
or `npm run slide-themes:html` when only one step is needed.

## Apply Behavior

Applying a package is deterministic:

- `theme.packageId` is set to the package id.
- `theme.packageVersion` is set to the package version when available.
- Existing slides keep their `template`, `children`, `content`, `source`, and
  `localStyle`.
- Deck-level `theme.overrides` are preserved unless the caller explicitly
  replaces or clears them.

Node-level `localStyle` patches are explicit user edits and are resolved above
package styles until the user clears them.

## Template Identity

V7 slide identity is semantic. A slide stores its template provenance as:

```ts
SlideNode.template.kind;
SlideNode.template.layoutId;
```

Template kinds are global values such as `cover`, `comparison`, `roadmap`, and
`closing`; they are not prefixed with the package id. Package ids identify visual
style packages only.

## Editor Surfaces

The theme picker presents packages as the primary theme choices. Selecting a
theme package updates the deck's v7 theme binding.

The Add slide picker uses the global semantic template registry and groups
templates by metadata group: Opening, Core, Compare, Proof, Flow, Decision,
Business, and Closing.

Template metadata is registry-owned. It includes labels, group, priority,
best-use guidance, slot acceptance, capacity, and layout variants for AI and UI
consumers. It is not duplicated inside theme packages.

## Master Boundary

V7 has no slide masters in the active package path. Shared visual personality is
expressed as package styles and `ThemeDecorationRecipe` entries, then injected by
`resolveDeckRenderTree` according to slide chrome/decoration props.
