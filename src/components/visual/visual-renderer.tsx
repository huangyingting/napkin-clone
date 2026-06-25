import { forwardRef, useId } from "react";

import { contentViewBox } from "@/lib/visual/layout";
import type { Visual } from "@/lib/visual/schema";
import {
  DotGridPattern,
  EffectFilterDefs,
  EffectWrappedBody,
  GradientDefs,
  RuledPattern,
} from "./renderer/canvas";

/**
 * SVG renderer that draws a {@link Visual} from the schema. It is intentionally
 * directive-free (no hooks / no `"use client"`) so it can render in server
 * components (gallery, read-only share pages) and client components (editor)
 * alike. Output is deterministic — arrowheads are drawn as explicit polygons
 * rather than `<marker>`s so there are no id collisions or hydration concerns.
 */
export const VisualRenderer = forwardRef<
  SVGSVGElement,
  {
    visual: Visual;
    className?: string;
    title?: string;
    /**
     * When `true`, the SVG background `<rect>` (and canvas-style pattern
     * overlay) is suppressed so the visual sits directly on whatever surface
     * contains it (e.g. a dark slide theme in present mode).
     *
     * Defaults to `false`. Only set this in presentation-slide rendering;
     * leave it unset in the editor, share/embed, and export paths so the
     * visual keeps its own authored background colour.
     */
    transparentBackground?: boolean;
  }
>(function VisualRenderer(
  { visual, className, title, transparentBackground = false },
  ref,
) {
  const uid = useId().replace(/:/g, "");
  const label = title ?? visual.title ?? `${visual.type} visual`;
  const fillMap = new Map<string, string>();
  for (let i = 0; i < visual.nodes.length; i++) {
    const node = visual.nodes[i];
    const fill =
      node.color ??
      visual.style.palette[i % visual.style.palette.length] ??
      visual.style.nodeFill;
    fillMap.set(node.id, fill);
  }

  const canvasStyle = visual.canvasStyle ?? "blank";
  const patternId = `${uid}-canvas-pattern`;
  const patternStroke = visual.style.edgeColor;
  const effects = visual.effects ?? [];
  const vb = contentViewBox(visual);

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${vb.x} ${vb.y} ${vb.width} ${vb.height}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      role="img"
      aria-label={label}
    >
      <GradientDefs nodes={visual.nodes} fills={fillMap} uid={uid} />
      {canvasStyle !== "blank" && (
        <defs>
          {canvasStyle === "ruled" && (
            <RuledPattern id={patternId} strokeColor={patternStroke} />
          )}
          {canvasStyle === "dot-grid" && (
            <DotGridPattern id={patternId} strokeColor={patternStroke} />
          )}
        </defs>
      )}
      {effects.length > 0 && <EffectFilterDefs effects={effects} uid={uid} />}
      {!transparentBackground && (
        <rect
          x={vb.x}
          y={vb.y}
          width={vb.width}
          height={vb.height}
          fill={visual.style.background}
        />
      )}
      {canvasStyle !== "blank" && !transparentBackground && (
        <rect
          x={vb.x}
          y={vb.y}
          width={vb.width}
          height={vb.height}
          fill={`url(#${patternId})`}
        />
      )}
      <EffectWrappedBody
        visual={visual}
        effects={effects}
        uid={uid}
        transparentBackground={transparentBackground}
      />
    </svg>
  );
});
