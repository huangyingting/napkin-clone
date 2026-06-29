"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

export function usePresenterTimer(): {
  elapsedSeconds: number;
  startedAtRef: RefObject<number | null>;
} {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    const startedAt = startedAtRef.current ?? Date.now();
    startedAtRef.current = startedAt;
    const intervalId = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  return { elapsedSeconds, startedAtRef };
}
