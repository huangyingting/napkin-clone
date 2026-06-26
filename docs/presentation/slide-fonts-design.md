# Presentation Slide Font System Design

**Status:** Implemented (element-level); see Implementation Status below  
**Last updated:** 2026-06-26

This document records the accepted design for adding font support to TextIQ
presentation slides without depending on fonts installed on the user's local
machine. The core of this design is implemented; see the runtime contract in
[rendering-and-export.md](rendering-and-export.md). The sections below describe
the intended design; the Implementation Status section records what shipped and
what was intentionally deviated or deferred.

## Implementation Status

Implemented:

- Self-hosted font registry and assets (`src/lib/presentation/slide-fonts.ts`,
  `public/fonts/slides/`, `src/app/slide-fonts.css`).
- Element-level `fontId` (`TextElementStyle.fontId`) with schema version bump
  and validation; the cascade resolves `fontId` to a CSS stack.
- Inspector and deck-template font pickers backed by the registry.
- Self-hosted CJK fallback (`Noto Sans SC`) appended to every resolved role
  token via `ensureCjkFallback`, so theme-default Chinese text is deterministic.
- Editable PPTX font mapping (Latin + CJK-aware) and a non-blocking
  `font-cjk-mapping` preflight notice for Chinese decks.
- Font readiness: shrink-to-fit re-measures once fonts load; PDF/PNG export and
  present mode preload via `loadSlideFonts()`.

Deviated / deferred:

- **Theme-level `bodyFontId` / `headingFontId` not migrated.** Deck/theme and
  brand typography remain CSS stacks because brand styles carry arbitrary,
  user-authored font names that cannot be registry ids. Cross-platform CJK
  determinism for theme text is instead achieved by `ensureCjkFallback`.
- **No deck migration ramp.** The codebase uses strict schema-version
  validation with rebuild-from-blocks on mismatch; a bumped version means old
  persisted decks rebuild rather than transform in place.
- **Latin determinism for non-bundled theme fonts.** A few built-in themes still
  reference non-self-hosted Latin families (e.g. Avenir Next); these are not
  pixel-deterministic until remapped to bundled fonts.
- **E2E screenshot coverage** for English and Simplified-Chinese decks is not
  yet added.

## Problem Statement

Slide text currently flows through CSS `font-family` strings in renderer and
export paths. That gives the browser and PPTX client room to substitute local
fonts. The result can vary across Linux, Windows, macOS, PowerPoint, Keynote,
LibreOffice, and browser environments.

The product goal is to make TextIQ's in-app slide editing and presentation
experience visually stable across operating systems by using fonts controlled by
TextIQ. The export goal is different: exported PPTX must remain editable, so
TextIQ cannot rasterize each slide into an image to preserve exact pixels.

## Accepted Product Promise

TextIQ will make slide fonts deterministic inside TextIQ-owned rendering
surfaces:

- authenticated slide editor;
- thumbnail rail and inline editing surfaces;
- in-app present mode;
- public present/share/embed viewers;
- any browser-based image/PDF paths that render through the slide canvas.

Editable PPTX export remains the only PPTX export option. It preserves editable
native text and shapes, but it cannot guarantee pixel-identical typography on
every client. PPTX export will use a fixed self-hosted-font-to-Office-font
mapping and surface a fidelity warning when the exported editable file may
differ from the TextIQ preview.

## Goals

1. Use TextIQ-controlled, self-hosted fonts for presentation slides inside the
   app and public viewers.
2. Store stable font identifiers in deck data instead of raw CSS font stacks.
3. Support deck/theme-level body and heading fonts plus element-level overrides.
4. Provide automatic CJK fallback for Simplified Chinese without exposing a
   second font selector to users.
5. Keep editable PPTX export as native text and map slide font ids to fixed
   PPTX font faces.
6. Replace the presentation slide font schema cleanly because this is still a
   development version.
7. Keep the first implementation scoped to presentation slides.

## Non-Goals

1. No rasterized "exact PPTX" mode in the first implementation.
2. No run-level rich text font selection.
3. No arbitrary user font uploads in the slide font picker.
4. No Brand Studio custom font passthrough into slide typography.
5. No long-term compatibility layer for old `fontFamily` deck payloads.
6. No guarantee that editable PPTX typography is pixel-identical across Office,
   Keynote, LibreOffice, Windows, macOS, and Linux.
7. No global unification of presentation, visual, and brand font systems.

## Current Context

The presentation renderer resolves text style through the slide canvas and style
cascade. The export path builds pure deck specs and applies them through
PptxGenJS. Today, the PPTX side can pass a font face string, but it does not
embed browser `@font-face` data into the PPTX file.

Relevant current documents and code:

| Area                          | Reference                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Rendering/export contract     | [rendering-and-export.md](rendering-and-export.md)                                                                 |
| Deck data model               | [../data-model/deck.md](../data-model/deck.md)                                                                     |
| Theme and layout cascade      | [../editor/theme-layout.md](../editor/theme-layout.md)                                                             |
| Brand Studio font upload path | [../product/brand-studio.md](../product/brand-studio.md)                                                           |
| Font face helper              | [`src/lib/brand/font-face.ts`](../../src/lib/brand/font-face.ts)                                                   |
| Export style adapter          | [`src/lib/presentation/render-export-style-adapter.ts`](../../src/lib/presentation/render-export-style-adapter.ts) |
| PPTX deck export              | [`src/lib/visual/deck-export.ts`](../../src/lib/visual/deck-export.ts)                                             |
| Export preflight              | [`src/lib/visual/export-preflight.ts`](../../src/lib/visual/export-preflight.ts)                                   |

## Core Decision

Presentation slide fonts will be modeled as registry-backed `fontId` values.
The registry is the only source of truth for:

- display labels;
- CSS font family names;
- CSS fallback stacks;
- self-hosted font asset URLs;
- supported weights and styles;
- coverage metadata;
- PPTX export font mapping;
- license/source metadata.

Raw CSS `fontFamily` strings should not be persisted in slide deck data after
the schema migration.

## Font Registry

Add a presentation-owned registry, for example:

```text
src/lib/presentation/slide-fonts.ts
```

The registry should be consumable by schema validation, style cascade,
renderer-facing adapters, inspector controls, font preloading, PPTX export, and
tests.

Illustrative shape:

```ts
export type SlideFontId = keyof typeof SLIDE_FONTS;

export const SLIDE_FONTS = {
  inter: {
    id: "inter",
    label: "Inter",
    cssFamily: "Inter",
    cssStack: "'Inter', 'Noto Sans SC', sans-serif",
    pptxFontFace: "Aptos",
    pptxFallbackFontFace: "Arial",
    pptxCjkFontFace: "Microsoft YaHei",
    coverage: ["latin", "sc"],
    assets: [
      {
        weight: 400,
        style: "normal",
        url: "/fonts/slides/inter-v4-latin-400.woff2",
      },
      {
        weight: 700,
        style: "normal",
        url: "/fonts/slides/inter-v4-latin-700.woff2",
      },
    ],
    license: "OFL-1.1",
    source: "https://example.invalid/source-metadata",
  },
} as const;
```

The implementation should expose helpers such as:

- `isSlideFontId(value)`;
- `resolveSlideFont(fontId)`;
- `slideFontCssStack(fontId)`;
- `slideFontPptxFace(fontId, text)`;
- `collectDeckFontIds(deck)`;
- `buildSlideFontFaceCss(fontIds)`.

The `slideFontPptxFace` helper should be content-aware enough to use a CJK PPTX
font face for primarily Chinese text.

## Font Asset Storage

MVP font files should live in the repo under:

```text
public/fonts/slides/
```

This keeps local development, CI, Playwright screenshots, and production builds
deterministic without introducing an object-storage publishing pipeline.

Rules:

- use `.woff2` files only;
- use versioned file names;
- include license and source metadata near the font files;
- do not copy system fonts into the repo;
- do not reference third-party font CSS at runtime;
- add tests that fail when registry asset URLs do not exist.

Allowed font families must have licenses that permit redistribution and web
embedding. The MVP should start with a focused bundle that covers the common
deck styles without turning the picker into a font catalog.

## Recommended MVP Bundle

The first bundled set should use the fonts' own names as ids and CSS family
names. TextIQ controls hosting and versioning, but it should not rename the
fonts with a product prefix.

| `fontId`         | Family         | Deck use                                            | Suggested role                         | Editable PPTX mapping                          |
| ---------------- | -------------- | --------------------------------------------------- | -------------------------------------- | ---------------------------------------------- |
| `inter`          | Inter          | Default polished business decks, dense UI-like text | Default body and safe heading font     | `Aptos`, fallback `Arial`                      |
| `source-sans-3`  | Source Sans 3  | Long-form explanatory slides and readable body copy | Alternate body font                    | `Aptos`, fallback `Arial`                      |
| `ibm-plex-sans`  | IBM Plex Sans  | Technical, data, enterprise, and product decks      | Technical body and heading font        | `Aptos`, fallback `Arial`                      |
| `manrope`        | Manrope        | Modern product and startup-style decks              | Soft geometric heading and body font   | `Aptos`, fallback `Arial`                      |
| `space-grotesk`  | Space Grotesk  | Distinctive titles, section breaks, visual decks    | Expressive heading font                | `Aptos Display` if available, fallback `Arial` |
| `source-serif-4` | Source Serif 4 | Editorial, strategy, academic, and report decks     | Serif heading or accent body font      | `Georgia`, fallback `Times New Roman`          |
| `jetbrains-mono` | JetBrains Mono | Code, data labels, technical callouts               | Monospace/code font                    | `Consolas`, fallback `Courier New`             |
| `noto-sans-sc`   | Noto Sans SC   | Simplified Chinese text and CJK fallback            | Default CJK fallback and CJK body font | `Microsoft YaHei`, fallback `DengXian`         |

This gives the editor a strong default (`inter`), two body alternatives
(`source-sans-3`, `ibm-plex-sans`), two more expressive sans options
(`manrope`, `space-grotesk`), one serif option (`source-serif-4`), one mono
option (`jetbrains-mono`), and one Simplified Chinese fallback (`noto-sans-sc`).

Useful default pairings:

- `inter` body with `space-grotesk` headings for crisp product decks;
- `source-sans-3` body with `source-serif-4` headings for editorial decks;
- `ibm-plex-sans` body with `jetbrains-mono` code labels for technical decks;
- `manrope` body and headings for softer modern decks;
- `noto-sans-sc` as the automatic CJK fallback for all Latin families.

Noto Serif SC is a good future addition for formal Chinese decks, but it should
not be in the first bundle unless the CJK subset strategy is already solved.
CJK fonts should be subset or split carefully to avoid excessive download size.

## Data Model

The presentation deck schema should use stable font ids.

Deck or token-level typography should carry body and heading font ids:

```ts
type TypographyToken = {
  bodyFontId: SlideFontId;
  headingFontId?: SlideFontId;
  scale: FontScale;
};
```

Text-like elements may override the inherited font:

```ts
type TextStyle = {
  fontId?: SlideFontId;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  align: ElementAlign;
};
```

The cascade order should be:

1. element `style.fontId`;
2. semantic role font from deck/theme token;
3. deck typography body font;
4. registry default font.

Rich text runs should not get font ids in the first implementation. Runs keep
existing formatting such as bold, italic, underline, color, and code styling.

## Schema Migration

Because the product is still in development, the implementation should bump the
deck schema version and migrate directly from `fontFamily` strings to `fontId`
values without preserving long-term runtime compatibility.

Migration rules:

- known existing font family strings map to explicit registry ids;
- built-in or Office-oriented families that still matter become registry items;
- unknown font families map to the default slide font;
- fixtures, tests, docs, builders, and AI prompt contracts update to the new
  shape in the same change;
- runtime render/export code consumes only `fontId` after migration.

This follows the project rule that source, tests, and schemas are authoritative
and that superseded payload shapes do not get permanent compatibility layers.

## Rendering Runtime

The renderer should resolve `fontId` through the registry before producing CSS:

```text
fontId -> registry entry -> @font-face rules + CSS font stack
```

The CSS stack should include the selected TextIQ Latin font and a self-hosted
CJK fallback. Users choose a single logical font; they do not separately choose
a Chinese fallback.

Example CSS stack:

```css
'Inter', 'Noto Sans SC', sans-serif
```

The slide canvas, inline text editor, present mode, public viewers, and any
thumbnail surfaces should all use the same registry resolution. Isolated
previews should use the same default registry font as full deck rendering.

## Font Loading And Readiness

Slide rendering should not complete final layout using a fallback font and then
swap to the real font. That can change line breaks, shrink behavior, overflow,
and exported geometry.

Runtime strategy:

- collect font ids used by the current deck or active slide;
- inject the registry-owned `@font-face` rules;
- call `document.fonts.load(...)` for needed weights/styles;
- gate final slide text rendering until the current slide's fonts are ready;
- present/export paths should await required font readiness before capturing or
  generating output;
- font loading timeout should produce a visible error or warning rather than a
  silent wrong-font render.

Application-level gating is preferred over `font-display: swap` for slide
surfaces. If CSS uses `font-display`, it should not undermine deterministic
layout.

## UI Scope

The first implementation should support:

- theme-level body font selection;
- theme-level heading font selection;
- text box and bullet element font override;
- no run-level font selector;
- no arbitrary font family text input.

The font picker should list registry entries, grouped if useful by product
intent such as default, expressive, serif, monospace, or CJK-friendly. It should
not expose raw CSS stacks or arbitrary URLs.

## Weight And Style Scope

MVP should support the styles currently needed by slide text:

- 400 normal;
- 600 normal when a theme needs semibold headings;
- 700 normal for bold;
- 400 italic when italic is available.

The UI should not expose arbitrary weight controls. If a font does not include a
real italic asset, the implementation should either avoid offering italic for
that font or fall back to a registry font that supports italic. Synthetic italic
should not be treated as deterministic typography.

## Editable PPTX Export

Editable PPTX export stays native. It should not rasterize entire slides into
images. This preserves editable text, but means typography is ultimately laid
out by the PPTX client.

Export mapping:

```text
fontId -> registry pptxFontFace -> PptxGenJS fontFace
```

Example:

```ts
{
  id: "inter",
  cssFamily: "Inter",
  pptxFontFace: "Aptos",
  pptxFallbackFontFace: "Arial",
  pptxCjkFontFace: "Microsoft YaHei"
}
```

The PPTX export adapter should map resolved `fontId` values to PPTX font faces.
For mostly Chinese text, it should choose the registry's CJK PPTX face when
available. Mixed Latin/CJK text can remain a single run in the first
implementation; perfect script-level splitting is out of scope.

The existing shrink behavior in PPTX export should remain the primary overflow
mitigation. Export should preserve authored boxes and avoid trying to re-layout
slides against Office font metrics in the browser.

## PPTX Fidelity Warning

Preflight should warn, but not block, when editable PPTX export maps TextIQ
self-hosted fonts to Office-oriented font faces.

The user-facing message should be direct:

```text
Editable PPTX uses Office-compatible font mappings. Text may look slightly
different from the TextIQ preview on machines that do not have the mapped font.
```

Additional high-risk warnings may be useful for:

- long titles in narrow boxes;
- dense Chinese text;
- text with fit modes that do not shrink;
- text that already nearly fills its box.

These warnings should not set `hasFatal` and should not prevent export.

## CJK Handling

The first implementation should support stable in-app rendering for Latin and
Simplified Chinese. Other scripts can use browser fallback until the registry
adds explicit coverage.

Principles:

- every logical slide font stack includes the self-hosted CJK fallback;
- users do not manually select a CJK fallback;
- the PPTX exporter uses a CJK face when text is primarily Chinese;
- mixed-script text can remain best effort in editable PPTX;
- visual differences in exported PPTX are documented as a known editable-export
  limitation.

## Brand And Visual Boundaries

This design only covers presentation slides.

Visual renderer fonts and Brand Studio custom fonts keep their existing paths.
Brand Studio font upload does not feed the slide font picker in the MVP. If a
brand is converted to a deck theme, its custom font should map to the nearest
registry slide font or the default slide font instead of introducing a tenant
font into deck typography.

Future support for uploaded brand fonts in slides would require a tenant-scoped
font registry, license acceptance, font validation, subset strategy, PPTX
mapping, and additional preflight checks. That is explicitly out of scope for
the first implementation.

## Implementation Sequence

1. Add `slide-fonts` registry and static font directory structure.
2. Add the recommended MVP font bundle and license/source metadata for every
   bundled font.
3. Add registry tests for ids, asset existence, coverage, and PPTX mapping.
4. Change deck schema/types from `fontFamily` to `fontId` and bump schema
   version.
5. Update fixtures, builders, tests, and docs to the current shape.
6. Update theme typography and token resolution to use font ids.
7. Update style cascade and renderer adapters to resolve CSS stacks.
8. Update slide canvas, inline editor, inspector, thumbnails, present mode, and
   public viewers to use registry-resolved fonts.
9. Add font-face injection and font readiness gating for slide surfaces.
10. Update editable PPTX export to map `fontId` to PPTX font faces.
11. Update export preflight to warn about editable PPTX font mapping and high
    risk overflow cases.
12. Update product/docs copy for the new font guarantee and PPTX limitation.

## Test Plan

Unit tests should cover:

- registry ids are unique and stable;
- every registry asset URL points to a file under `public/fonts/slides/`;
- every registry font has a PPTX mapping;
- default font coverage includes Latin plus the configured CJK fallback;
- schema accepts legal `fontId` values and rejects illegal ones;
- migrated fixtures do not contain persisted `fontFamily` fields;
- style cascade resolves inherited font ids correctly;
- element-level font ids override role/theme fonts;
- renderer adapters return CSS stacks, not raw persisted ids;
- export adapters map `fontId` to `fontFace`;
- Chinese-majority text selects the CJK PPTX mapping;
- preflight warns for editable PPTX font mapping and does not block export.

Integration or E2E coverage should include:

- an English slide using a bundled self-hosted font;
- a Simplified Chinese slide using the bundled CJK fallback;
- editor or present-mode screenshots after fonts are ready;
- PPTX export specs containing the mapped Office-compatible font faces.

## Invariants

1. Presentation slide deck data stores `fontId`, not raw CSS font stacks.
2. `slide-fonts` registry is the presentation slide font source of truth.
3. TextIQ render surfaces use self-hosted font assets.
4. Editable PPTX export maps font ids to native PPTX font faces.
5. Editable PPTX export does not promise pixel-identical typography.
6. Brand Studio uploaded fonts do not enter slide typography in the MVP.
7. The implementation does not carry a permanent `fontFamily` compatibility
   branch.

## Risks And Mitigations

| Risk                                         | Mitigation                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| CJK font files increase bundle size          | Use WOFF2, subset or split CJK coverage, and load only fonts used by the active deck. |
| PPTX clients substitute mapped fonts         | Warn during export and choose conservative Office-oriented mappings.                  |
| Font readiness delays first paint            | Gate only the active slide when possible and cache loaded font promises.              |
| Migration drops unknown custom font strings  | Map unknowns to the default registry font and keep migration tests explicit.          |
| Brand fonts create inconsistent slide output | Keep Brand Studio custom fonts outside the slide font registry for MVP.               |

## Open Follow-Up Work

- Verify exact upstream versions, license files, source metadata, and subset
  commands for the recommended MVP font bundle.
- Validate the proposed editable PPTX mappings against current PowerPoint,
  Keynote, and LibreOffice behavior.
- Decide the font loading timeout and user-facing error behavior.
- Decide whether future uploaded brand fonts should become tenant registry
  entries with explicit PPTX mappings.
