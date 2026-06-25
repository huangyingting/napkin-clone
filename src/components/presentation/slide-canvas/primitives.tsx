import type { JSX } from "react";
import type * as React from "react";

import type { SlideElement, TextRun } from "@/lib/presentation/deck";

export function boxStyle(element: SlideElement): React.CSSProperties {
  return {
    position: "absolute",
    left: `${element.box.x}%`,
    top: `${element.box.y}%`,
    width: `${element.box.w}%`,
    height: `${element.box.h}%`,
    zIndex: element.zIndex,
    ...(element.opacity !== undefined && element.opacity < 1
      ? { opacity: element.opacity }
      : {}),
    ...(element.rotation
      ? { transform: `rotate(${element.rotation}deg)` }
      : {}),
    ...(element.shadow
      ? { filter: "drop-shadow(0 0.6cqmin 1.2cqmin rgba(0,0,0,0.28))" }
      : {}),
  };
}

export function renderRuns(runs: TextRun[]): JSX.Element[] {
  return runs.map((run, i) => {
    if (run.text === "\n") return <br key={i} />;
    const style: React.CSSProperties = {};
    if (run.bold) style.fontWeight = 700;
    if (run.italic) style.fontStyle = "italic";
    if (run.color) style.color = run.color;
    if (run.code) {
      style.fontFamily =
        "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      style.backgroundColor = "rgba(127, 127, 127, 0.18)";
      style.padding = "0 0.2em";
      style.borderRadius = "0.2em";
    }
    if (run.link) {
      return (
        <a
          key={i}
          href={run.link}
          target="_blank"
          rel="noreferrer"
          style={{ ...style, textDecoration: "underline", color: run.color }}
        >
          {run.text}
        </a>
      );
    }
    return (
      <span key={i} style={style}>
        {run.text}
      </span>
    );
  });
}

export function contrastTextColor(hex: string): string {
  const raw = hex.replace("#", "");
  const expanded =
    raw.length === 3
      ? raw
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : raw;
  if (expanded.length < 6) return "#ffffff";
  const r = Number.parseInt(expanded.slice(0, 2), 16) / 255;
  const g = Number.parseInt(expanded.slice(2, 4), 16) / 255;
  const b = Number.parseInt(expanded.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.58 ? "#18181b" : "#ffffff";
}

export function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace("#", "");
  const expanded =
    raw.length === 3
      ? raw
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : raw;
  if (expanded.length < 6) {
    return `rgba(113, 113, 122, ${alpha})`;
  }
  const r = Number.parseInt(expanded.slice(0, 2), 16);
  const g = Number.parseInt(expanded.slice(2, 4), 16);
  const b = Number.parseInt(expanded.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
