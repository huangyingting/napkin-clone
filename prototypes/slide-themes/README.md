# Professional Slide Themes (v6)

Eight production-ready presentation themes authored against the current **v6 deck
data model** (`src/lib/presentation/deck-core.ts`). Each theme is a complete,
schema-valid `Deck` you can drop into the editor: a custom `PresentationTheme`
(colors + typography + spacing + shape tokens), a chrome **master**
(footer + page number), and a 43-slide semantic template source deck whose
render-family layouts and **decorative shapes/effects** give the theme its
personality.

Everything here is generated and validated by code, not hand-edited JSON, so the
output always matches the live schema.

## How it's built (uses existing system capabilities)

- `theme-kit.ts` — typed builders for text/shape/image elements, radial fills,
  glass panels, semantic fixed shapes (`circle` / `square`), the master, the
  custom `tokenSet`, and the deck wrapper. Geometry is in slide percentages;
  text `fontSize` is a percent of slide height (same convention as
  `slide-templates.ts`). Self-hosted `fontId`s come from `slide-fonts.ts`.
- `themes.ts` — the eight `ThemeSpec`s (palette, fonts, signature shapes, copy).
- `render-family-layouts.ts` — render-family grammar (shared family chrome,
  panel/card/image treatments, gradients, shapes, font pairing) so each of the
  43 semantic templates looks bespoke while templates in the same family stay
  visually related.
- `build-themes.ts` — builds each deck, validates it with the real
  **`safeParseDeck`** validator, and writes `decks/<id>.deck.json` + `manifest.json`.
- `render-html.mjs` — renders the validated decks into static **HTML previews**
  under `preview/` (one page per theme + an `index.html` gallery). The HTML
  mirrors the live slide canvas exactly: percent-positioned boxes, `cqh` font
  units, the same shape fill/stroke/clip-path rules, and the
  slide → master → theme background cascade. Fonts load from Google Fonts.

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

- **Masters are chrome-only** in v6 (logo / footer / pageNumber / watermark with
  fixed kind/role/layer), so decorative geometry lives on slides as `locked`
  shape elements. This is intentional and matches the schema.
- **Color tokens** allowed in `ColorRef` are `slideBg, surface, accent, onBg,
onSurface, muted`; everything else uses concrete `{ value: "#hex" }`.
- Each deck includes a source slide for every semantic template kind in
  `THEME_PACKAGE_TEMPLATE_KINDS`. Shared render-family grammar keeps related
  templates consistent while allowing background/motif variants.

## The eight themes

| #   | Theme         | Use case                  | Heading / Body                 | Accent    | Signature shapes                                               |
| --- | ------------- | ------------------------- | ------------------------------ | --------- | -------------------------------------------------------------- |
| 1   | **Clarity**   | Business decisions        | Inter / Source Sans 3          | `#2563eb` | Crisp rules, square/circle motifs, restrained glass cards      |
| 2   | **Ocean**     | Product / data review     | Space Grotesk / Inter          | `#0284c7` | Radial current fields, circle/diamond motifs, glass cards      |
| 3   | **Aurora**    | Tech / SaaS keynote       | Space Grotesk / Inter          | `#6366f1` | Radial glow, circle/diamond/triangle motifs, glass panels      |
| 4   | **Monolith**  | Corporate / consulting    | IBM Plex Sans                  | `#b3892f` | Square/diamond geometry, dark fields, sharp glass surfaces     |
| 5   | **Editorial** | Magazine / brand story    | Source Serif 4 / Source Sans 3 | `#e0533b` | Paper-like grids, square/diamond motifs, light glass surfaces  |
| 6   | **Noir**      | Premium pitch deck        | Manrope / Inter                | `#f5b301` | Amber radial glow, diamond/circle motifs, dark glass cards     |
| 7   | **Terra**     | Sustainability / research | Manrope / Source Sans 3        | `#c2683f` | Organic circles/ellipses, earthy radial fields, soft glass     |
| 8   | **Pulse**     | Bold startup / marketing  | Space Grotesk / Manrope        | `#ec2d6f` | Triangle/diamond motifs, high-contrast fields, energetic glass |

See `manifest.json` for the machine-readable index and `decks/*.deck.json` for
the full decks.
