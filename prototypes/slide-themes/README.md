# Professional Slide Themes (v7)

Eight production-ready presentation themes authored against the current **v7
semantic deck model** (`src/lib/presentation-vnext/schema.ts`). Each theme is a
native `ThemePackageV1` source plus a schema-valid `DeckV7` preview generated
from the v7 semantic template registry.

`prototypes/slide-themes/theme-packages-v7.ts` is the source of truth for the
prototype package pipeline. Generated package JSON, preview decks, manifest, and
HTML previews are derived from that v7 source. Legacy v6 package JSON is not read
or upgraded by the generator.

## How it's built (uses existing system capabilities)

- `theme-packages-v7.ts` — native `ThemePackageV1` source for the eight theme
  packages. Edit this file to change tokens, styles, or decorations.
- `build-themes.ts` — validates each `ThemePackageV1`, compiles every semantic
  template kind into a native `DeckV7` preview deck with `safeParseDeckV7`,
  writes `packages/<id>.package.json`, writes `decks/<id>.deck.json`, and
  updates `manifest.json`.
- `render-html.ts` — reads generated v7 packages/decks, resolves the shared v7
  render tree, and writes static **HTML previews** under `preview/`.

Regenerate (decks first, then previews):

```bash
npm run slide-themes:generate
```

To run the steps separately, use `npm run slide-themes:build` for v7 package and
deck validation, and `npm run slide-themes:html` for static HTML preview
rendering.

Preview them (the integrated browser blocks `file://`, so serve over HTTP):

```bash
cd prototypes/slide-themes/preview && python3 -m http.server 8777
# open http://localhost:8777/index.html
```

The custom theme rides on `DeckV7.theme.packageId` plus a loaded
`ThemePackageV1`. `resolveDeckRenderTree` resolves package tokens, styles, and
decorations before the preview, editor, present mode, public viewer, and export
adapters consume the render tree.

## Design system notes

- **No v6 masters or `Slide.elements[]`** are generated. Templates compile into
  `SlideNode` trees and visual language comes from package style refs.
- **Theme packages own tokens, styles, and decorations only.** Semantic template
  layout stays in `src/lib/presentation-vnext/theme-packages.ts`.
- Each preview deck includes a slide for every semantic template kind in
  `SEMANTIC_TEMPLATE_KINDS` and is validated with `safeParseDeckV7`.

## The eight themes

| #   | Package id    | Style                 | Heading / Body          | Accent    | Signature shapes                                   |
| --- | ------------- | --------------------- | ----------------------- | --------- | -------------------------------------------------- |
| 1   | **clarity**   | Swiss Minimal Grid    | Space Grotesk / Mono    | `#0042ff` | Grid lines, square cells, precise rules            |
| 2   | **ocean**     | Iridescent Gradient   | Space Grotesk / Inter   | `#7b5cff` | Holographic fields, glass cards, gradient text     |
| 3   | **aurora**    | Dark Aurora Corporate | Manrope / Mono          | `#5b6cff` | Luminous rings, radial glow, dark glass            |
| 4   | **monolith**  | Brutalist Bold        | Space Grotesk / Mono    | `#ff3b1f` | Hard blocks, black fields, lime accents            |
| 5   | **editorial** | Editorial Serif Luxe  | Source Serif 4 / Inter  | `#2f3d8f` | Serif hierarchy, cobalt rings, gold accents        |
| 6   | **noir**      | Luxe Maroon Magazine  | Source Serif 4 / Inter  | `#c9a24a` | Magazine frames, maroon silk glow, gold rules      |
| 7   | **terra**     | Vibrant Pop           | Space Grotesk / Manrope | `#ff2d2d` | Pop dots, hard-edged cards, yellow/red/blue fields |
| 8   | **pulse**     | Tech Terminal Mono    | JetBrains Mono          | `#39ff88` | Scan lines, terminal cards, neon mono emphasis     |

See `manifest.json` for the machine-readable index, `packages/*.package.json`
for generated v7 theme packages, and `decks/*.deck.json` for generated `DeckV7`
preview decks.
