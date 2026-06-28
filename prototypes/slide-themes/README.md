# Professional Slide Themes (v6)

Six production-ready presentation themes authored against the current **v6 deck
data model** (`src/lib/presentation/deck-core.ts`). Each theme is a complete,
schema-valid `Deck` you can drop into the editor: a custom `PresentationTheme`
(colors + typography + spacing + shape tokens), a chrome **master**
(footer + page number), and a six-slide demo deck whose layouts and **decorative
shapes** give the theme its personality.

Everything here is generated and validated by code, not hand-edited JSON, so the
output always matches the live schema.

## How it's built (uses existing system capabilities)

- `theme-kit.ts` — typed builders for text/shape/image elements, the master, the
  custom `tokenSet`, and the deck wrapper. Geometry is in slide percentages;
  text `fontSize` is a percent of slide height (same convention as
  `slide-templates.ts`). Self-hosted `fontId`s come from `slide-fonts.ts`.
- `themes.ts` — the six `ThemeSpec`s (palette, fonts, signature shapes, copy).
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
- Each deck demonstrates the same six layouts: **cover, section divider,
  content, two-column, headline stat / pull-quote, closing**.

## The six themes

| #   | Theme         | Use case                  | Heading / Body                 | Accent    | Signature shapes                                              |
| --- | ------------- | ------------------------- | ------------------------------ | --------- | ------------------------------------------------------------- |
| 1   | **Aurora**    | Tech / SaaS keynote       | Space Grotesk / Inter          | `#6366f1` | Soft gradient glow ellipses, accent spine bars, rounded cards |
| 2   | **Monolith**  | Corporate / consulting    | IBM Plex Sans                  | `#b3892f` | Navy sidebar, gold rules & ticks, zero-radius panels          |
| 3   | **Editorial** | Magazine / brand story    | Source Serif 4 / Source Sans 3 | `#e0533b` | Hairline frame, oversized quote marks, coral underlines       |
| 4   | **Noir**      | Premium pitch deck        | Manrope / Inter                | `#f5b301` | Amber glow ellipses, dot rows, dark cards                     |
| 5   | **Terra**     | Sustainability / research | Manrope / Source Sans 3        | `#c2683f` | Organic leaf ellipses, deep-radius cards, forest fields       |
| 6   | **Pulse**     | Bold startup / marketing  | Space Grotesk / Manrope        | `#ec2d6f` | Diagonal triangle wedges, orbs, hot gradients                 |

See `manifest.json` for the machine-readable index and `decks/*.deck.json` for
the full decks.
