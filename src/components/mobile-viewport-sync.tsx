"use client";

import { useEffect } from "react";

import {
  mobileViewportCssVars,
  resolveMobileViewportSize,
} from "@/lib/mobile-viewport";

export function MobileViewportSync() {
  useEffect(() => {
    const root = document.documentElement;
    const applyViewportVars = () => {
      const vars = mobileViewportCssVars(resolveMobileViewportSize(window));
      for (const [name, value] of Object.entries(vars)) {
        root.style.setProperty(name, value);
      }
    };

    applyViewportVars();
    window.addEventListener("resize", applyViewportVars);
    window.addEventListener("orientationchange", applyViewportVars);
    window.visualViewport?.addEventListener("resize", applyViewportVars);
    window.visualViewport?.addEventListener("scroll", applyViewportVars);
    return () => {
      window.removeEventListener("resize", applyViewportVars);
      window.removeEventListener("orientationchange", applyViewportVars);
      window.visualViewport?.removeEventListener("resize", applyViewportVars);
      window.visualViewport?.removeEventListener("scroll", applyViewportVars);
    };
  }, []);

  return null;
}
