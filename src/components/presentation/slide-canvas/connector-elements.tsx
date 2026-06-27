import type { JSX } from "react";

import {
  connectorElbowPoints,
  resolveConnectorElementPoints,
} from "@/lib/presentation/connector-geometry";
import type { ConnectorElement, SlideElement } from "@/lib/presentation/deck";
import type { ConnectorDefaultsToken } from "@/lib/presentation/deck-theme-tokens";
import { connectorContent, connectorDesign } from "./v6-model";

export function ConnectorElementView({
  element,
  elements,
  defaults,
}: {
  element: ConnectorElement;
  elements: readonly SlideElement[];
  /** Deck-template connector defaults applied when the element omits a field (#607). */
  defaults?: ConnectorDefaultsToken;
}): JSX.Element {
  const content = connectorContent(element);
  const design = connectorDesign(element);
  const effectiveElement = { ...element, ...content, ...design };
  const { start, end } = resolveConnectorElementPoints(
    effectiveElement,
    elements,
    (el) => el.box,
  );
  const strokeColor = design.stroke?.color ?? defaults?.color ?? "#a1a1aa";
  const strokeWidth = design.stroke?.width ?? defaults?.width ?? 0.4;
  const arrowEnd = design.arrowEnd ?? defaults?.endArrow ?? "arrow";
  const arrowStart = design.arrowStart ?? defaults?.startArrow ?? "none";
  const dashed =
    design.dash || (defaults?.dash !== undefined && defaults.dash !== "solid");
  const dash = dashed ? "4 2" : undefined;
  const endMarkerId = `conn-end-${element.id}`;
  const startMarkerId = `conn-start-${element.id}`;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        inset: 0,
        height: "100%",
        width: "100%",
        overflow: "visible",
        zIndex: element.zIndex,
        ...(element.opacity !== undefined && element.opacity < 1
          ? { opacity: element.opacity }
          : {}),
      }}
    >
      <defs>
        {arrowEnd !== "none" && (
          <marker
            id={endMarkerId}
            markerWidth="8"
            markerHeight="6"
            refX="7"
            refY="3"
            orient="auto"
          >
            <polygon
              points="0 0, 8 3, 0 6"
              fill={arrowEnd === "filled" ? strokeColor : "none"}
              stroke={strokeColor}
              strokeWidth="0.8"
            />
          </marker>
        )}
        {arrowStart !== "none" && (
          <marker
            id={startMarkerId}
            markerWidth="8"
            markerHeight="6"
            refX="1"
            refY="3"
            orient="auto-start-reverse"
          >
            <polygon
              points="0 0, 8 3, 0 6"
              fill={arrowStart === "filled" ? strokeColor : "none"}
              stroke={strokeColor}
              strokeWidth="0.8"
            />
          </marker>
        )}
      </defs>
      {content.routing === "elbow" ? (
        <polyline
          points={connectorElbowPoints(start, end)
            .map((p) => `${p.x},${p.y}`)
            .join(" ")}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={dash}
          vectorEffect="non-scaling-stroke"
          markerEnd={arrowEnd !== "none" ? `url(#${endMarkerId})` : undefined}
          markerStart={
            arrowStart !== "none" ? `url(#${startMarkerId})` : undefined
          }
        />
      ) : (
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={dash}
          vectorEffect="non-scaling-stroke"
          markerEnd={arrowEnd !== "none" ? `url(#${endMarkerId})` : undefined}
          markerStart={
            arrowStart !== "none" ? `url(#${startMarkerId})` : undefined
          }
        />
      )}
    </svg>
  );
}
