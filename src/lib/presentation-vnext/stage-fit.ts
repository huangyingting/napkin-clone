export type StageFitSize = { width: number; height: number };

export type StageFitRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type CanvasStageFit = {
  frame: StageFitRect;
  scrollContentSize: StageFitSize;
  needsScroll: boolean;
};

export function fitCanvasToViewport({
  viewport,
  aspectRatio,
  zoomPercent,
  rightOverlayWidth = 0,
}: {
  viewport: StageFitSize;
  aspectRatio: number;
  zoomPercent: number;
  rightOverlayWidth?: number;
}): CanvasStageFit {
  const viewportWidth = Math.max(1, viewport.width);
  const viewportHeight = Math.max(1, viewport.height);
  const safeAspectRatio = aspectRatio > 0 ? aspectRatio : 16 / 9;
  const safeZoom = Math.max(0.25, Math.min(2, zoomPercent / 100));
  const viewportAspectRatio = viewportWidth / viewportHeight;
  const fitted =
    viewportAspectRatio > safeAspectRatio
      ? {
          width: viewportHeight * safeAspectRatio,
          height: viewportHeight,
        }
      : {
          width: viewportWidth,
          height: viewportWidth / safeAspectRatio,
        };

  const frameWidth = fitted.width * safeZoom;
  const frameHeight = fitted.height * safeZoom;
  const leftMargin = Math.max(0, (viewportWidth - frameWidth) / 2);
  const topMargin = Math.max(0, (viewportHeight - frameHeight) / 2);
  const leftShift = Math.min(leftMargin, Math.max(0, rightOverlayWidth) / 2);
  const frameLeft = leftMargin - leftShift;
  const frameTop = topMargin;
  const scrollContentSize = {
    width: Math.max(viewportWidth, frameLeft + frameWidth + leftMargin),
    height: Math.max(viewportHeight, frameTop + frameHeight + topMargin),
  };

  return {
    frame: {
      left: frameLeft,
      top: frameTop,
      width: frameWidth,
      height: frameHeight,
    },
    scrollContentSize,
    needsScroll:
      scrollContentSize.width > viewportWidth + 1 ||
      scrollContentSize.height > viewportHeight + 1,
  };
}
