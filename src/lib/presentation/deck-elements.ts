/** Slide element families and element helper constructors. */

import type { LayoutSlotBinding } from "@/lib/presentation/slide-slots";
import type { DeckTextRole } from "@/lib/presentation/deck-theme-token-primitives";
import type { AssetReference, ResolvedAssetUrl } from "@/lib/asset-vocabulary";
import {
  IMAGE_FIT_MODES,
  IMAGE_MASK_SHAPES,
  type ConnectorArrow,
  type ElementAlign,
  type ImageFitMode,
  type ImageMaskShape,
} from "./deck-element-primitives";
import { makeElementId } from "./deck-ids";
import type { PlaceholderType } from "./deck-layout-primitives";
import type { SourceRef } from "./deck-source-refs";

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
  /**
   * Optional binding to a semantic layout slot (#628). When present, layout
   * application moves this element into the matching slot's geometry instead of
   * replacing it. Absent → the element is free-form/unbound and is never moved
   * by layout actions.
   */
  layoutSlot?: LayoutSlotBinding;
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
   * Optional semantic deck-template role (#605). When present, the style
   * cascade resolves typography from the deck template for this role and treats
   * {@link styleOverride} as local overrides on top. Absent → the element is
   * styled entirely by its concrete `style`.
   */
  textRole?: DeckTextRole;
  /**
   * Optional local style overrides applied over the resolved template/role
   * style (#605). Only the present fields win; absent fields inherit. Resetting
   * a property to the theme value means deleting it from this object.
   */
  styleOverride?: Partial<TextElementStyle>;
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
   * Optional semantic deck-template role (#605). Defaults conceptually to
   * `"bullet"` when the element opts into template inheritance. Absent → styled
   * entirely by concrete `style`.
   */
  textRole?: DeckTextRole;
  /**
   * Optional local style overrides applied over the resolved template/role
   * style (#605). Present fields win; absent fields inherit from the template.
   */
  styleOverride?: Partial<TextElementStyle>;
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
export { IMAGE_FIT_MODES, IMAGE_MASK_SHAPES };
export type { ConnectorArrow, ElementAlign, ImageFitMode, ImageMaskShape };

/** Shape mask options for an image element. */
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
  /** Resolved display URL or data URL. Persist uploaded asset identity in `assetId`. */
  src: ResolvedAssetUrl;
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
  assetId?: AssetReference;
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
   * Optional semantic deck-template role for the shape label (#605). Defaults
   * conceptually to `"shapeLabel"` when inheriting from the template. Absent →
   * styled by concrete `textStyle`.
   */
  textRole?: DeckTextRole;
  /**
   * Optional local style overrides for the shape label, applied over the
   * resolved template/role style (#605).
   */
  textStyleOverride?: Partial<TextElementStyle>;
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
