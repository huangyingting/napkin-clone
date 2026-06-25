import type { JSX } from "react";

import type { Visual, VisualEffect, VisualNode } from "@/lib/visual/schema";
import { VisualBody } from "./families";

/** Builds a lighter highlight color for gradient fills. */
function lightenHex(hex: string): string {
  const stripped = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(stripped)) return hex;
  const r = parseInt(stripped.slice(0, 2), 16);
  const g = parseInt(stripped.slice(2, 4), 16);
  const b = parseInt(stripped.slice(4, 6), 16);
  const lr = Math.min(255, r + Math.round((255 - r) * 0.55));
  const lg = Math.min(255, g + Math.round((255 - g) * 0.55));
  const lb = Math.min(255, b + Math.round((255 - b) * 0.55));
  return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
}

/**
 * Renders `<linearGradient>` defs for any nodes that use `fillStyle:
 * "gradient"`. The gradient id is prefixed by the renderer instance id so
 * duplicated visuals on the same slide never share SVG definition IDs.
 */
export function GradientDefs({
  nodes,
  fills,
  uid,
}: {
  nodes: VisualNode[];
  fills: Map<string, string>;
  uid: string;
}): JSX.Element | null {
  const gradNodes = nodes.filter((n) => n.fillStyle === "gradient");
  if (gradNodes.length === 0) return null;
  return (
    <defs>
      {gradNodes.map((n) => {
        const base = fills.get(n.id) ?? "#eef2ff";
        const light = lightenHex(base);
        return (
          <linearGradient
            key={n.id}
            id={`${uid}-grad-${n.id}`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0%" stopColor={light} />
            <stop offset="100%" stopColor={base} />
          </linearGradient>
        );
      })}
    </defs>
  );
}

/** SVG pattern for ruled (horizontal lines) canvas style. */
export function RuledPattern({
  id,
  strokeColor,
}: {
  id: string;
  strokeColor: string;
}) {
  return (
    <pattern id={id} width="100%" height="24" patternUnits="userSpaceOnUse">
      <line
        x1="0"
        y1="23.5"
        x2="100%"
        y2="23.5"
        stroke={strokeColor}
        strokeWidth="0.5"
        strokeOpacity="0.25"
      />
    </pattern>
  );
}

/** SVG pattern for dot-grid canvas style. */
export function DotGridPattern({
  id,
  strokeColor,
}: {
  id: string;
  strokeColor: string;
}) {
  return (
    <pattern id={id} width="24" height="24" patternUnits="userSpaceOnUse">
      <circle cx="0" cy="0" r="1" fill={strokeColor} fillOpacity="0.3" />
      <circle cx="24" cy="0" r="1" fill={strokeColor} fillOpacity="0.3" />
      <circle cx="0" cy="24" r="1" fill={strokeColor} fillOpacity="0.3" />
      <circle cx="24" cy="24" r="1" fill={strokeColor} fillOpacity="0.3" />
    </pattern>
  );
}

/**
 * Renders SVG `<filter>` definitions for each active visual effect.
 * Uses a per-instance unique `uid` prefix so multiple VisualRenderer instances
 * on the same HTML page don't share filter IDs (inline SVG IDs are doc-scoped).
 */
export function EffectFilterDefs({
  effects,
  uid,
}: {
  effects: VisualEffect[];
  uid: string;
}): JSX.Element | null {
  if (effects.length === 0) return null;
  return (
    <defs>
      {effects.map((effect) => {
        const id = `${uid}fx_${effect.kind}`;
        if (effect.kind === "shadow") {
          const dx = effect.dx ?? 4;
          const dy = effect.dy ?? 4;
          const blur = effect.blur ?? 4;
          const color = effect.color ?? "rgba(0,0,0,0.3)";
          // Expand filter region so the shadow isn't clipped.
          return (
            <filter
              key={id}
              id={id}
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <feDropShadow
                dx={dx}
                dy={dy}
                stdDeviation={blur}
                floodColor={color}
              />
            </filter>
          );
        }
        if (effect.kind === "sketch") {
          const frequency = effect.frequency ?? 0.04;
          const scale = effect.scale ?? 3;
          return (
            <filter key={id} id={id} x="-5%" y="-5%" width="110%" height="110%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency={frequency}
                numOctaves={4}
                seed={2}
                result="noise"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale={scale}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          );
        }
        return null;
      })}
    </defs>
  );
}

/**
 * Wraps {@link VisualBody} in nested `<g filter="url(#…)">` elements — one per
 * active effect. Nesting ensures each filter gets an independent pass so that
 * e.g. shadow + sketch combine correctly without writing a bespoke merged filter.
 */
export function EffectWrappedBody({
  visual,
  effects,
  uid,
  transparentBackground,
}: {
  visual: Visual;
  effects: VisualEffect[];
  uid: string;
  transparentBackground: boolean;
}): JSX.Element {
  let inner: JSX.Element = (
    <VisualBody
      visual={visual}
      transparentBackground={transparentBackground}
      uid={uid}
    />
  );
  for (const effect of effects) {
    const filterId = `${uid}fx_${effect.kind}`;
    inner = <g filter={`url(#${filterId})`}>{inner}</g>;
  }
  return inner;
}
