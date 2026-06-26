/**
 * SVG / slide-image rendering: converts {@link DeckSlideSpec} descriptors into
 * SVG strings and optionally rasterises them to PNG, then zips the result.
 *
 * This module is browser-only (uses DOMParser / XMLSerializer / FileReader) and
 * has no PptxGenJS dependency. The SVG renderer is a parallel path to the PPTX
 * applier — both consume the same spec descriptors produced by
 * deck-export-spec.ts.
 */

import type { Deck, TextRun } from "@/lib/presentation/deck";
import type { Visual } from "@/lib/visual/schema";
import { toHex } from "@/lib/visual/pptx-shapes";
import type { PptxSpec } from "@/lib/visual/pptx-shapes";
import {
  buildDeckSpecs,
  deckGeometry,
  type DeckBulletsOp,
  type DeckConnectorOp,
  type DeckImageOp,
  type DeckOp,
  type DeckShapeOp,
  type DeckSlideSpec,
  type DeckTextOp,
  type DeckVisualFallbackOp,
} from "@/lib/visual/deck-export-spec";

// ---------------------------------------------------------------------------
// Public option types
// ---------------------------------------------------------------------------

export type DeckSlideImageFormat = "svg" | "png";

export interface DeckSlideImageExportOptions {
  /**
   * Output format for each slide inside the returned ZIP archive.
   * Defaults to `"svg"` for maximum fidelity.
   */
  format?: DeckSlideImageFormat;
  /**
   * Raster scale multiplier when `format === "png"`.
   * Defaults to `1` because the exported slide SVG is already high resolution.
   */
  scale?: number;
}

// ---------------------------------------------------------------------------
// Internal geometry
// ---------------------------------------------------------------------------

interface SlideImageGeometry {
  width: number;
  height: number;
  pxPerIn: number;
}

const SLIDE_IMAGE_PX_PER_IN = 120;

function slideImageGeometry(format: Deck["slideFormat"]): SlideImageGeometry {
  const geometry = deckGeometry(format);
  return {
    width: Math.round(geometry.slideW * SLIDE_IMAGE_PX_PER_IN),
    height: Math.round(geometry.slideH * SLIDE_IMAGE_PX_PER_IN),
    pxPerIn: SLIDE_IMAGE_PX_PER_IN,
  };
}

// ---------------------------------------------------------------------------
// SVG rendering utilities
// ---------------------------------------------------------------------------

function px(valueInches: number, pxPerIn: number): string {
  return (Math.round(valueInches * pxPerIn * 1000) / 1000).toString();
}

function pxFromPt(valuePt: number, pxPerIn: number): string {
  return (Math.round(((valuePt * pxPerIn) / 72) * 1000) / 1000).toString();
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function cssText(value: string | undefined): string {
  return value ? xmlEscape(value) : "";
}

function cssFontFace(fontFace: string | undefined): string {
  return fontFace ? `font-family:${cssText(fontFace)};` : "";
}

function shadowCss(enabled: boolean | undefined): string {
  return enabled ? "filter:drop-shadow(0px 4px 8px rgba(0,0,0,0.28));" : "";
}

function rotationTransform(
  x: number,
  y: number,
  w: number,
  h: number,
  rotation: number | undefined,
): string {
  if (!rotation) return "";
  const cx = x + w / 2;
  const cy = y + h / 2;
  return ` transform="rotate(${rotation} ${cx} ${cy})"`;
}

/** Monospace font face used to render inline-code runs in SVG slides. */
const CODE_FONT_FACE = "Courier New";

function textHtml(text: string, runs?: TextRun[]): string {
  if (runs && runs.length > 0) {
    return runs
      .map((run) => {
        if (run.text === "\n") return "<br/>";
        const styles = [
          run.bold ? "font-weight:700;" : "",
          run.italic ? "font-style:italic;" : "",
          run.code ? `font-family:${CODE_FONT_FACE};` : "",
          run.color ? `color:#${toHex(run.color)};` : "",
        ].join("");
        const content = xmlEscape(run.text).replaceAll("\n", "<br/>");
        const span = `<span style="${styles}">${content}</span>`;
        return run.link
          ? `<a href="${xmlEscape(run.link)}" style="color:inherit;text-decoration:inherit;">${span}</a>`
          : span;
      })
      .join("");
  }
  return xmlEscape(text).replaceAll("\n", "<br/>");
}

function renderTextForeignObject(
  op: Pick<
    DeckTextOp,
    | "x"
    | "y"
    | "w"
    | "h"
    | "text"
    | "runs"
    | "color"
    | "fontSize"
    | "fontFace"
    | "bold"
    | "italic"
    | "underline"
    | "align"
    | "verticalAlign"
    | "lineHeight"
    | "opacity"
    | "shadow"
    | "rotation"
  >,
  pxPerIn: number,
): string {
  const x = px(op.x, pxPerIn);
  const y = px(op.y, pxPerIn);
  const w = px(op.w, pxPerIn);
  const h = px(op.h, pxPerIn);
  const valign =
    op.verticalAlign === "top"
      ? "flex-start"
      : op.verticalAlign === "bottom"
        ? "flex-end"
        : "center";
  const outerStyle = [
    "width:100%;height:100%;display:flex;",
    `align-items:${valign};`,
    "justify-content:stretch;",
    `color:#${op.color};`,
    `font-size:${pxFromPt(op.fontSize, pxPerIn)}px;`,
    op.bold ? "font-weight:700;" : "font-weight:400;",
    op.italic ? "font-style:italic;" : "font-style:normal;",
    op.underline ? "text-decoration:underline;" : "",
    `text-align:${op.align};`,
    `line-height:${op.lineHeight ?? 1.15};`,
    "white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;",
    "overflow:hidden;",
    cssFontFace(op.fontFace),
    op.opacity !== undefined ? `opacity:${op.opacity};` : "",
    shadowCss(op.shadow),
  ].join("");
  const innerStyle = "width:100%;";
  return `<foreignObject x="${x}" y="${y}" width="${w}" height="${h}"${rotationTransform(
    op.x * pxPerIn,
    op.y * pxPerIn,
    op.w * pxPerIn,
    op.h * pxPerIn,
    op.rotation,
  )}><div xmlns="http://www.w3.org/1999/xhtml" style="${outerStyle}"><div style="${innerStyle}">${textHtml(
    op.text,
    op.runs,
  )}</div></div></foreignObject>`;
}

function renderBulletsForeignObject(
  op: DeckBulletsOp,
  pxPerIn: number,
): string {
  const bulletCounters = new Map<number, number>();
  const rows = op.items
    .map((item, index) => {
      const detail = op.itemDetails?.[index];
      const indent = detail?.indent ?? 0;
      const numbered = detail?.listType === "number";
      const current = (bulletCounters.get(indent) ?? 0) + 1;
      bulletCounters.set(indent, current);
      if (!numbered) bulletCounters.delete(indent + 1);
      const marker = numbered ? `${current}.` : "•";
      const html = textHtml(item, op.itemRuns?.[index]);
      return `<div style="display:flex;gap:0.5em;padding-left:${indent * 1.5}em;"><span style="width:1.2em;flex:0 0 1.2em;">${marker}</span><span style="flex:1 1 auto;">${html}</span></div>`;
    })
    .join("");
  return renderTextForeignObject(
    {
      ...op,
      text: "",
      runs: undefined,
      shadow: op.shadow,
    },
    pxPerIn,
  ).replace(
    "</div></div></foreignObject>",
    `${rows}</div></div></foreignObject>`,
  );
}

function renderShapeLabel(op: DeckShapeOp, pxPerIn: number): string {
  if (!op.text || op.shape === "line") return "";
  return renderTextForeignObject(
    {
      x: op.x + op.w * 0.08,
      y: op.y + op.h * 0.08,
      w: op.w * 0.84,
      h: op.h * 0.84,
      text: op.text,
      runs: op.textRuns,
      color: op.textColor ?? "18181B",
      fontSize: op.fontSize ?? 18,
      fontFace: op.fontFace,
      bold: op.bold ?? false,
      italic: op.italic ?? false,
      underline: op.underline,
      align: op.align ?? "center",
      verticalAlign: "middle",
      opacity: op.opacity,
      shadow: false,
      rotation: undefined,
      lineHeight: undefined,
    },
    pxPerIn,
  );
}

function renderShapeSvg(op: DeckShapeOp, pxPerIn: number): string {
  const x = op.x * pxPerIn;
  const y = op.y * pxPerIn;
  const w = op.w * pxPerIn;
  const h = op.h * pxPerIn;
  const fillOpacity = op.opacity ?? 1;
  const lineWidth = op.stroke ? Number(pxFromPt(op.stroke.width, pxPerIn)) : 0;
  const dash = op.stroke?.dash
    ? ` stroke-dasharray="${lineWidth * 3} ${lineWidth * 2}"`
    : "";
  const common = `fill="#${op.color}" fill-opacity="${fillOpacity}" stroke="#${op.stroke?.color ?? op.color}" stroke-width="${lineWidth}"${dash}`;
  const transform = rotationTransform(x, y, w, h, op.rotation);
  const groupStyle = shadowCss(op.shadow);
  let shapeSvg = "";

  switch (op.shape) {
    case "ellipse":
      shapeSvg = `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${common} />`;
      break;
    case "triangle":
      shapeSvg = `<polygon points="${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}" ${common} />`;
      break;
    case "line":
      shapeSvg = `<line x1="${x}" y1="${y + h / 2}" x2="${x + w}" y2="${y + h / 2}" stroke="#${op.stroke?.color ?? op.color}" stroke-width="${lineWidth || 1}" stroke-opacity="${fillOpacity}"${dash} />`;
      break;
    default:
      shapeSvg = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${op.radius ? op.radius * pxPerIn : 0}" ry="${op.radius ? op.radius * pxPerIn : 0}" ${common} />`;
      break;
  }

  return `<g${transform}${groupStyle ? ` style="${groupStyle}"` : ""}>${shapeSvg}${renderShapeLabel(
    op,
    pxPerIn,
  )}</g>`;
}

function renderImageSvg(
  op: DeckImageOp | DeckVisualFallbackOp,
  id: string,
  href: string,
  pxPerIn: number,
): { defs: string[]; body: string } {
  const x = op.x * pxPerIn;
  const y = op.y * pxPerIn;
  const w = op.w * pxPerIn;
  const h = op.h * pxPerIn;
  const defs: string[] = [];
  let clip = "";
  if ("radius" in op && op.radius) {
    const clipId = `${id}-clip`;
    defs.push(
      `<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${op.radius * pxPerIn}" ry="${op.radius * pxPerIn}" /></clipPath>`,
    );
    clip = ` clip-path="url(#${clipId})"`;
  }
  const preserveAspectRatio =
    "fitMode" in op && op.fitMode === "cover"
      ? "xMidYMid slice"
      : "xMidYMid meet";
  const style = [
    op.opacity !== undefined ? `opacity:${op.opacity};` : "",
    shadowCss(op.shadow),
  ].join("");
  return {
    defs,
    body: `<image href="${xmlEscape(href)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${preserveAspectRatio}"${clip}${style ? ` style="${style}"` : ""}${rotationTransform(
      x,
      y,
      w,
      h,
      op.rotation,
    )} />`,
  };
}

function renderConnectorSvg(
  op: DeckConnectorOp,
  id: string,
  pxPerIn: number,
): { defs: string[]; body: string } {
  const defs: string[] = [];
  const x1 = op.x1 * pxPerIn;
  const y1 = op.y1 * pxPerIn;
  const x2 = op.x2 * pxPerIn;
  const y2 = op.y2 * pxPerIn;
  const strokeWidth = Number(pxFromPt(op.width, pxPerIn));
  const markers: string[] = [];
  let markerStart = "";
  let markerEnd = "";

  if (op.arrowStart && op.arrowStart !== "none") {
    const markerId = `${id}-start`;
    defs.push(
      `<marker id="${markerId}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 Z" fill="${op.arrowStart === "filled" ? `#${op.color}` : "none"}" stroke="#${op.color}" stroke-width="1.2" /></marker>`,
    );
    markerStart = ` marker-start="url(#${markerId})"`;
  }
  if (op.arrowEnd && op.arrowEnd !== "none") {
    const markerId = `${id}-end`;
    defs.push(
      `<marker id="${markerId}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="${op.arrowEnd === "filled" ? `#${op.color}` : "none"}" stroke="#${op.color}" stroke-width="1.2" /></marker>`,
    );
    markerEnd = ` marker-end="url(#${markerId})"`;
  }
  if (markers.length > 0) defs.push(...markers);

  return {
    defs,
    body: `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#${op.color}" stroke-width="${strokeWidth}" stroke-linecap="round"${op.dash ? ` stroke-dasharray="${strokeWidth * 3} ${strokeWidth * 2}"` : ""}${op.opacity !== undefined ? ` stroke-opacity="${op.opacity}"` : ""}${markerStart}${markerEnd} />`,
  };
}

function renderPptxSpecSvg(
  spec: PptxSpec,
  id: string,
  pxPerIn: number,
): { defs: string[]; body: string } {
  switch (spec.kind) {
    case "rect":
      return {
        defs: [],
        body: `<rect x="${px(spec.x, pxPerIn)}" y="${px(spec.y, pxPerIn)}" width="${px(spec.w, pxPerIn)}" height="${px(spec.h, pxPerIn)}" rx="${spec.cornerRadius ? px(spec.cornerRadius, pxPerIn) : 0}" ry="${spec.cornerRadius ? px(spec.cornerRadius, pxPerIn) : 0}" fill="#${spec.fill}"${spec.fillTransparency !== undefined ? ` fill-opacity="${(100 - spec.fillTransparency) / 100}"` : ""} stroke="#${spec.stroke}" stroke-width="${pxFromPt(spec.strokeWidth, pxPerIn)}" />`,
      };
    case "ellipse":
      return {
        defs: [],
        body: `<ellipse cx="${Number(px(spec.x, pxPerIn)) + Number(px(spec.w, pxPerIn)) / 2}" cy="${Number(px(spec.y, pxPerIn)) + Number(px(spec.h, pxPerIn)) / 2}" rx="${Number(px(spec.w, pxPerIn)) / 2}" ry="${Number(px(spec.h, pxPerIn)) / 2}" fill="#${spec.fill}"${spec.fillTransparency !== undefined ? ` fill-opacity="${(100 - spec.fillTransparency) / 100}"` : ""} stroke="#${spec.stroke}" stroke-width="${pxFromPt(spec.strokeWidth, pxPerIn)}" />`,
      };
    case "diamond": {
      const x = spec.x * pxPerIn;
      const y = spec.y * pxPerIn;
      const w = spec.w * pxPerIn;
      const h = spec.h * pxPerIn;
      return {
        defs: [],
        body: `<polygon points="${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}" fill="#${spec.fill}" stroke="#${spec.stroke}" stroke-width="${pxFromPt(spec.strokeWidth, pxPerIn)}" />`,
      };
    }
    case "hexagon": {
      const x = spec.x * pxPerIn;
      const y = spec.y * pxPerIn;
      const w = spec.w * pxPerIn;
      const h = spec.h * pxPerIn;
      const inset = w * 0.25;
      return {
        defs: [],
        body: `<polygon points="${x + inset},${y} ${x + w - inset},${y} ${x + w},${y + h / 2} ${x + w - inset},${y + h} ${x + inset},${y + h} ${x},${y + h / 2}" fill="#${spec.fill}" stroke="#${spec.stroke}" stroke-width="${pxFromPt(spec.strokeWidth, pxPerIn)}" />`,
      };
    }
    case "line":
      return renderConnectorSvg(
        {
          kind: "connector",
          x1: spec.x1,
          y1: spec.y1,
          x2: spec.x2,
          y2: spec.y2,
          color: spec.color,
          width: spec.strokeWidth,
          ...(spec.arrowEnd ? { arrowEnd: "arrow" as const } : {}),
          ...(spec.dashed ? { dash: true } : {}),
        },
        id,
        pxPerIn,
      );
    case "text":
      return {
        defs: [],
        body: renderTextForeignObject(
          {
            x: spec.x,
            y: spec.y,
            w: spec.w,
            h: spec.h,
            text: spec.text,
            color: spec.color,
            fontSize: spec.fontSize,
            fontFace: spec.fontFace,
            bold: spec.bold ?? false,
            italic: false,
            align: spec.align ?? "center",
            verticalAlign: "middle",
          },
          pxPerIn,
        ),
      };
    case "image-fallback":
      return { defs: [], body: "" };
  }
}

function slideSpecToSvgString(
  slideSpec: DeckSlideSpec,
  geometry: SlideImageGeometry,
  getSvg: (visualId: string) => SVGSVGElement | null,
): string {
  const defs: string[] = [];
  const body: string[] = [];

  body.push(
    `<rect x="0" y="0" width="${geometry.width}" height="${geometry.height}" fill="#${slideSpec.background}" />`,
  );

  if (slideSpec.backgroundImage) {
    body.push(
      `<image href="${xmlEscape(slideSpec.backgroundImage)}" x="0" y="0" width="${geometry.width}" height="${geometry.height}" preserveAspectRatio="xMidYMid slice" />`,
    );
  }

  slideSpec.ops.forEach((op: DeckOp, index: number) => {
    const id = `slide-${slideSpec.index}-${index}`;
    switch (op.kind) {
      case "text":
        body.push(renderTextForeignObject(op, geometry.pxPerIn));
        break;
      case "bullets":
        body.push(renderBulletsForeignObject(op, geometry.pxPerIn));
        break;
      case "shape":
        body.push(renderShapeSvg(op, geometry.pxPerIn));
        break;
      case "image": {
        const rendered = renderImageSvg(op, id, op.src, geometry.pxPerIn);
        defs.push(...rendered.defs);
        body.push(rendered.body);
        break;
      }
      case "connector": {
        const rendered = renderConnectorSvg(op, id, geometry.pxPerIn);
        defs.push(...rendered.defs);
        body.push(rendered.body);
        break;
      }
      case "visual-native":
        op.specs.forEach((spec, specIndex) => {
          const rendered = renderPptxSpecSvg(
            spec,
            `${id}-native-${specIndex}`,
            geometry.pxPerIn,
          );
          defs.push(...rendered.defs);
          body.push(rendered.body);
        });
        break;
      case "visual-fallback": {
        const svg = getSvg(op.visualId);
        if (!svg) break;
        const viewBox =
          svg.getAttribute("viewBox") ??
          `0 0 ${svg.viewBox.baseVal.width} ${svg.viewBox.baseVal.height}`;
        const inner = new XMLSerializer()
          .serializeToString(svg)
          .replace(/^<svg\b[^>]*>/i, "")
          .replace(/<\/svg>\s*$/i, "");
        const rendered = renderImageSvg(op, id, "", geometry.pxPerIn);
        defs.push(...rendered.defs);
        body.push(
          `<svg x="${px(op.x, geometry.pxPerIn)}" y="${px(op.y, geometry.pxPerIn)}" width="${px(op.w, geometry.pxPerIn)}" height="${px(op.h, geometry.pxPerIn)}" viewBox="${xmlEscape(viewBox)}" preserveAspectRatio="xMidYMid meet"${
            op.opacity !== undefined || op.shadow || op.rotation
              ? `${rotationTransform(
                  op.x * geometry.pxPerIn,
                  op.y * geometry.pxPerIn,
                  op.w * geometry.pxPerIn,
                  op.h * geometry.pxPerIn,
                  op.rotation,
                )}${
                  op.shadow || op.opacity !== undefined
                    ? ` style="${[
                        op.opacity !== undefined
                          ? `opacity:${op.opacity};`
                          : "",
                        shadowCss(op.shadow),
                      ].join("")}"`
                    : ""
                }`
              : ""
          }>${inner}</svg>`,
        );
        break;
      }
    }
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${geometry.width}" height="${geometry.height}" viewBox="0 0 ${geometry.width} ${geometry.height}" overflow="hidden">
${defs.length > 0 ? `<defs>${defs.join("")}</defs>` : ""}
${body.join("")}
</svg>`;
}

function parseSvg(svgString: string): SVGSVGElement | null {
  const parsed = new DOMParser().parseFromString(svgString, "image/svg+xml");
  const root = parsed.documentElement;
  return root instanceof SVGSVGElement || root.tagName === "svg"
    ? (root as unknown as SVGSVGElement)
    : null;
}

// ---------------------------------------------------------------------------
// Public orchestration
// ---------------------------------------------------------------------------

/**
 * Exports the deck as a ZIP archive containing one image per slide.
 *
 * - `"svg"` preserves the richest fidelity and is the default.
 * - `"png"` rasterizes the generated slide SVG at the requested scale.
 */
export async function exportDeckAsSlideImages(
  deck: Deck,
  visuals: ReadonlyMap<string, Visual>,
  getSvg: (visualId: string) => SVGSVGElement | null,
  options: DeckSlideImageExportOptions = {},
): Promise<Blob | null> {
  try {
    const [{ default: JSZip }, { exportPNG }] = await Promise.all([
      import("jszip"),
      import("@/lib/visual/export"),
    ]);
    const format = options.format ?? "svg";
    const specs = buildDeckSpecs(deck, visuals);
    const geometry = slideImageGeometry(deck.slideFormat);
    const zip = new JSZip();

    for (const slideSpec of specs) {
      const svgString = slideSpecToSvgString(slideSpec, geometry, getSvg);
      const fileBase = `slide-${String(slideSpec.index + 1).padStart(2, "0")}`;
      if (format === "svg") {
        zip.file(`${fileBase}.svg`, svgString);
        continue;
      }

      const svg = parseSvg(svgString);
      if (!svg) return null;
      const pngBlob = await exportPNG(svg, {
        background: "include",
        colorMode: "color",
        scale: options.scale ?? 1,
      });
      if (!pngBlob) return null;
      zip.file(`${fileBase}.png`, pngBlob);
    }

    return zip.generateAsync({ type: "blob" });
  } catch {
    return null;
  }
}
