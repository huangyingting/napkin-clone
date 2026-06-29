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
  TableContent,
  ShapeKind,
} from "@/lib/presentation-vnext/schema";

// ---------------------------------------------------------------------------
// CSS conversion helpers
// ---------------------------------------------------------------------------

function colorValueToCss(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  return undefined;
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
      return { background: `linear-gradient(${angle}deg, ${from}, ${to})` };
    }
    case "radialGradient": {
      const inner = colorValueToCss(fill.inner) ?? "transparent";
      const outer = colorValueToCss(fill.outer) ?? "transparent";
      return { background: `radial-gradient(circle, ${inner}, ${outer})` };
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
    ...(style.opacity !== undefined ? { opacity: style.opacity } : {}),
    ...(style.clip?.enabled ? { overflow: "hidden" } : {}),
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

function TextNodeContent({ content }: { content: TextContent }): JSX.Element {
  return (
    <div className="h-full w-full overflow-hidden">
      {content.paragraphs.map((para) => (
        <p key={para.id} style={{ margin: 0 }}>
          {para.runs && para.runs.length > 0
            ? para.runs.map((run, i) => {
                const runStyle: React.CSSProperties = {
                  ...(run.bold ? { fontWeight: "bold" } : {}),
                  ...(run.italic ? { fontStyle: "italic" } : {}),
                  ...(run.underline ? { textDecoration: "underline" } : {}),
                  ...(run.code ? { fontFamily: "monospace" } : {}),
                  ...(run.localStyle?.color
                    ? { color: run.localStyle.color as string }
                    : {}),
                  ...(run.localStyle?.fontSizePt
                    ? { fontSize: `${run.localStyle.fontSizePt}pt` }
                    : {}),
                  ...(run.localStyle?.fontFamily
                    ? { fontFamily: run.localStyle.fontFamily as string }
                    : {}),
                };
                return run.link ? (
                  <a
                    key={i}
                    href={run.link}
                    style={runStyle}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {run.text}
                  </a>
                ) : (
                  <span key={i} style={runStyle}>
                    {run.text}
                  </span>
                );
              })
            : para.text}
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
  assetResolver,
}: {
  assetId: string;
  alt?: string;
  fit?: string;
  assetResolver?: (id: string) => string | undefined;
}): JSX.Element {
  const src = assetResolver?.(assetId);
  const objectFit = (fit as React.CSSProperties["objectFit"]) ?? "cover";
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
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt ?? ""}
      style={{ objectFit, width: "100%", height: "100%", display: "block" }}
    />
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

  return (
    <table className="h-full w-full border-collapse text-[inherit]">
      {content.header && content.rows.length > 0 && (
        <thead>
          <tr style={{ backgroundColor: headerFill }}>
            {content.columns.map((col) => (
              <th
                key={col.id}
                className="px-2 py-1 text-left text-xs font-semibold"
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
              >
                {cell.runs && cell.runs.length > 0
                  ? cell.runs.map((r, i) => <span key={i}>{r.text}</span>)
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

function ConnectorNodeContent(): JSX.Element {
  // Rendered as an SVG spanning the node's frame box
  return (
    <svg
      className="absolute inset-0 h-full w-full overflow-visible"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <line
        x1="0"
        y1="50"
        x2="100"
        y2="50"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// SlideNodeRenderer
// ---------------------------------------------------------------------------

export interface SlideNodeRendererProps {
  node: ResolvedRenderNode;
  /** Called when the node is clicked (editor usage). */
  onClick?: (nodeId: string, event: React.MouseEvent) => void;
  /** When true, renders a selection ring around the node. */
  selected?: boolean;
  /**
   * Resolves an asset id to its src URL for images/visuals.
   * Not required for nodes with no media.
   */
  assetResolver?: (id: string) => string | undefined;
  /** When true, renders this node at reduced visual fidelity (e.g. thumbnail). */
  preview?: boolean;
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
  selected = false,
  assetResolver,
  preview = false,
}: SlideNodeRendererProps): JSX.Element | null {
  const { layout, style, content } = node;

  const containerStyle: React.CSSProperties = {
    ...frameToCss(layout.frame),
    ...(layout.rotation !== undefined
      ? {
          transform: `rotate(${layout.rotation}deg)`,
          transformOrigin: "center",
        }
      : {}),
    ...styleObjectToContainerCss(style, assetResolver),
    boxSizing: "border-box",
    cursor: onClick ? "pointer" : "default",
    // Selection ring overrides border
    ...(selected
      ? {
          outline: "2px solid var(--ds-accent-fill, #6366f1)",
          outlineOffset: "1px",
        }
      : {}),
  };

  const textCss = textStyleToCss(style.text);

  function handleClick(e: React.MouseEvent) {
    onClick?.(node.id, e);
  }

  const inner = renderContent(content, style, assetResolver, preview);

  return (
    <div
      data-node-id={node.id}
      data-node-type={node.type}
      data-node-source={node.source}
      style={{ ...containerStyle, ...textCss }}
      onClick={onClick ? handleClick : undefined}
      aria-hidden={node.source === "themeDecoration" ? true : undefined}
    >
      {inner}
    </div>
  );
});

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
      return <ConnectorNodeContent />;

    case "group":
      // Group children are rendered by the parent SlideCanvas, not here.
      return null;

    default: {
      void (content satisfies never);
      return null;
    }
  }
}
