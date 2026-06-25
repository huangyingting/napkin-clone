export interface ViewportSize {
  width: number;
  height: number;
  offsetTop: number;
  offsetLeft: number;
}

export interface VisualViewportLike {
  width: number;
  height: number;
  offsetTop?: number;
  offsetLeft?: number;
}

export interface WindowViewportLike {
  innerWidth: number;
  innerHeight: number;
  visualViewport?: VisualViewportLike | null;
}

export const MOBILE_VIEWPORT_CSS_VARS = {
  height: "--tiq-viewport-height",
  width: "--tiq-viewport-width",
  offsetTop: "--tiq-viewport-offset-top",
  offsetLeft: "--tiq-viewport-offset-left",
} as const;

export function resolveMobileViewportSize(
  win: WindowViewportLike,
): ViewportSize {
  const viewport = win.visualViewport;
  return {
    width: Math.round(viewport?.width ?? win.innerWidth),
    height: Math.round(viewport?.height ?? win.innerHeight),
    offsetTop: Math.round(viewport?.offsetTop ?? 0),
    offsetLeft: Math.round(viewport?.offsetLeft ?? 0),
  };
}

export function mobileViewportCssVars(
  size: ViewportSize,
): Record<string, string> {
  return {
    [MOBILE_VIEWPORT_CSS_VARS.height]: `${size.height}px`,
    [MOBILE_VIEWPORT_CSS_VARS.width]: `${size.width}px`,
    [MOBILE_VIEWPORT_CSS_VARS.offsetTop]: `${size.offsetTop}px`,
    [MOBILE_VIEWPORT_CSS_VARS.offsetLeft]: `${size.offsetLeft}px`,
  };
}
