"use client";

import { useCallback, useEffect, useState } from "react";

export type LaserPosition = {
  x: number;
  y: number;
};

export function useLaserPointer({
  resetHudTimer,
}: {
  resetHudTimer: () => void;
}): {
  laserActive: boolean;
  laserPosition: LaserPosition | null;
  toggleLaser: () => void;
} {
  const [laserActive, setLaserActive] = useState(false);
  const [laserPosition, setLaserPosition] = useState<LaserPosition | null>(
    null,
  );

  useEffect(() => {
    if (!laserActive) return;

    const handleMouseMove = (event: MouseEvent) => {
      setLaserPosition({ x: event.clientX, y: event.clientY });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [laserActive]);

  const toggleLaser = useCallback(() => {
    setLaserActive((active) => {
      const next = !active;
      if (next) {
        setLaserPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });
      }
      return next;
    });
    resetHudTimer();
  }, [resetHudTimer]);

  return { laserActive, laserPosition, toggleLaser };
}
