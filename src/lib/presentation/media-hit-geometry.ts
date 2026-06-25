import type { ElementBox, SlideElement } from "./deck";
import type { MediaHitGeometry } from "./stage-hit-test";
import type { Visual, VisualNode } from "@/lib/visual/schema";

interface BuildMediaHitGeometryOptions {
  elements: readonly SlideElement[];
  fittedBoxes: ReadonlyMap<string, ElementBox>;
  visuals: ReadonlyMap<string, Visual>;
}

function clampRegion(
  region: ElementBox,
  bounds: ElementBox,
): ElementBox | null {
  const x1 = Math.max(bounds.x, region.x);
  const y1 = Math.max(bounds.y, region.y);
  const x2 = Math.min(bounds.x + bounds.w, region.x + region.w);
  const y2 = Math.min(bounds.y + bounds.h, region.y + region.h);
  const w = x2 - x1;
  const h = y2 - y1;
  return w > 0.05 && h > 0.05 ? { x: x1, y: y1, w, h } : null;
}

function nodeBox(
  node: VisualNode,
  visual: Visual,
  elementBox: ElementBox,
): ElementBox | null {
  if (node.x === undefined || node.y === undefined) return null;
  const nodeWidth = node.width ?? 150;
  const nodeHeight = node.height ?? 56;
  const visualWidth = Math.max(1, visual.width);
  const visualHeight = Math.max(1, visual.height);
  const region = {
    x: elementBox.x + ((node.x - nodeWidth / 2) / visualWidth) * elementBox.w,
    y: elementBox.y + ((node.y - nodeHeight / 2) / visualHeight) * elementBox.h,
    w: (nodeWidth / visualWidth) * elementBox.w,
    h: (nodeHeight / visualHeight) * elementBox.h,
  };
  return clampRegion(region, elementBox);
}

function visualRegions(visual: Visual, elementBox: ElementBox): ElementBox[] {
  return visual.nodes
    .map((node) => nodeBox(node, visual, elementBox))
    .filter((region): region is ElementBox => region !== null);
}

export function buildMediaHitGeometry({
  elements,
  fittedBoxes,
  visuals,
}: BuildMediaHitGeometryOptions): Map<string, MediaHitGeometry> {
  const mediaGeometry = new Map<string, MediaHitGeometry>();

  for (const element of elements) {
    if (element.hidden) continue;
    if (element.kind === "visual") {
      const visual = visuals.get(element.visualId);
      if (!visual) continue;
      const box = fittedBoxes.get(element.id) ?? element.box;
      const regions = visualRegions(visual, box);
      if (regions.length > 0) mediaGeometry.set(element.id, { regions });
    }
  }

  return mediaGeometry;
}
