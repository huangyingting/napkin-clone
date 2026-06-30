"use client";

/**
 * Renderer for a single resolved render node from the vNext render tree.
 *
 * Converts `ResolvedRenderNode` into a positioned, styled DOM element without
 * any v6 materialization.  Each node type (text, shape, image, connector,
 * table, visual, group) has its own render branch.
 *
 * Props are pure and prop-driven; no context or global state is read here.
 */

import { type JSX, memo } from "react";

import type {
  ResolvedRenderNode,
  ResolvedNodeContent,
} from "@/lib/presentation-vnext/render-tree";
import type { StyleObject } from "@/lib/presentation-vnext/style-schema";
import type {
  TextContent,
  TextRun,
  TableContent,
  ShapeKind,
  ConnectorContent,
  ImageCrop,
  ConnectorEndpoint,
} from "@/lib/presentation-vnext/schema";

// ---------------------------------------------------------------------------
// CSS conversion helpers
// ---------------------------------------------------------------------------

function colorValueToCss(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  return undefined;
}

function gradientStopsToCss(
  stops: readonly { color: unknown; offsetPct: number }[] | undefined,
): string | undefined {
  return stops
    ?.map((stop) => {
      const color = colorValueToCss(stop.color) ?? "transparent";
      return `${color} ${stop.offsetPct}%`;
    })
    .join(", ");
}

function fillToCss(
  fill: StyleObject["fill"],
  assetResolver?: (id: string) => string | undefined,
): React.CSSProperties {
  if (!fill) return {};
  switch (fill.type) {
    case "solid":
      return { backgroundColor: colorValueToCss(fill.color) };
    case "linearGradient": {
      const from = colorValueToCss(fill.from) ?? "transparent";
      const to = colorValueToCss(fill.to) ?? "transparent";
      const angle = fill.angle ?? 90;
      const stops = gradientStopsToCss(fill.stops);
      return {
        background: `linear-gradient(${angle}deg, ${stops ?? `${from}, ${to}`})`,
      };
    }
    case "radialGradient": {
      const inner = colorValueToCss(fill.inner) ?? "transparent";
      const outer = colorValueToCss(fill.outer) ?? "transparent";
      const stops = gradientStopsToCss(fill.stops);
      return {
        background: `radial-gradient(${fill.rx ?? fill.r ?? 70}% ${fill.ry ?? fill.r ?? 70}% at ${fill.cx ?? 50}% ${fill.cy ?? 50}%, ${stops ?? `${inner}, ${outer}`})`,
      };
    }
    case "conicGradient": {
      const stops =
        gradientStopsToCss(fill.stops) ?? "transparent, transparent";
      return {
        background: `conic-gradient(from ${fill.fromAngle ?? 0}deg at ${fill.cx ?? 50}% ${fill.cy ?? 50}%, ${stops})`,
      };
    }
    case "repeatingLinearGradient": {
      const angle = fill.angle ?? 90;
      const stops =
        gradientStopsToCss(fill.stops) ?? "transparent 0%, transparent 100%";
      return {
        background: `repeating-linear-gradient(${angle}deg, ${stops})`,
      };
    }
    case "pattern": {
      const color = colorValueToCss(fill.color) ?? "currentColor";
      const background = colorValueToCss(fill.background);
      const spacing = fill.spacingPct ?? 8;
      const width = fill.strokeWidthPct ?? 0.25;
      if (fill.kind === "grid") {
        return {
          ...(background ? { backgroundColor: background } : {}),
          backgroundImage: `linear-gradient(${color} ${width}%, transparent ${width}%), linear-gradient(90deg, ${color} ${width}%, transparent ${width}%)`,
          backgroundSize: `${spacing}% ${spacing}%`,
        };
      }
      if (fill.kind === "dots") {
        return {
          ...(background ? { backgroundColor: background } : {}),
          backgroundImage: `radial-gradient(circle, ${color} ${width}%, transparent ${width}%)`,
          backgroundSize: `${spacing}% ${spacing}%`,
        };
      }
      const angle = fill.kind === "scanlines" ? 0 : (fill.angle ?? 135);
      return {
        ...(background ? { backgroundColor: background } : {}),
        backgroundImage: `repeating-linear-gradient(${angle}deg, ${color} 0%, ${color} ${width}%, transparent ${width}%, transparent ${spacing}%)`,
      };
    }
    case "image": {
      const src = assetResolver?.(fill.assetId);
      if (!src) return {};
      return {
        backgroundImage: `url(${JSON.stringify(src)})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        opacity: fill.opacity,
      };
    }
  }
}

function effectToCss(effect: StyleObject["effect"]): React.CSSProperties {
  if (!effect || effect.kind === "none") return {};
  if (effect.kind === "glass") {
    const blur =
      effect.intensity === "strong"
        ? 22
        : effect.intensity === "light"
          ? 8
          : 14;
    return {
      backdropFilter: `blur(${blur}px) saturate(1.25)`,
      WebkitBackdropFilter: `blur(${blur}px) saturate(1.25)`,
    };
  }
  if (effect.kind === "blur") {
    return { filter: `blur(${effect.radiusPt}pt)` };
  }
  const color = colorValueToCss(effect.color) ?? "currentColor";
  return {
    filter: `drop-shadow(0 0 ${effect.blurPt}pt ${color})`,
    opacity: effect.opacity,
  };
}

function strokeToCss(stroke: StyleObject["stroke"]): React.CSSProperties {
  if (!stroke) return {};
  const color = colorValueToCss(stroke.color) ?? "transparent";
  const dash =
    stroke.dash === "dashed"
      ? "dashed"
      : stroke.dash === "dotted"
        ? "dotted"
        : "solid";
  return { border: `${stroke.widthPt}pt ${dash} ${color}` };
}

function radiusToCss(radius: StyleObject["radius"]): React.CSSProperties {
  if (!radius) return {};
  if ("allPt" in radius) return { borderRadius: `${radius.allPt}pt` };
  return {
    borderTopLeftRadius: `${radius.topLeftPt}pt`,
    borderTopRightRadius: `${radius.topRightPt}pt`,
    borderBottomRightRadius: `${radius.bottomRightPt}pt`,
    borderBottomLeftRadius: `${radius.bottomLeftPt}pt`,
  };
}

function shadowToCss(shadow: StyleObject["shadow"]): React.CSSProperties {
  if (!shadow) return {};
  const color = colorValueToCss(shadow.color) ?? "rgba(0,0,0,0.2)";
  return {
    boxShadow: `${shadow.xPt}pt ${shadow.yPt}pt ${shadow.blurPt}pt ${color}`,
  };
}

function textStyleToCss(text: StyleObject["text"]): React.CSSProperties {
  if (!text) return {};
  return {
    ...(text.fontFamily && typeof text.fontFamily === "string"
      ? { fontFamily: text.fontFamily }
      : {}),
    ...(text.fontSizePt ? { fontSize: `${text.fontSizePt}pt` } : {}),
    ...(text.weight ? { fontWeight: text.weight } : {}),
    ...(text.italic ? { fontStyle: "italic" } : {}),
    ...(text.underline ? { textDecoration: "underline" } : {}),
    ...(text.color ? { color: colorValueToCss(text.color) } : {}),
    ...(text.lineHeight ? { lineHeight: text.lineHeight } : {}),
    ...(text.align ? { textAlign: text.align } : {}),
    ...(text.letterSpacingEm
      ? { letterSpacing: `${text.letterSpacingEm}em` }
      : {}),
    ...(text.textTransform ? { textTransform: text.textTransform } : {}),
  };
}

/**
 * Converts a resolved `StyleObject` to inline CSS properties for a container.
 * Text style is applied separately on the inner text container.
 */
export function styleObjectToContainerCss(
  style: StyleObject,
  assetResolver?: (id: string) => string | undefined,
): React.CSSProperties {
  return {
    ...fillToCss(style.fill, assetResolver),
    ...strokeToCss(style.stroke),
    ...radiusToCss(style.radius),
    ...shadowToCss(style.shadow),
    ...effectToCss(style.effect),
    ...(style.opacity !== undefined ? { opacity: style.opacity } : {}),
    ...(style.clip?.enabled ? { overflow: "hidden" } : {}),
    ...(style.blendMode && style.blendMode !== "normal"
      ? { mixBlendMode: style.blendMode }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Positioning helper
// ---------------------------------------------------------------------------

/**
 * Converts a percent-based frame into absolute-position CSS.
 * The parent canvas container must be `position: relative`.
 */
function frameToCss(frame: {
  x: number;
  y: number;
  w: number;
  h: number;
}): React.CSSProperties {
  return {
    position: "absolute",
    left: `${frame.x}%`,
    top: `${frame.y}%`,
    width: `${frame.w}%`,
    height: `${frame.h}%`,
  };
}

// ---------------------------------------------------------------------------
// Text node content
// ---------------------------------------------------------------------------

function runStyle(run: TextRun): React.CSSProperties {
  return {
    ...(run.bold ? { fontWeight: "bold" } : {}),
    ...(run.italic ? { fontStyle: "italic" } : {}),
    ...(run.underline || run.strikethrough
      ? {
          textDecoration: [
            run.underline ? "underline" : undefined,
            run.strikethrough ? "line-through" : undefined,
          ]
            .filter(Boolean)
            .join(" "),
        }
      : {}),
    ...(run.code ? { fontFamily: "monospace" } : {}),
    ...(run.localStyle?.color ? { color: run.localStyle.color as string } : {}),
    ...(run.localStyle?.fontSizePt
      ? { fontSize: `${run.localStyle.fontSizePt}pt` }
      : {}),
    ...(run.localStyle?.fontFamily
      ? { fontFamily: run.localStyle.fontFamily as string }
      : {}),
  };
}

function renderTextRuns(runs: readonly TextRun[]): JSX.Element[] {
  return runs.map((run, i) => {
    const style = runStyle(run);
    return run.link ? (
      <a
        key={i}
        href={run.link}
        style={style}
        target="_blank"
        rel="noopener noreferrer"
      >
        {run.text}
      </a>
    ) : (
      <span key={i} style={style}>
        {run.text}
      </span>
    );
  });
}

function TextNodeContent({ content }: { content: TextContent }): JSX.Element {
  return (
    <div className="h-full w-full overflow-hidden">
      {content.paragraphs.map((para, index) => (
        <p
          key={para.id}
          style={{
            display: para.list ? "flex" : undefined,
            gap: para.list ? "0.4em" : undefined,
            margin: 0,
          }}
        >
          {para.list ? (
            <span aria-hidden="true" style={{ flex: "0 0 auto" }}>
              {para.list.kind === "number" ? `${index + 1}.` : "•"}
            </span>
          ) : null}
          <span>
            {para.runs && para.runs.length > 0
              ? renderTextRuns(para.runs)
              : para.text}
          </span>
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shape node content
// ---------------------------------------------------------------------------

function shapePathD(kind: ShapeKind): string | undefined {
  switch (kind) {
    case "triangle":
      return "M 50 0 L 100 100 L 0 100 Z";
    case "diamond":
      return "M 50 0 L 100 50 L 50 100 L 0 50 Z";
    default:
      return undefined;
  }
}

function ShapeNodeContent({
  shape,
  text,
  path,
  style,
}: {
  shape: ShapeKind;
  text?: TextContent;
  path?: string;
  style: StyleObject;
}): JSX.Element {
  const hasSvgPath =
    shape === "triangle" || shape === "diamond" || shape === "path";
  const fillColor =
    style.fill?.type === "solid"
      ? colorValueToCss(style.fill.color)
      : undefined;
  const strokeColor = style.stroke
    ? colorValueToCss(style.stroke.color)
    : undefined;

  return (
    <div className="relative h-full w-full">
      {hasSvgPath && (
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d={path ?? shapePathD(shape) ?? "M0 0 L100 0 L100 100 L0 100 Z"}
            fill={fillColor ?? "currentColor"}
            stroke={strokeColor}
            strokeWidth={style.stroke?.widthPt}
          />
        </svg>
      )}
      {text && (
        <div className="absolute inset-0 flex items-center justify-center">
          <TextNodeContent content={text} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image node content
// ---------------------------------------------------------------------------

function ImageNodeContent({
  assetId,
  alt,
  fit,
  crop,
  imageStyle,
  assetResolver,
}: {
  assetId: string;
  alt?: string;
  fit?: string;
  crop?: ImageCrop;
  imageStyle?: StyleObject["image"];
  assetResolver?: (id: string) => string | undefined;
}): JSX.Element {
  const src = assetResolver?.(assetId);
  const objectFit = (fit as React.CSSProperties["objectFit"]) ?? "cover";
  const filters = [
    imageStyle?.brightness !== undefined
      ? `brightness(${imageStyle.brightness})`
      : undefined,
    imageStyle?.contrast !== undefined
      ? `contrast(${imageStyle.contrast})`
      : undefined,
    imageStyle?.saturation !== undefined
      ? `saturate(${imageStyle.saturation})`
      : undefined,
  ].filter(Boolean);
  if (!src) {
    return (
      <div
        className="flex h-full w-full items-center justify-center bg-ds-surface-2 text-xs text-ds-text-muted"
        aria-label={alt ?? "Image placeholder"}
      >
        <span aria-hidden="true">⬜</span>
      </div>
    );
  }
  const cropStyle: React.CSSProperties | undefined = crop
    ? {
        position: "absolute",
        left: `${-crop.left}%`,
        top: `${-crop.top}%`,
        width: `${100 + crop.left + crop.right}%`,
        height: `${100 + crop.top + crop.bottom}%`,
      }
    : undefined;
  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt ?? ""}
        style={{
          objectFit,
          width: "100%",
          height: "100%",
          display: "block",
          ...(cropStyle ?? {}),
          ...(filters.length > 0 ? { filter: filters.join(" ") } : {}),
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table node content
// ---------------------------------------------------------------------------

function TableNodeContent({
  content,
  style,
}: {
  content: TableContent;
  style: StyleObject;
}): JSX.Element {
  const headerFill =
    style.table?.headerFill?.type === "solid"
      ? colorValueToCss(style.table.headerFill.color)
      : undefined;
  const rowFill =
    style.table?.rowFill?.type === "solid"
      ? colorValueToCss(style.table.rowFill.color)
      : undefined;
  const borderColor = style.table?.border
    ? colorValueToCss(style.table.border.color)
    : undefined;
  const borderWidth = style.table?.border?.widthPt ?? 0;
  const padding = style.table?.cellPaddingPt;
  const cellStyle: React.CSSProperties = {
    ...(borderColor && borderWidth > 0
      ? { border: `${borderWidth}pt solid ${borderColor}` }
      : {}),
    ...(padding
      ? {
          paddingTop: `${padding.top}pt`,
          paddingRight: `${padding.right}pt`,
          paddingBottom: `${padding.bottom}pt`,
          paddingLeft: `${padding.left}pt`,
        }
      : {}),
  };

  return (
    <table className="h-full w-full border-collapse text-[inherit]">
      {content.header && content.rows.length > 0 && (
        <thead>
          <tr style={{ backgroundColor: headerFill }}>
            {content.columns.map((col) => (
              <th
                key={col.id}
                className="px-2 py-1 text-left text-xs font-semibold"
                style={cellStyle}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {content.rows.map((row, rowIdx) => (
          <tr
            key={row.id}
            style={
              rowIdx % 2 === 1 &&
              style.table?.alternateRowFill?.type === "solid"
                ? {
                    backgroundColor: colorValueToCss(
                      style.table.alternateRowFill.color,
                    ),
                  }
                : { backgroundColor: rowFill }
            }
          >
            {row.cells.map((cell, colIdx) => (
              <td
                key={content.columns[colIdx]?.id ?? colIdx}
                className="px-2 py-1 text-xs"
                style={cellStyle}
              >
                {cell.runs && cell.runs.length > 0
                  ? renderTextRuns(cell.runs)
                  : cell.text}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Visual node content
// ---------------------------------------------------------------------------

function VisualNodeContent({
  assetId,
  alt,
  assetResolver,
}: {
  assetId?: string;
  alt?: string;
  assetResolver?: (id: string) => string | undefined;
}): JSX.Element {
  const src = assetId ? assetResolver?.(assetId) : undefined;
  if (!src) {
    return (
      <div
        className="flex h-full w-full items-center justify-center bg-ds-surface-2 text-xs text-ds-text-muted"
        aria-label={alt ?? "Visual placeholder"}
      >
        <span aria-hidden="true">📊</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt ?? ""}
      style={{
        objectFit: "contain",
        width: "100%",
        height: "100%",
        display: "block",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Connector node content
// ---------------------------------------------------------------------------

function ConnectorNodeContent({
  content,
  style,
}: {
  content: ConnectorContent;
  style: StyleObject;
}): JSX.Element {
  const stroke = style.connector?.stroke ?? style.stroke;
  const strokeColor = colorValueToCss(stroke?.color) ?? "currentColor";
  const strokeWidth = stroke?.widthPt ?? 2;
  const dashArray =
    stroke?.dash === "dashed"
      ? "6 4"
      : stroke?.dash === "dotted"
        ? "1 4"
        : undefined;
  const startArrow = style.connector?.startArrow ?? "none";
  const endArrow = style.connector?.endArrow ?? "arrow";
  const routing = content.routing ?? style.connector?.routing ?? "straight";
  const start = connectorEndpointPoint(content.from);
  const end = connectorEndpointPoint(content.to);
  const midX = start.x + (end.x - start.x) / 2;
  const path =
    routing === "curved"
      ? `M ${start.x} ${start.y} C ${midX} ${start.y} ${midX} ${end.y} ${end.x} ${end.y}`
      : routing === "elbow"
        ? `M ${start.x} ${start.y} L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}`
        : `M ${start.x} ${start.y} L ${end.x} ${end.y}`;

  // Rendered as an SVG spanning the node's frame box
  return (
    <svg
      className="absolute inset-0 h-full w-full overflow-visible"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        {startArrow !== "none" ? (
          <marker
            id="connector-start-arrow-v7"
            markerWidth="8"
            markerHeight="6"
            refX="1"
            refY="3"
            orient="auto"
          >
            <path
              d="M 8 0 L 0 3 L 8 6"
              fill={startArrow === "filled" ? strokeColor : "none"}
              stroke={strokeColor}
              strokeWidth="1"
            />
          </marker>
        ) : null}
        {endArrow !== "none" ? (
          <marker
            id="connector-end-arrow-v7"
            markerWidth="8"
            markerHeight="6"
            refX="7"
            refY="3"
            orient="auto"
          >
            <path
              d="M 0 0 L 8 3 L 0 6"
              fill={endArrow === "filled" ? strokeColor : "none"}
              stroke={strokeColor}
              strokeWidth="1"
            />
          </marker>
        ) : null}
      </defs>
      <path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={dashArray}
        vectorEffect="non-scaling-stroke"
        markerStart={
          startArrow !== "none" ? "url(#connector-start-arrow-v7)" : undefined
        }
        markerEnd={
          endArrow !== "none" ? "url(#connector-end-arrow-v7)" : undefined
        }
      />
    </svg>
  );
}

function connectorEndpointPoint(endpoint: ConnectorEndpoint): {
  x: number;
  y: number;
} {
  if (endpoint.kind === "point") return endpoint.point;
  switch (endpoint.anchor) {
    case "top":
      return { x: 50, y: 0 };
    case "right":
      return { x: 100, y: 50 };
    case "bottom":
      return { x: 50, y: 100 };
    case "left":
      return { x: 0, y: 50 };
    case "center":
    default:
      return { x: 50, y: 50 };
  }
}

// ---------------------------------------------------------------------------
// SlideNodeRenderer
// ---------------------------------------------------------------------------

export interface SlideNodeRendererProps {
  node: ResolvedRenderNode;
  /** Called when the node is clicked (editor usage). */
  onClick?: (nodeId: string, event: React.MouseEvent) => void;
  /** Called when the node is double-clicked (enter inline edit mode). */
  onDoubleClick?: (nodeId: string, event: React.MouseEvent) => void;
  /** Called when pointer drag starts on the node (editor usage). */
  onPointerDown?: (nodeId: string, event: React.PointerEvent) => void;
  /** When true, renders a selection ring around the node. */
  selected?: boolean;
  /** When true, renders a pre-selection hover ring. */
  hovered?: boolean;
  /** When true, this node is the current keyboard focus target. */
  focused?: boolean;
  /** When true, the node participates in the stage roving-tabindex model. */
  interactive?: boolean;
  /** Tab index assigned by the stage roving-tabindex model. */
  tabIndex?: number;
  /** Called when the node receives keyboard focus. */
  onFocus?: (nodeId: string, event: React.FocusEvent) => void;
  /** Called when pointer hover enters/leaves this node. */
  onHoverChange?: (nodeId: string, hovering: boolean) => void;
  /**
   * Resolves an asset id to its src URL for images/visuals.
   * Not required for nodes with no media.
   */
  assetResolver?: (id: string) => string | undefined;
  /** When true, renders this node at reduced visual fidelity (e.g. thumbnail). */
  preview?: boolean;
  /**
   * When true, hides this node from the canvas (used while inline editing
   * overlays the node so the live render and the editor don't double-render).
   */
  hidden?: boolean;
}

/**
 * Renders a single `ResolvedRenderNode` positioned absolutely within the slide
 * canvas viewport.  Each node type renders its own content via a dedicated
 * sub-renderer.
 *
 * Wrapped with `React.memo` so that unchanged nodes skip re-render when a
 * sibling is mutated.
 */
export const SlideNodeRenderer = memo(function SlideNodeRenderer({
  node,
  onClick,
  onDoubleClick,
  onPointerDown,
  selected = false,
  hovered = false,
  focused = false,
  interactive = false,
  tabIndex,
  onFocus,
  onHoverChange,
  assetResolver,
  preview = false,
  hidden = false,
}: SlideNodeRendererProps): JSX.Element | null {
  const { layout, style, content } = node;
  const transforms = [
    layout.rotation !== undefined ? `rotate(${layout.rotation}deg)` : undefined,
    layout.flipX ? "scaleX(-1)" : undefined,
    layout.flipY ? "scaleY(-1)" : undefined,
  ].filter(Boolean);

  const isLocked = node.locked === true;
  const outlineStyle: React.CSSProperties = selected
    ? isLocked
      ? {
          outline: "2px dashed var(--ds-border, #9ca3af)",
          outlineOffset: "1px",
        }
      : {
          outline: "2px solid var(--ds-accent-fill, #6366f1)",
          outlineOffset: "1px",
        }
    : hovered || focused
      ? {
          outline: "1px solid var(--ds-border, #cbd5e1)",
          outlineOffset: "1px",
        }
      : {};

  const containerStyle: React.CSSProperties = {
    ...frameToCss(layout.frame),
    ...(transforms.length > 0
      ? {
          transform: transforms.join(" "),
          transformOrigin: "center",
        }
      : {}),
    ...styleObjectToContainerCss(style, assetResolver),
    boxSizing: "border-box",
    cursor: onClick ? (isLocked ? "not-allowed" : "pointer") : "default",
    ...outlineStyle,
    // Hide when inline editor is active for this node
    ...(hidden ? { visibility: "hidden" } : {}),
  };

  const textCss = textStyleToCss(style.text);

  function handleClick(e: React.MouseEvent) {
    onClick?.(node.id, e);
  }

  function handleDoubleClick(e: React.MouseEvent) {
    onDoubleClick?.(node.id, e);
  }

  function handlePointerDown(e: React.PointerEvent) {
    onPointerDown?.(node.id, e);
  }

  function handleFocus(e: React.FocusEvent) {
    onFocus?.(node.id, e);
  }

  function handlePointerEnter() {
    onHoverChange?.(node.id, true);
  }

  function handlePointerLeave() {
    onHoverChange?.(node.id, false);
  }

  const inner = renderContent(content, style, assetResolver, preview);

  return (
    <div
      data-node-id={node.id}
      data-node-type={node.type}
      data-node-source={node.source}
      style={{ ...containerStyle, ...textCss }}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? tabIndex : undefined}
      aria-label={interactive ? accessibleNodeName(node) : undefined}
      aria-disabled={interactive && isLocked ? true : undefined}
      onClick={onClick ? handleClick : undefined}
      onDoubleClick={onDoubleClick ? handleDoubleClick : undefined}
      onPointerDown={onPointerDown ? handlePointerDown : undefined}
      onFocus={interactive ? handleFocus : undefined}
      onPointerEnter={interactive ? handlePointerEnter : undefined}
      onPointerLeave={interactive ? handlePointerLeave : undefined}
      aria-hidden={node.source === "themeDecoration" ? true : undefined}
    >
      {inner}
    </div>
  );
});

function accessibleNodeName(node: ResolvedRenderNode): string {
  if (node.content.type === "text") {
    const text = node.content.content.paragraphs
      .map((paragraph) => paragraph.text.trim())
      .filter(Boolean)
      .join(" ");
    return text ? `Text: ${text}` : "Text node";
  }
  if (node.content.type === "shape") {
    return `${node.content.content.shape} shape`;
  }
  if (node.content.type === "image") {
    return node.content.content.alt ?? "Image node";
  }
  if (node.content.type === "visual") {
    return (
      node.content.content.alt ?? node.content.content.visualId ?? "Visual node"
    );
  }
  if (node.content.type === "table") return "Table node";
  if (node.content.type === "connector") return "Connector node";
  return "Group node";
}

function renderContent(
  content: ResolvedNodeContent,
  style: StyleObject,
  assetResolver?: (id: string) => string | undefined,
  _preview?: boolean,
): JSX.Element | null {
  switch (content.type) {
    case "text":
      return <TextNodeContent content={content.content} />;

    case "shape":
      return (
        <ShapeNodeContent
          shape={content.content.shape}
          text={content.content.text}
          path={content.content.path}
          style={style}
        />
      );

    case "image":
      return (
        <ImageNodeContent
          assetId={content.content.assetId}
          alt={content.content.alt}
          fit={content.content.fit ?? style.image?.fit}
          crop={content.content.crop}
          imageStyle={style.image}
          assetResolver={assetResolver}
        />
      );

    case "table":
      return <TableNodeContent content={content.content} style={style} />;

    case "visual":
      return (
        <VisualNodeContent
          assetId={content.content.assetId}
          alt={content.content.alt}
          assetResolver={assetResolver}
        />
      );

    case "connector":
      return <ConnectorNodeContent content={content.content} style={style} />;

    case "group":
      // Group children are rendered by the parent SlideCanvas, not here.
      return null;

    default: {
      void (content satisfies never);
      return null;
    }
  }
}
