import type { ImageElement, VisualElement } from "@/lib/presentation/deck";
import { isEmptyImageSrc } from "@/lib/presentation/image-element";
import type { PresentationTheme } from "@/lib/presentation/presentation-theme";
import type { Visual } from "@/lib/visual/schema";
import { resolveVisualThemeBridge } from "@/lib/visual/deck-visual-theme-bridge";
import { applyTheme } from "@/lib/visual/transforms";
import {
  isImageFallback,
  visualToNativeSpecs,
  type PptxSlideLayout,
} from "@/lib/visual/pptx-shapes";

interface OperationBox {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  shadow?: boolean;
  opacity?: number;
}

export function buildDeckImageOp(
  element: ImageElement,
  box: OperationBox,
  imageDefaults: PresentationTheme["image"] | undefined,
) {
  if (isEmptyImageSrc(element.src)) return null;

  return {
    kind: "image" as const,
    ...box,
    src: element.src,
    ...(element.alt ? { alt: element.alt } : {}),
    ...((element.fitMode ?? imageDefaults?.fitMode) !== undefined
      ? { fitMode: element.fitMode ?? imageDefaults?.fitMode }
      : {}),
    ...((element.maskShape ?? imageDefaults?.maskShape) !== undefined
      ? { maskShape: element.maskShape ?? imageDefaults?.maskShape }
      : {}),
    ...(element.crop !== undefined ? { crop: element.crop } : {}),
    ...((element.radius ?? imageDefaults?.radiusPct)
      ? {
          radius:
            ((element.radius ?? imageDefaults?.radiusPct ?? 0) / 100) *
            Math.min(box.w, box.h),
        }
      : {}),
  };
}

function layoutWithinBox(visual: Visual, box: OperationBox): PptxSlideLayout {
  const scale = Math.min(box.w / visual.width, box.h / visual.height);
  const usedW = visual.width * scale;
  const usedH = visual.height * scale;
  return {
    offsetX: box.x + (box.w - usedW) / 2,
    offsetY: box.y + (box.h - usedH) / 2,
    scale,
  };
}

export function buildDeckVisualOp(
  element: VisualElement,
  visual: Visual,
  box: OperationBox,
  visualDefaults: PresentationTheme["visual"] | undefined,
) {
  const bridge = resolveVisualThemeBridge(element.styleThemeId, visualDefaults);
  const styled = bridge.styleThemeId
    ? applyTheme(visual, bridge.styleThemeId)
    : visual;
  const layout = layoutWithinBox(styled, box);
  const specs = visualToNativeSpecs(styled, layout);

  if (isImageFallback(specs) || box.rotation || box.shadow || box.opacity) {
    return {
      kind: "visual-fallback" as const,
      ...box,
      visualId: element.visualId,
    };
  }

  return { kind: "visual-native" as const, specs };
}
