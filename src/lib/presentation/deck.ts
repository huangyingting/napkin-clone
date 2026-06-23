/**
 * Deck / slide data model and the pure article→slides transform.
 *
 * Design goals:
 *  - Pure and headless — no DOM, no React, no browser APIs.  Fully testable
 *    under `node --test`.
 *  - Block types are reused from `document-export.ts` rather than redefined;
 *    import them and never duplicate the schema.
 *  - Deterministic: the same block list always produces the same deck.
 *
 * Grouping rules implemented by `buildDeckFromBlocks`:
 *  1. An **h1** heading always opens a new title/section slide.
 *  2. An **h2** heading opens a new content slide whose title is carried forward
 *     as the section context for subsequent h2+ slides.
 *  3. **Paragraphs and list items** after the first `MAX_BULLETS` bullets are
 *     demoted to speaker notes on the current slide rather than shown as body
 *     bullets.  This keeps visible slide content tight.
 *  4. A **visual block** is attached to the current slide if the slide has no
 *     visual yet; otherwise it gets its own dedicated media slide.
 *  5. An **hr** (horizontal rule) acts as an explicit slide boundary — it flushes
 *     the current slide and starts a new one carrying the previous section title.
 *  6. Blocks that arrive before any heading are collected onto a preamble slide
 *     with an empty title.
 *
 * ---------------------------------------------------------------------------
 * Element-first slide schema
 * ---------------------------------------------------------------------------
 *
 * Every persisted slide carries an `elements[]` array of positioned
 * {@link SlideElement}s. The flat `title` / `bullets` / `visualIds` fields are
 * retained as document-sync metadata, but renderers and editing surfaces read
 * the element list.
 */

import {
  DEFAULT_SLIDE_FORMAT as DEFAULT_DECK_SLIDE_FORMAT,
  SLIDE_FORMATS as PRESENTATION_SLIDE_FORMATS,
  type SlideFormat as PresentationSlideFormat,
} from "@/lib/presentation/slide-format";
import type { DocumentBlock } from "@/lib/visual/document-export";
import type {
  DeckThemeTokenSet,
  MasterSlide,
} from "@/lib/presentation/deck-theme-tokens";
import { fnv1aHash32 } from "@/lib/presentation/fnv-hash";

/**
 * Computes a stable `sourceSectionId` from a heading text string using the
 * shared {@link fnv1aHash32} utility (issue #487). The circular-import concern
 * that previously required a local copy is resolved by the new shared module.
 */
// fnv1aHash32 is imported at the top of the file.

/**
 * Returns a deterministic stable id for a document section whose heading text
 * is `title`. Returns `undefined` for empty/blank headings so that untitled
 * slides keep the index-based fallback matching instead.
 */
function computeSectionId(title: string): string | undefined {
  const key = title.trim().toLowerCase();
  return key ? fnv1aHash32(key) : undefined;
}

export {
  DEFAULT_SLIDE_FORMAT,
  SLIDE_FORMAT_CONFIGS,
  SLIDE_FORMATS,
  resolveSlideFormat,
  slideAspectRatio,
  slideFormatConfig,
  type SlideFormat,
} from "@/lib/presentation/slide-format";

// ---------------------------------------------------------------------------
// Deck / Slide types
// ---------------------------------------------------------------------------

/** Increment this for future structural deck schema changes. */
export const CURRENT_DECK_SCHEMA_VERSION = 2;

/**
 * Canonical presentation theme names — mirrors the Visual theme palette names.
 * Exported as a `const` array so it is the single source of truth for both the
 * {@link DeckTheme} type and any code (validators, AI prompts) that needs to
 * enumerate the allowed values at runtime.
 */
export const DECK_THEMES = [
  "indigo",
  "ocean",
  "forest",
  "sunset",
  "grape",
  "default",
] as const;

/** Presentation themes — mirrors the Visual theme palette names. */
export type DeckTheme = (typeof DECK_THEMES)[number];

/**
 * Canonical slide layout hints. Exported as a `const` array so it is the single
 * source of truth for both the {@link SlideLayoutHint} type and any code
 * (validators, AI prompts) that needs to enumerate the allowed values.
 *
 * - `"title"` — large centred title, optional subtitle; no bullets.
 * - `"section"` — section divider (h1 mid-deck).
 * - `"content"` — title + bullet list, optional media.
 * - `"media"` — visual occupies most of the slide; optional caption.
 * - `"blank"` — fallback for unusual combinations.
 */
export const SLIDE_LAYOUTS = [
  "title",
  "section",
  "content",
  "media",
  "blank",
] as const;

/** Slide layout hint used by a future renderer. */
export type SlideLayoutHint = (typeof SLIDE_LAYOUTS)[number];

/** Runtime list of supported reusable placeholder slot kinds. */
export const PLACEHOLDER_TYPES = [
  "title",
  "subtitle",
  "body",
  "visual",
  "footer",
] as const;

/** Placeholder slot kinds supported by reusable slide layouts. */
export type PlaceholderType = (typeof PLACEHOLDER_TYPES)[number];

/** Human-readable placeholder labels shared by the editor and tests. */
export const PLACEHOLDER_TYPE_LABELS: Record<PlaceholderType, string> = {
  title: "Title",
  subtitle: "Subtitle",
  body: "Body",
  visual: "Visual",
  footer: "Footer",
};

// ---------------------------------------------------------------------------
// Slide elements
// ---------------------------------------------------------------------------

/**
 * Positioned box for a free-form element, expressed in **percentages** of the
 * slide (0–100). Percentage units keep slides resolution- and aspect-ratio
 * independent so the same deck renders identically at any size.
 */
export interface ElementBox {
  /** Left edge, percent of slide width. */
  x: number;
  /** Top edge, percent of slide height. */
  y: number;
  /** Width, percent of slide width. */
  w: number;
  /** Height, percent of slide height. */
  h: number;
}

export type ElementAlign = "left" | "center" | "right";

/**
 * A formatted span of text within a line. Produced by `blockRichText()` from a
 * serialised Lexical block so document emphasis survives into slide derivation.
 *
 * Every field except `text` is optional and only set when the span actually
 * carries that formatting, keeping runs compact and additive. A run with no
 * formatting flags is equivalent to plain text.
 */
export interface TextRun {
  /** The literal text of this span. */
  text: string;
  /** Bold emphasis. */
  bold?: boolean;
  /** Italic emphasis. */
  italic?: boolean;
  /** Inline (monospace) code. */
  code?: boolean;
  /** Hex color (e.g. `#ff0000`) carried by the span, if any. */
  color?: string;
  /** Destination URL when the span is a hyperlink. */
  link?: string;
}

/**
 * Controls how a text or bullets element handles content that exceeds its box.
 *
 * - `"auto-height"` (default / absent): the box grows to fit the content
 *   height in the editor; the canvas clips only if the box is intentionally
 *   smaller than the content.
 * - `"fixed-box"`: the box height is pinned; content that overflows is clipped.
 * - `"shrink-to-fit"`: the font size is reduced automatically until the
 *   content fits within the box without clipping.
 */
export type TextFitMode = "auto-height" | "fixed-box" | "shrink-to-fit";

/** Text styling shared by `text` and `bullets` elements. */
export interface TextElementStyle {
  /** Font size as a percent of slide height (rendered via `cqh`). */
  fontSize: number;
  bold: boolean;
  italic: boolean;
  /** Optional underline for the whole element. */
  underline?: boolean;
  align: ElementAlign;
  /**
   * Vertical alignment of text within its box.
   * - `"top"`: content starts at the top edge.
   * - `"middle"` (default): content is vertically centered.
   * - `"bottom"`: content is pushed to the bottom edge.
   */
  verticalAlign?: "top" | "middle" | "bottom";
  /**
   * CSS `line-height` multiplier (e.g. 1.2, 1.5, 2.0).
   * When absent the renderer uses its own default (~1.15–1.2).
   */
  lineHeight?: number;
  /**
   * Extra space below each paragraph / text block, expressed as a percent of
   * slide height (the same unit as `fontSize`). Absent → 0.
   */
  paragraphSpacing?: number;
  /** Optional hex color override; falls back to the theme color when unset. */
  color?: string;
  /** Optional CSS font-family stack; falls back to the base/theme font. */
  fontFamily?: string;
}

export type ShapeKind = "rect" | "ellipse" | "line" | "triangle";

export type ConnectorAnchor = "center" | "top" | "bottom" | "left" | "right";

export interface ConnectorEndpoint {
  elementId: string;
  anchor: ConnectorAnchor;
}

/**
 * A free-floating connector endpoint expressed in percentage units (0–100).
 * Used when a connector end is not bound to an element anchor.
 */
export interface ConnectorPointFree {
  /** Horizontal position as a percent of slide width. */
  x: number;
  /** Vertical position as a percent of slide height. */
  y: number;
}

/**
 * A connector endpoint is either a free point in slide-percentage space or an
 * anchor bound to another element on the same slide.
 */
export type ConnectorPoint = ConnectorPointFree | ConnectorEndpoint;

/** Routing algorithm for a {@link ConnectorElement}. */
export type ConnectorRouting = "straight" | "elbow";

/** Arrowhead style for a connector endpoint. */
export type ConnectorArrow = "none" | "arrow" | "filled";

/**
 * A first-class connector element — a directed line between two points that may
 * optionally be anchored to other slide elements.
 *
 * Authored as `kind: "connector"` and carries connector semantics
 * (arrowheads, dash, routing) without a shape-type branch.
 */
export interface ConnectorElement extends BaseElement {
  kind: "connector";
  /** Start endpoint: a free slide-percentage point or an element-anchor binding. */
  start: ConnectorPoint;
  /** End endpoint: a free slide-percentage point or an element-anchor binding. */
  end: ConnectorPoint;
  /** Optional stroke color and width (`width` in `cqmin` units). */
  stroke?: { color: string; width: number };
  /**
   * Arrowhead drawn at the *start* end of the connector.
   * Absent or `"none"` means no arrowhead at the start.
   */
  arrowStart?: ConnectorArrow;
  /**
   * Arrowhead drawn at the *end* of the connector.
   * Absent means `"arrow"` (the most common case for directed connectors).
   * Set to `"none"` for an undirected line.
   */
  arrowEnd?: ConnectorArrow;
  /** When true the connector renders as a dashed stroke. */
  dash?: boolean;
  /** Routing algorithm. Absent / `"straight"` means a direct point-to-point line. */
  routing?: ConnectorRouting;
}

/**
 * Provenance metadata linking an inserted slide element back to a source
 * document block for sync and staleness tracking.
 */
export interface SourceRef {
  documentId: string;
  blockId: string;
  /** Hash of the source content at insertion time, used for staleness checks. */
  contentHash?: string;
  /** ISO timestamp describing when the source link was established. */
  linkedAt: string;
  /** True when the user explicitly broke the source link. */
  unlinked?: boolean;
  /** Kind of source block this ref points to. */
  blockKind: "text" | "visual";
}

export interface BaseElement {
  /** Stable identifier, unique within a slide. */
  id: string;
  /** Positioned box in percent units. */
  box: ElementBox;
  /** Stacking order — higher renders on top. */
  zIndex: number;
  /**
   * Optional element opacity in the `[0, 1]` range. Absent (or `1`) means fully
   * opaque; renderers apply it uniformly so the editor, present mode, public
   * viewer and export stay identical.
   */
  opacity?: number;
  /**
   * Optional clockwise rotation in degrees about the element's center. Absent
   * (or `0`) means upright. Applied as a CSS transform in every renderer.
   */
  rotation?: number;
  /** Optional drop shadow. Absent/false means no shadow. */
  shadow?: boolean;
  /** When true, the element is not selectable or draggable in the editor. */
  locked?: boolean;
  /**
   * When true, the element is not rendered in the editor, present mode, or
   * export. Set/cleared via the layer list (issue #331).
   */
  hidden?: boolean;
  /**
   * Optional user-assigned display name for the element, shown in the layer
   * list. When absent the layer list derives a name from content (issue #331).
   */
  name?: string;
  /**
   * Optional group id. Elements sharing a `groupId` select and move together in
   * the editor. Renderers ignore it. Cleared by ungrouping.
   */
  groupId?: string;
  /** Optional provenance link back to the source document block. */
  sourceRef?: SourceRef;
}

/**
 * A reusable layout slot rendered on-canvas until the user replaces it with
 * slide content.
 */
export interface PlaceholderElement extends BaseElement {
  kind: "placeholder";
  placeholderType: PlaceholderType;
  /** Optional editor-facing label shown instead of the generic type name. */
  label?: string;
}

/**
 * A reusable slide layout definition. Stored on the deck and applied onto a
 * slide as placeholder elements.
 */
export interface SlideLayout {
  id: string;
  name: string;
  format: PresentationSlideFormat;
  placeholders: PlaceholderElement[];
  /** Human-readable display title shown in the layout picker. */
  title?: string;
  /** Short description of the layout intent. */
  description?: string;
}

export interface TextElement extends BaseElement {
  kind: "text";
  text: string;
  /**
   * Optional rich-text runs for `text`. When present and non-empty, renderers
   * and exporters use these formatted spans (bold/italic/code/color/link) and
   * fall back to the plain `text` string when absent. The concatenation of
   * run `text` values equals `text`, so the plain field always stays a valid
   * fallback for compact text operations.
   */
  runs?: TextRun[];
  style: TextElementStyle;
  /** Theming hint for the default color when `style.color` is unset. */
  role: "title" | "body";
  /**
   * How the element handles content that exceeds the box height.
   * Absent / `"auto-height"` preserves the pre-#333 behaviour.
   */
  fitMode?: TextFitMode;
}

/**
 * A single item in a multi-level bullet or numbered list (#335).
 */
export interface BulletItem {
  text: string;
  /** Rich-text runs for this item; falls back to `text` when absent. */
  runs?: TextRun[];
  /**
   * Nesting depth: 0 = top level (default), 1 = first nested, 2 = second
   * nested.  Clamped to [0, 5] by validators.
   */
  indent?: number;
  /** Marker style for this item.  Defaults to `"bullet"`. */
  listType?: "bullet" | "number";
}

export interface BulletsElement extends BaseElement {
  kind: "bullets";
  bullets: string[];
  /**
   * Optional rich-text runs, parallel to `bullets`: `bulletRuns[i]` holds the
   * formatted spans for bullet line `i`. When present and non-empty, renderers
   * and exporters use the runs for that line and fall back to the plain
   * `bullets[i]` string otherwise. The array may be shorter than `bullets`;
   * any bullet without a matching entry renders from its plain string.
   */
  bulletRuns?: TextRun[][];
  /** Authoritative multi-level item list (#335). */
  items: BulletItem[];
  style: TextElementStyle;
  /**
   * How the element handles content that exceeds the box height.
   * Absent / `"auto-height"` preserves the pre-#333 behaviour.
   */
  fitMode?: TextFitMode;
  /**
   * Extra vertical gap between bullet items, expressed as a percent of slide
   * height. Supplements the default `gap` on the list container. Absent → 0.
   */
  bulletGap?: number;
  /**
   * Extra left indent applied to the entire bullet list, expressed as a
   * percent of slide width. Absent → 0.
   */
  bulletIndent?: number;
}

/**
 * Returns the authoritative item list for a bullets element (#335).
 *
 * Current deck payloads must carry `items[]`; flat `bullets[]` exists only as
 * a compact text mirror for form controls and export APIs.
 */
export function normalizeBulletItems(el: BulletsElement): BulletItem[] {
  return el.items;
}

export interface VisualElement extends BaseElement {
  kind: "visual";
  visualId: string;
  /** Optional restyle applied over the referenced document visual at render time. */
  styleThemeId?: string;
  /**
   * Optional accessible name (alt text) for the referenced visual. Normalization
   * of AI-generated decks (issue #271) derives this from the visual's title or
   * inventory summary so a generated, `role="img"` visual is never unlabeled.
   * When absent the shared renderer falls back to the visual's own title.
   */
  alt?: string;
}

/** How an image is sized within its element box. */
export const IMAGE_FIT_MODES = ["contain", "cover", "fill", "none"] as const;
export type ImageFitMode = (typeof IMAGE_FIT_MODES)[number];

/** Shape mask options for an image element. */
export const IMAGE_MASK_SHAPES = [
  "none",
  "circle",
  "rounded",
  "diamond",
] as const;
export type ImageMaskShape = (typeof IMAGE_MASK_SHAPES)[number];

/** Fractional clipping inset applied to an image element. */
export interface ImageCrop {
  /** Fraction clipped from the top edge (0–1). */
  top: number;
  /** Fraction clipped from the right edge (0–1). */
  right: number;
  /** Fraction clipped from the bottom edge (0–1). */
  bottom: number;
  /** Fraction clipped from the left edge (0–1). */
  left: number;
}

export interface ImageElement extends BaseElement {
  kind: "image";
  src: string;
  alt?: string;
  /** Optional corner radius as a percent of the box (0–50). */
  radius?: number;
  /** How the image fills its box. Defaults to "contain". */
  fitMode?: ImageFitMode;
  /** Optional shape mask applied over the image. Defaults to "none". */
  maskShape?: ImageMaskShape;
  /** Optional clipping inset. Defaults to no crop. */
  crop?: ImageCrop;
  /**
   * ID of the server-stored {@link Asset} row when this image was uploaded via
   * the slide asset upload action (Epic #374). Data-URL images use `src`
   * directly and leave this unset.
   */
  assetId?: string;
}

export interface ShapeElement extends BaseElement {
  kind: "shape";
  shape: ShapeKind;
  /** Hex fill (rect/ellipse/triangle) or stroke (line) color. */
  color: string;
  /** Optional centered label rendered inside non-line shapes. */
  text?: string;
  /** Optional rich-text runs for the shape label. */
  textRuns?: TextRun[];
  /** Optional style for the shape label; falls back to a centered body style. */
  textStyle?: TextElementStyle;
  /**
   * Optional stroke: a border for rect/ellipse, ignored for triangle, and the
   * line thickness/color for "line". Width is in `cqmin` units so it scales
   * with the slide like the rest of the geometry.
   */
  stroke?: { color: string; width: number };
  /** Optional corner radius for a rect, as a percent of the box (0–50). */
  radius?: number;
}

/** Discriminated union of every free-form slide element. */
export type SlideElement =
  | PlaceholderElement
  | TextElement
  | BulletsElement
  | VisualElement
  | ImageElement
  | ShapeElement
  | ConnectorElement;

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

  /** Presentation theme applied to the deck (copied from `Deck.theme`). */
  theme: DeckTheme;

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
  backgroundImage?: string;

  /**
   * ID of the server-stored {@link Asset} row when this slide's background
   * was uploaded via the slide asset upload action (Epic #374, issue #393).
   * When present, renderers SHOULD resolve the URL via the asset resolver
   * rather than treating `backgroundImage` as canonical.
   */
  backgroundAssetId?: string;

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

  /** Theme applied uniformly to all slides. */
  theme: DeckTheme;

  /**
   * Optional content/theme token id for typography and other theme-scoped
   * design tokens.
   */
  themeId?: string;

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

// ---------------------------------------------------------------------------
// Transform constants
// ---------------------------------------------------------------------------

/** Maximum visible bullets per content slide before text overflows to notes. */
export const MAX_BULLETS = 5;

// ---------------------------------------------------------------------------
// Element helpers
// ---------------------------------------------------------------------------

function cloneSourceRef(ref: SourceRef): SourceRef {
  return {
    documentId: ref.documentId,
    blockId: ref.blockId,
    ...(ref.contentHash !== undefined ? { contentHash: ref.contentHash } : {}),
    linkedAt: ref.linkedAt,
    ...(ref.unlinked === true ? { unlinked: true } : {}),
    blockKind: ref.blockKind,
  };
}

function cloneLinkedSourceRef(ref: SourceRef): SourceRef {
  const { unlinked: _unlinked, ...linkedRef } = ref;
  return cloneSourceRef(linkedRef);
}

/** Returns true when an element still has an active source link. */
export function isSourceLinked(el: BaseElement): boolean {
  return el.sourceRef !== undefined && el.sourceRef.unlinked !== true;
}

/**
 * Returns true when an element's linked source content has changed since the
 * element was inserted or last relinked.
 */
export function isSourceStale(el: BaseElement, currentHash: string): boolean {
  const contentHash = el.sourceRef?.contentHash;
  return (
    isSourceLinked(el) &&
    typeof contentHash === "string" &&
    contentHash !== currentHash
  );
}

/** Marks an element's source link as intentionally broken. */
export function unlinkSource<T extends BaseElement>(el: T): T {
  if (el.sourceRef === undefined || el.sourceRef.unlinked === true) {
    return el;
  }
  return {
    ...el,
    sourceRef: {
      ...cloneSourceRef(el.sourceRef),
      unlinked: true,
    },
  };
}

/** Replaces an element's source link with a fresh active reference. */
export function relinkSource<T extends BaseElement>(el: T, ref: SourceRef): T {
  return {
    ...el,
    sourceRef: cloneLinkedSourceRef(ref),
  };
}

/**
 * Generates a unique id for a new slide element.
 *
 * **Stateless and SSR-safe by design.** It holds no module-level mutable
 * counter, so concurrent server renders, HMR reloads, and multiple decks in one
 * process can never collide or interfere — every call derives its uniqueness
 * purely from `crypto.randomUUID()` (when available in both Node and the
 * browser) or, as a fallback for non-secure browser contexts, a timestamp plus
 * a random suffix. The `el-` prefix keeps ids visually identifiable and stable
 * in shape.
 *
 * Ids only need to be unique within a deck and stable once assigned — they are
 * persisted into `deckJson` (never recomputed on every render), so dropping the
 * old monotonic counter does not affect any code that relies on element
 * identity across renders.
 */
export function makeElementId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) {
    return `el-${uuid}`;
  }
  return `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Generates a stable unique id for a new slide (analogous to
 * {@link makeElementId} for elements). The `sl-` prefix keeps slide ids
 * visually distinct from element ids. Ids are only required to be unique
 * within a deck and stable once assigned — they are persisted into `deckJson`.
 */
export function makeSlideId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) {
    return `sl-${uuid}`;
  }
  return `sl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Default centered box for a freshly inserted visual element, in percent units.
 * Wide and tall enough to read on a blank slide while leaving a margin so the
 * insert never butts against the slide edge. Kept as a named constant so the
 * "Insert visual" picker and tests share one source of truth.
 */
export const DEFAULT_VISUAL_BOX: ElementBox = { x: 25, y: 18, w: 50, h: 64 };

/**
 * Builds a {@link VisualElement} (sans `zIndex`) for the given document visual,
 * positioned at a default centered {@link ElementBox}. Pure and DOM-free: the
 * "Insert document visual" picker routes the result through
 * `addElement`/`onDeckChange` so the insert is undoable. `zIndex` is assigned by
 * `addElement`, so it is intentionally omitted here.
 *
 * Pass `options.sourceRef` to stamp provenance metadata when inserting from
 * a source document (issue #424).
 */
export function buildVisualElement(
  visualId: string,
  options: {
    id?: string;
    box?: ElementBox;
    styleThemeId?: string;
    /** Optional source-document provenance for inserted document visuals (#424). */
    sourceRef?: SourceRef;
  } = {},
): Omit<VisualElement, "zIndex"> & { id: string } {
  return {
    id: options.id ?? makeElementId(),
    kind: "visual",
    visualId,
    box: options.box ?? { ...DEFAULT_VISUAL_BOX },
    ...(options.styleThemeId ? { styleThemeId: options.styleThemeId } : {}),
    ...(options.sourceRef !== undefined
      ? { sourceRef: options.sourceRef }
      : {}),
  };
}

function cloneBox(box: ElementBox): ElementBox {
  return { ...box };
}

function clonePlaceholder(
  placeholder: PlaceholderElement,
  overrides: Partial<PlaceholderElement> = {},
): PlaceholderElement {
  const label =
    typeof overrides.label === "string"
      ? overrides.label
      : placeholder.label?.trim()
        ? placeholder.label
        : undefined;
  const next: PlaceholderElement = {
    ...placeholder,
    ...overrides,
    id: overrides.id ?? placeholder.id,
    kind: "placeholder",
    placeholderType: overrides.placeholderType ?? placeholder.placeholderType,
    zIndex: overrides.zIndex ?? placeholder.zIndex,
    box: cloneBox(overrides.box ?? placeholder.box),
  };
  if (label) {
    next.label = label;
  } else {
    delete next.label;
  }
  return next;
}

function restackElements(elements: readonly SlideElement[]): SlideElement[] {
  return elements.map((element, index) =>
    element.zIndex === index ? element : { ...element, zIndex: index },
  );
}

function layoutHintForReusableLayout(
  name: string,
): SlideLayoutHint | undefined {
  switch (name) {
    case "blank":
      return "blank";
    case "title-slide":
      return "title";
    case "title-content":
    case "two-column":
      return "content";
    default:
      return undefined;
  }
}

function placeholderMatchKey(
  placeholder: PlaceholderElement,
  counts: Map<PlaceholderType, number>,
): string {
  const occurrence = counts.get(placeholder.placeholderType) ?? 0;
  counts.set(placeholder.placeholderType, occurrence + 1);
  return `${placeholder.placeholderType}:${occurrence}`;
}

function existingPlaceholderMap(
  placeholders: readonly PlaceholderElement[],
): Map<string, PlaceholderElement> {
  const counts = new Map<PlaceholderType, number>();
  const byKey = new Map<string, PlaceholderElement>();
  for (const placeholder of placeholders) {
    byKey.set(placeholderMatchKey(placeholder, counts), placeholder);
  }
  return byKey;
}

function applyPlaceholderSet(
  layout: SlideLayout,
  existing: readonly PlaceholderElement[],
  preserveMatchingLabels: boolean,
): PlaceholderElement[] {
  const matched = existingPlaceholderMap(existing);
  const counts = new Map<PlaceholderType, number>();
  return layout.placeholders.map((placeholder) => {
    const key = placeholderMatchKey(placeholder, counts);
    const current = matched.get(key);
    return clonePlaceholder(placeholder, {
      id: current?.id ?? makeElementId(),
      ...(preserveMatchingLabels &&
      typeof current?.label === "string" &&
      current.label.trim().length > 0
        ? { label: current.label }
        : {}),
    });
  });
}

function reusableLayoutBoxes(
  name: string,
): readonly Omit<PlaceholderElement, "id" | "kind" | "zIndex">[] {
  switch (name) {
    case "blank":
      return [];
    case "title-slide":
      return [
        {
          placeholderType: "title",
          label: "Title",
          box: { x: 8, y: 28, w: 84, h: 16 },
        },
        {
          placeholderType: "subtitle",
          label: "Subtitle",
          box: { x: 12, y: 48, w: 76, h: 10 },
        },
        {
          placeholderType: "footer",
          label: "Footer",
          box: { x: 6, y: 90, w: 88, h: 5 },
        },
      ];
    case "title-content":
      return [
        {
          placeholderType: "title",
          label: "Title",
          box: { x: 6, y: 6, w: 88, h: 14 },
        },
        {
          placeholderType: "body",
          label: "Body",
          box: { x: 6, y: 24, w: 44, h: 58 },
        },
        {
          placeholderType: "visual",
          label: "Visual",
          box: { x: 54, y: 24, w: 40, h: 58 },
        },
        {
          placeholderType: "footer",
          label: "Footer",
          box: { x: 6, y: 86, w: 88, h: 6 },
        },
      ];
    case "two-column":
      return [
        {
          placeholderType: "title",
          label: "Title",
          box: { x: 6, y: 6, w: 88, h: 14 },
        },
        {
          placeholderType: "body",
          label: "Left column",
          box: { x: 6, y: 24, w: 42, h: 58 },
        },
        {
          placeholderType: "body",
          label: "Right column",
          box: { x: 52, y: 24, w: 42, h: 58 },
        },
        {
          placeholderType: "footer",
          label: "Footer",
          box: { x: 6, y: 86, w: 88, h: 6 },
        },
      ];
    default:
      return [];
  }
}

/**
 * Applies a reusable layout's placeholders onto a slide, preserving all
 * non-placeholder elements already on that slide.
 */
export function applyLayout(slide: Slide, layout: SlideLayout): Slide {
  const existing = slide.elements ?? [];
  const placeholders = existing.filter(
    (element): element is PlaceholderElement => element.kind === "placeholder",
  );
  const preserved = existing.filter(
    (element) => element.kind !== "placeholder",
  );
  const merged = restackElements([
    ...applyPlaceholderSet(layout, placeholders, true),
    ...preserved,
  ]);
  const hint = layoutHintForReusableLayout(layout.name);
  return {
    ...slide,
    ...(hint ? { layout: hint } : {}),
    elements: merged,
    elementsDerived: false,
  };
}

/**
 * Re-installs a reusable layout's placeholders from scratch, discarding any
 * existing placeholder instances while keeping free-form elements intact.
 */
export function resetLayout(slide: Slide, layout: SlideLayout): Slide {
  const preserved = (slide.elements ?? []).filter(
    (element) => element.kind !== "placeholder",
  );
  const merged = restackElements([
    ...applyPlaceholderSet(layout, [], false),
    ...preserved,
  ]);
  const hint = layoutHintForReusableLayout(layout.name);
  return {
    ...slide,
    ...(hint ? { layout: hint } : {}),
    elements: merged,
    elementsDerived: false,
  };
}

const LAYOUT_META: Record<string, { title: string; description: string }> = {
  blank: { title: "Blank", description: "Empty canvas with no placeholders" },
  "title-slide": {
    title: "Title Slide",
    description: "Centered title and subtitle",
  },
  "title-content": {
    title: "Title + Content",
    description: "Slide title with body content area",
  },
  "two-column": {
    title: "Two Column",
    description: "Side-by-side content areas",
  },
};

const BUILTIN_LAYOUTS: readonly SlideLayout[] =
  PRESENTATION_SLIDE_FORMATS.flatMap((format) =>
    (["blank", "title-slide", "title-content", "two-column"] as const).map(
      (name) => ({
        id: `layout:${format}:${name}`,
        name,
        format,
        placeholders: reusableLayoutBoxes(name).map((placeholder, index) => ({
          id: `layout-ph:${format}:${name}:${placeholder.placeholderType}:${index}`,
          kind: "placeholder" as const,
          zIndex: index,
          box: cloneBox(placeholder.box),
          placeholderType: placeholder.placeholderType,
          ...(placeholder.label ? { label: placeholder.label } : {}),
        })),
        ...(LAYOUT_META[name] ?? {}),
      }),
    ),
  );

/** Built-in placeholder layouts available to every deck format. */
export function defaultLayouts(): SlideLayout[] {
  return BUILTIN_LAYOUTS.map((layout) => ({
    ...layout,
    placeholders: layout.placeholders.map((placeholder) =>
      clonePlaceholder(placeholder),
    ),
  }));
}

/** Builds positioned current elements while deriving a brand-new deck. */
export function buildSlideElementsFromContent(slide: Slide): SlideElement[] {
  const elements: SlideElement[] = [];
  let z = 0;

  const visualIds = slide.visualIds;
  const bullets = slide.bullets;
  const hasVisual = visualIds.length > 0;
  const hasBullets = bullets.length > 0;
  const isBigTitle = slide.layout === "title" || slide.layout === "section";

  const textStyle = (
    fontSize: number,
    align: ElementAlign,
    bold: boolean,
  ): TextElementStyle => ({ fontSize, align, bold, italic: false });

  if (slide.title) {
    elements.push({
      id: makeElementId(),
      kind: "text",
      role: "title",
      text: slide.title,
      ...(slide.titleRuns && slide.titleRuns.length > 0
        ? { runs: slide.titleRuns }
        : {}),
      zIndex: z++,
      box: isBigTitle
        ? { x: 8, y: 36, w: 84, h: 28 }
        : { x: 6, y: 6, w: 88, h: 16 },
      style: textStyle(
        isBigTitle ? 9 : 6,
        isBigTitle ? "center" : "left",
        true,
      ),
    });
  }

  const bulletRuns =
    slide.bulletRuns && slide.bulletRuns.length > 0 ? slide.bulletRuns : null;

  if (hasVisual && hasBullets) {
    elements.push({
      id: makeElementId(),
      kind: "bullets",
      bullets: [...bullets],
      ...(bulletRuns ? { bulletRuns } : {}),
      items: bullets.map((text, index) => ({
        text,
        ...(bulletRuns?.[index] && bulletRuns[index].length > 0
          ? { runs: bulletRuns[index] }
          : {}),
      })),
      zIndex: z++,
      box: { x: 6, y: 26, w: 46, h: 66 },
      style: textStyle(4.5, "left", false),
    });
    elements.push({
      id: makeElementId(),
      kind: "visual",
      visualId: visualIds[0],
      zIndex: z++,
      box: { x: 54, y: 26, w: 40, h: 66 },
    });
  } else if (hasVisual) {
    elements.push({
      id: makeElementId(),
      kind: "visual",
      visualId: visualIds[0],
      zIndex: z++,
      box: { x: 8, y: 24, w: 84, h: 68 },
    });
  } else if (hasBullets) {
    elements.push({
      id: makeElementId(),
      kind: "bullets",
      bullets: [...bullets],
      ...(bulletRuns ? { bulletRuns } : {}),
      items: bullets.map((text, index) => ({
        text,
        ...(bulletRuns?.[index] && bulletRuns[index].length > 0
          ? { runs: bulletRuns[index] }
          : {}),
      })),
      zIndex: z++,
      box: { x: 6, y: 26, w: 88, h: 66 },
      style: textStyle(4.5, "left", false),
    });
  }

  // Stack any additional visuals beyond the first as cascaded tiles.
  for (let i = 1; i < visualIds.length; i++) {
    elements.push({
      id: makeElementId(),
      kind: "visual",
      visualId: visualIds[i],
      zIndex: z++,
      box: { x: 12 + i * 4, y: 30 + i * 4, w: 38, h: 38 },
    });
  }

  return elements;
}

interface SlideBuilder {
  title: string;
  titleRuns?: TextRun[];
  bullets: string[];
  bulletRuns: TextRun[][];
  visualIds: string[];
  noteLines: string[];
  layout: SlideLayoutHint;
}

function freshSlide(
  title: string,
  layout: SlideLayoutHint = "content",
  titleRuns?: TextRun[],
): SlideBuilder {
  return {
    title,
    ...(titleRuns ? { titleRuns } : {}),
    bullets: [],
    bulletRuns: [],
    visualIds: [],
    noteLines: [],
    layout,
  };
}

function resolveLayout(builder: SlideBuilder): SlideLayoutHint {
  if (builder.layout === "title" || builder.layout === "section") {
    return builder.layout;
  }
  // Visual-only → media (even if the builder was opened as "content")
  if (builder.visualIds.length > 0 && builder.bullets.length === 0) {
    return "media";
  }
  // Has any content, or was explicitly opened as a content slide (h2/h3 heading)
  if (
    builder.visualIds.length > 0 ||
    builder.bullets.length > 0 ||
    builder.layout === "content"
  ) {
    return "content";
  }
  return "blank";
}

function finaliseSlide(
  builder: SlideBuilder,
  index: number,
  theme: DeckTheme,
): Slide {
  const hasBulletRuns = builder.bulletRuns.some((runs) => runs.length > 0);
  const sourceSectionId = computeSectionId(builder.title);
  const slide: Slide = {
    id: makeSlideId(),
    index,
    title: builder.title,
    ...(builder.titleRuns && builder.titleRuns.length > 0
      ? { titleRuns: builder.titleRuns }
      : {}),
    bullets: builder.bullets,
    ...(hasBulletRuns ? { bulletRuns: builder.bulletRuns } : {}),
    visualIds: builder.visualIds,
    layout: resolveLayout(builder),
    notes: builder.noteLines.join("\n").trim(),
    theme,
    ...(sourceSectionId !== undefined ? { sourceSectionId } : {}),
  };
  return {
    ...slide,
    elements: buildSlideElementsFromContent(slide),
    elementsDerived: true,
  };
}

// ---------------------------------------------------------------------------
// buildDeckFromBlocks — pure transform
// ---------------------------------------------------------------------------

/**
 * Derives a `Deck` from an ordered array of `DocumentBlock` values produced by
 * `collectDocumentBlocks`.
 *
 * The transform is pure and deterministic: given the same input it always
 * returns the same deck.  It never throws — malformed or empty input yields a
 * deck with a single blank slide.
 *
 * @param blocks  Block list from `collectDocumentBlocks`.
 * @param theme   Presentation theme to stamp on every slide.  Defaults to
 *                `"default"`.
 * @returns A fully-populated `Deck`.
 */
export function buildDeckFromBlocks(
  blocks: DocumentBlock[],
  theme: DeckTheme = "default",
): Deck {
  const slides: Slide[] = [];
  let current: SlideBuilder = freshSlide("", "blank");
  let sectionTitle = "";
  let hasContent = false;

  const flush = () => {
    // Only emit a slide if it has any content (title, bullets, visuals, notes)
    if (
      current.title ||
      current.bullets.length > 0 ||
      current.visualIds.length > 0 ||
      current.noteLines.length > 0
    ) {
      slides.push(finaliseSlide(current, slides.length, theme));
    }
  };

  for (const block of blocks) {
    if (block.kind === "text") {
      const { blockType, text } = block;
      const trimmed = text.trim();

      if (blockType === "heading") {
        const level = block.level ?? 2;

        if (level === 1) {
          // h1 → flush current, open title/section slide
          flush();
          sectionTitle = trimmed;
          current = freshSlide(
            trimmed,
            hasContent ? "section" : "title",
            block.runs,
          );
          hasContent = true;
          continue;
        }

        // h2 / h3 → flush current, open content slide carrying section title
        flush();
        current = freshSlide(trimmed, "content", block.runs);
        if (!hasContent) hasContent = true;
        continue;
      }

      if (blockType === "hr") {
        // Explicit slide break — flush and continue with same section title
        flush();
        current = freshSlide(sectionTitle, "content");
        continue;
      }

      if (blockType === "quote") {
        // Quotes always go to notes
        if (trimmed) current.noteLines.push(trimmed);
        if (!hasContent) hasContent = true;
        continue;
      }

      if (!trimmed) continue;

      // paragraph / listitem
      if (current.bullets.length < MAX_BULLETS) {
        current.bullets.push(trimmed);
        current.bulletRuns.push(block.runs ?? []);
      } else {
        current.noteLines.push(trimmed);
      }
      if (!hasContent) hasContent = true;
      continue;
    }

    // Visual block
    if (block.kind === "visual") {
      if (!hasContent) hasContent = true;

      if (current.visualIds.length === 0) {
        // Attach to current slide
        current.visualIds.push(block.visualId);
      } else {
        // Current slide already has a visual → flush and open a dedicated media slide
        flush();
        current = freshSlide(sectionTitle, "media");
        current.visualIds.push(block.visualId);
      }
    }
  }

  // Flush the final in-progress slide
  flush();

  // Guard: never return an empty deck
  if (slides.length === 0) {
    slides.push({
      id: makeSlideId(),
      index: 0,
      title: "",
      bullets: [],
      visualIds: [],
      layout: "blank",
      notes: "",
      theme,
      elements: [],
      elementsDerived: false,
    });
  }

  // Re-index after all pushes (index is set at push time but guard may add one)
  return {
    slides,
    theme,
    themeId: theme,
    slideFormat: DEFAULT_DECK_SLIDE_FORMAT,
    layouts: defaultLayouts(),
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
  };
}
