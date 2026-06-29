# Professional Slide Themes (v6)

Eight production-ready presentation themes authored against the current **v6 deck
data model** (`src/lib/presentation/deck-core.ts`). Each theme is a complete,
schema-valid `Deck` you can drop into the editor: a custom `PresentationTheme`
(colors + typography + spacing + shape tokens), a chrome-free master, and a
27-slide semantic template source deck materialized from package JSON.

`prototypes/slide-themes/packages/*.package.json` is the source of truth for the
prototype package pipeline. Generated decks, runtime package sources, manifest,
and previews are derived from those package JSON files.

## How it's built (uses existing system capabilities)

- `packages/*.package.json` — authoring source for the eight theme packages.
  Edit these files to change package tokens, masters, or template elements.
- `theme-kit.ts` — legacy typed builders and package materialization helpers.
  Current package-json-backed generation does not use it to author packages.
- `themes.ts` — package source id manifest used to keep generation order stable.
- `render-family-layouts.ts` — legacy fallback grammar for themes that do not
  provide package templates. The current package-json-backed pipeline does not
  use it.
- `build-themes.ts` — reads `packages/<id>.package.json`, validates it with the
  real **`safeParseDeck`** validator, writes `decks/<id>.deck.json`, copies the
  source to runtime `theme-package-sources/<id>.package.json`, and updates
  `manifest.json`.
- `render-html.mjs` — reads `packages/<id>.package.json` and writes static
  **HTML previews** under `preview/` (one page per theme + an `index.html`
  gallery).

Regenerate (decks first, then previews):

```bash
node --import tsx prototypes/slide-themes/build-themes.ts
node prototypes/slide-themes/render-html.mjs
```

Preview them (the integrated browser blocks `file://`, so serve over HTTP):

```bash
cd prototypes/slide-themes/preview && python3 -m http.server 8777
# open http://localhost:8777/index.html
```

The custom theme rides on `Deck.design.themeOverrides.tokenSet`, which
`resolvePresentationThemeTokens` reads — so the render model, present mode,
public viewer, and PPTX export all pick up the palette and fonts automatically.

## Design system notes

- **Masters are chrome-free** for the current packages because the package
  templates already include visible slide chrome such as kind labels and page
  numbers as ordinary text elements.
- **Color tokens** allowed in `ColorRef` are `slideBg, surface, accent, onBg,
onSurface, muted`; everything else uses concrete `{ value: "#hex" }`.
- Each preview deck includes a slide for every semantic template kind in
  `THEME_PACKAGE_TEMPLATE_KINDS`. Runtime packages use the generated
  `SlideTemplate` sources directly rather than re-reading preview deck slides.
  The current templates are native package JSON components: text, shape,
  gradients, fills, strokes, and effects rendered by the same preview renderer.

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
for source packages, and `decks/*.deck.json` for generated preview decks.
