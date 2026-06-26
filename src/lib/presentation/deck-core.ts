/** Core persisted deck and slide schema types. */

import type { SlideFormat as PresentationSlideFormat } from "@/lib/presentation/slide-format";
import type {
  DeckThemeTokenSet,
  MasterSlide,
} from "@/lib/presentation/deck-theme-token-types";
import type { AssetReference, ResolvedAssetUrl } from "@/lib/asset-vocabulary";
import type { SlideElement, TextRun } from "./deck-elements";
import type { SlideLayout, SlideLayoutHint } from "./deck-layouts-model";
import { STYLE_THEME_IDS } from "./deck-theme-ids";

/** Increment this for future structural deck schema changes. */
export const CURRENT_DECK_SCHEMA_VERSION = 3;

/**
 * Canonical presentation theme names — derived from the visual style theme
 * catalog ({@link STYLE_THEME_IDS}) so both lists stay in sync automatically.
 * `"default"` is kept as the first entry for backward-compat with persisted
 * decks (removal is tracked in issue #1105).
 *
 * Exported as a `const` array so it is the single source of truth for both the
 * {@link DeckTheme} type and any code (validators, AI prompts) that needs to
 * enumerate the allowed values at runtime.
 */
export const DECK_THEMES = ["default", ...STYLE_THEME_IDS] as const;

/** Presentation themes — derived from the visual style theme catalog. */
export type DeckTheme = (typeof DECK_THEMES)[number];

/** A single slide in the presentation deck. */
export interface Slide {
  /** Stable unique identifier for the slide — persisted in `deckJson`. */
  id: string;

  /** Zero-based position in the deck. */
  index: number;

  /** Slide heading / title text (may be empty for the first/preamble slide). */
  title: string;

  /**
   * Optional rich-text runs for `title`, captured from the document heading so
   * emphasis (bold/italic/code/color/link) survives derivation. Additive: when
   * absent the title renders from the plain `title` string. Threaded into the
   * generated title {@link TextElement}'s `runs` by
   * {@link buildSlideElementsFromContent}.
   */
  titleRuns?: TextRun[];

  /**
   * Body bullet strings — truncated to at most `MAX_BULLETS` items.
   * Surplus text is moved to `notes`.
   */
  bullets: string[];

  /**
   * Optional rich-text runs, parallel to `bullets`: `bulletRuns[i]` holds the
   * formatted spans for visible bullet line `i`. Additive — absent entries fall
   * back to the plain `bullets[i]` string. Threaded into generated
   * {@link BulletsElement} values by {@link buildSlideElementsFromContent}.
   */
  bulletRuns?: TextRun[][];

  /**
   * Stable visual IDs attached to this slide.  Usually one entry; empty when
   * the slide has no visual content.
   */
  visualIds: string[];

  /** Renderer layout hint derived from the content composition. */
  layout: SlideLayoutHint;

  /** Speaker notes — overflow prose + quote blocks. */
  notes: string;

  /**
   * Free-form positioned elements. This is the authoritative slide content
   * consumed by renderers and exporters.
   */
  elements?: SlideElement[];

  /**
   * Editor-merge provenance flag (issue #221). `true` means `elements[]` was
   * produced by {@link buildSlideElementsFromContent} from document-derived
   * slide content and has not been hand-edited since. Any
   * genuine element edit (move/resize/text/style/add/delete) clears it to
   * `false`, marking the slide as hand-authored.
   *
   * "Sync from document" uses this to decide whether to re-materialize a slide's
   * `elements[]` from refreshed document content (when still derived) or to
   * preserve them verbatim (when hand-edited). Absent → treated as hand-edited.
   * Renderers ignore this field; it is pure editor-merge metadata.
   */
  elementsDerived?: boolean;

  /**
   * Stable identity key derived from the document heading this slide originated
   * from (issue #296). Frozen onto the slide by {@link buildDeckFromBlocks} as
   * an FNV-1a hex hash of the normalized heading text.  Survives a slide's
   * on-stage title rename: the existing slide keeps its frozen `sourceSectionId`
   * and re-derived fresh slides for the same unchanged document heading produce
   * the same id, so "Sync from document" can match them in Pass 0 before the
   * title-text pass. Excluded from `deck-hash` to avoid
   * false staleness signals.
   */
  sourceSectionId?: string;

  /** Optional per-slide background color (hex), overriding the theme bg. */
  background?: string;

  /**
   * Optional per-slide background gradient (two-stop linear). When set it takes
   * precedence over the solid `background` color. `angle` is in degrees.
   */
  backgroundGradient?: { from: string; to: string; angle?: number };

  /**
   * Optional per-slide background image (data URL or remote URL), rendered
   * cover. Takes precedence over the gradient and solid color when set.
   */
  backgroundImage?: ResolvedAssetUrl;

  /**
   * ID of the server-stored {@link Asset} row when this slide's background
   * was uploaded via the slide asset upload action (Epic #374, issue #393).
   * When present, renderers SHOULD resolve the URL via the asset resolver
   * rather than treating `backgroundImage` as canonical.
   */
  backgroundAssetId?: AssetReference;

  /** Optional per-slide accent color (hex), overriding the theme accent. */
  accent?: string;

  /**
   * Reference to a master slide id in `Deck.masters`.
   * When absent, the first master is used (or token-set defaults if no masters).
   */
  masterRef?: string;
}

/** A complete presentation deck derived from a document's block structure. */
export interface Deck {
  /** Ordered list of slides. */
  slides: Slide[];

  /**
   * Deck-level theme token id for typography, palette, background, and other
   * theme-scoped design tokens. Built-in decks use one of {@link DECK_THEMES};
   * custom/brand decks may use a custom token-set id and carry
   * {@link customTokenSet}.
   */
  themeId: string;

  /** Deck-wide slide format. Missing values render as 16:9. */
  slideFormat?: PresentationSlideFormat;

  /**
   * Optional reusable layout catalogue available to this deck. When absent,
   * callers may fall back to {@link defaultLayouts}.
   */
  layouts?: SlideLayout[];

  /**
   * Stable hash of the document content this deck was last derived/synced
   * against (see `deck-hash.ts`). Embedded in the persisted deck JSON — NO
   * schema change — so staleness can be detected without a separate column:
   * on open the editor recomputes the live content hash and compares it against
   * this value to surface `isDeckStale`. Absent values are treated as
   * "staleness unknown" and the banner stays hidden, while the manual
   * "Sync from document" action remains available.
   */
  deckContentHash?: string;

  /**
   * Monotonically-increasing deck schema version. Persisted decks must carry
   * the current version and `safeParseDeck` rejects any other version.
   */
  schemaVersion?: number;

  /**
   * Optional master slide catalogue. Each entry defines structural chrome
   * (background, logo, footer, page numbers) shared by slides that reference
   * that master via `Slide.masterRef`.
   */
  masters?: MasterSlide[];

  /**
   * Custom token set generated from a brand application.
   * When present, resolvers prefer this over the built-in set for `themeId`.
   */
  customTokenSet?: DeckThemeTokenSet;
}
