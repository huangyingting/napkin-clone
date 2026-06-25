"use client";

import { useCallback, useEffect, useState } from "react";

export function getFullscreenElement(doc: Document): Element | null {
  return doc.fullscreenElement ?? null;
}

export async function requestBrowserFullscreen(): Promise<boolean> {
  const root = document.documentElement;

  try {
    if (root.requestFullscreen) {
      await root.requestFullscreen();
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export async function exitBrowserFullscreen(): Promise<boolean> {
  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export function usePresenterFullscreen(): {
  isFullscreen: boolean;
  fullscreenHintVisible: boolean;
  setFullscreenHintVisible: (visible: boolean) => void;
  enterFullscreen: () => Promise<boolean>;
  toggleFullscreen: () => Promise<void>;
} {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenHintVisible, setFullscreenHintVisible] = useState(false);

  const enterFullscreen = useCallback(async () => {
    const succeeded = await requestBrowserFullscreen();
    setFullscreenHintVisible(!succeeded);
    return succeeded;
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (getFullscreenElement(document)) {
      await exitBrowserFullscreen();
      setFullscreenHintVisible(false);
      return;
    }
    await enterFullscreen();
  }, [enterFullscreen]);

  useEffect(() => {
    const updateFullscreenState = () => {
      const active = !!getFullscreenElement(document);
      setIsFullscreen(active);
      if (active) {
        setFullscreenHintVisible(false);
      }
    };

    updateFullscreenState();
    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", updateFullscreenState);
    };
  }, []);

  return {
    isFullscreen,
    fullscreenHintVisible,
    setFullscreenHintVisible,
    enterFullscreen,
    toggleFullscreen,
  };
}
