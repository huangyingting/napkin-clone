import type { ElementBox } from "./deck-elements";

/**
 * Converts a client-space point to stage-relative percentages (0–100).
 *
 * @param clientX - Client X coordinate (e.g. from a pointer event)
 * @param clientY - Client Y coordinate
 * @param rect    - Bounding rect of the stage container
 * @returns `{ x, y }` in percent of the stage dimensions (may be outside 0–100
 *   if the pointer is outside the stage; callers clamp as needed)
 */
export function clientPointToStagePct(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  return {
    x: ((clientX - rect.left) / rect.width) * 100,
    y: ((clientY - rect.top) / rect.height) * 100,
  };
}

/** Default width for a double-click-to-add text box (percent of slide). */
const DEFAULT_TEXT_W_PCT = 40;
/** Default height for a double-click-to-add text box (percent of slide). */
const DEFAULT_TEXT_H_PCT = 16;

/**
 * Returns a sensibly-sized text box centered near the given stage point.
 * The box is clamped so it stays entirely within the 0–100 stage bounds.
 *
 * @param xPct  - Click point X in percent of stage width
 * @param yPct  - Click point Y in percent of stage height
 * @param boxW  - Desired box width in percent (default 40)
 * @param boxH  - Desired box height in percent (default 16)
 */
export function defaultTextBoxAtPoint(
  xPct: number,
  yPct: number,
  boxW: number = DEFAULT_TEXT_W_PCT,
  boxH: number = DEFAULT_TEXT_H_PCT,
): ElementBox {
  const x = Math.max(0, Math.min(100 - boxW, xPct - boxW / 2));
  const y = Math.max(0, Math.min(100 - boxH, yPct - boxH / 2));
  return { x, y, w: boxW, h: boxH };
}
