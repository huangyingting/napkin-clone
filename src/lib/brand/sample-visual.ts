/**
 * Sample visual fixture used by Brand Studio for live previews and the
 * free-user teaser (US-007 / issue #163).
 *
 * Intentionally DOM-free so it can be tested with node:test.
 */

import {
  VISUAL_SCHEMA_VERSION,
  DEFAULT_STYLE,
  type Visual,
} from "@/lib/visual/schema";
import type { BrandStyle } from "@/lib/brand/schema";
import { applyBrand } from "@/lib/brand/transforms";

/**
 * A small four-node flowchart used as the brand preview canvas.
 * Never mutated — `buildSampleBrandedVisual` always produces a fresh copy.
 */
export const SAMPLE_VISUAL_BASE: Visual = {
  version: VISUAL_SCHEMA_VERSION,
  type: "flowchart",
  title: "Sample Preview",
  width: 520,
  height: 280,
  nodes: [
    { id: "s1", label: "Discover", x: 70, y: 140 },
    { id: "s2", label: "Define", x: 220, y: 140 },
    { id: "s3", label: "Develop", x: 380, y: 80 },
    { id: "s4", label: "Deliver", x: 380, y: 200 },
  ],
  edges: [
    { id: "e1", from: "s1", to: "s2" },
    { id: "e2", from: "s2", to: "s3" },
    { id: "e3", from: "s2", to: "s4" },
  ],
  style: { ...DEFAULT_STYLE, palette: [...DEFAULT_STYLE.palette] },
};

/** A fixed sample brand used in the free-user teaser. */
export const SAMPLE_BRAND: BrandStyle = {
  id: "__sample__",
  name: "Acme Brand",
  ownerId: "",
  palette: ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"],
  background: "#f5f3ff",
  nodeFill: "#eef2ff",
  nodeStroke: "#4f46e5",
  nodeText: "#312e81",
  edgeColor: "#a5b4fc",
  fontFamily: "'Inter', sans-serif",
  fontAssetUrl: null,
  logoAssetUrl: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

/**
 * Returns a new Visual with `brand`'s colors/font applied to the sample
 * flowchart.  The base fixture is never mutated.
 */
export function buildSampleBrandedVisual(brand: BrandStyle): Visual {
  return applyBrand(SAMPLE_VISUAL_BASE, brand);
}
