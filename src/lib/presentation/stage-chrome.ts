export const STAGE_CHROME_Z_INDEX = {
  elementOverlayOffset: 1,
  selectedElementOverlay: 2000,
  preselectedFrame: 2100,
  selectedFrame: 2110,
  groupFrame: 2120,
  multiSelectionBounds: 2130,
  connectorAnchorPreview: 2200,
  snapGuide: 2300,
  marquee: 2400,
  liveBadge: 2500,
} as const;

export function stageElementOverlayZIndex({
  elementZIndex,
  selected,
}: {
  elementZIndex: number;
  selected: boolean;
}): number {
  return selected
    ? STAGE_CHROME_Z_INDEX.selectedElementOverlay
    : elementZIndex + STAGE_CHROME_Z_INDEX.elementOverlayOffset;
}
