type HorizontalRect = {
  left: number;
  right: number;
};

export const DOCUMENT_GUTTER_BUTTON_SIZE = 36;
export const DOCUMENT_GUTTER_DOT_SIZE = 12;
export const DOCUMENT_GUTTER_GAP = 8;
export const DOCUMENT_GUTTER_OFFSET =
  DOCUMENT_GUTTER_BUTTON_SIZE + DOCUMENT_GUTTER_GAP;
export const DOCUMENT_GUTTER_CARD_GAP = 42;

export function leftGutterButtonLeft(rect: HorizontalRect): number | null {
  const left = rect.left - DOCUMENT_GUTTER_OFFSET;
  return left >= DOCUMENT_GUTTER_GAP ? left : null;
}

export function rightGutterButtonLeft(
  rect: HorizontalRect,
  viewportWidth = window.innerWidth,
): number | null {
  const preferred = rect.right + DOCUMENT_GUTTER_GAP;
  if (
    preferred + DOCUMENT_GUTTER_BUTTON_SIZE + DOCUMENT_GUTTER_GAP <=
    viewportWidth
  ) {
    return preferred;
  }
  return leftGutterButtonLeft(rect);
}

export function rightGutterDotLeft(
  rect: HorizontalRect,
  viewportWidth = window.innerWidth,
): number | null {
  const buttonLeft = rightGutterButtonLeft(rect, viewportWidth);
  return buttonLeft === null
    ? null
    : buttonLeft + (DOCUMENT_GUTTER_BUTTON_SIZE - DOCUMENT_GUTTER_DOT_SIZE) / 2;
}

export function rightGutterPanelLeft(
  rect: HorizontalRect,
  panelWidth: number,
  viewportWidth = window.innerWidth,
): number {
  const preferred = rect.right + DOCUMENT_GUTTER_CARD_GAP;
  if (preferred + panelWidth + DOCUMENT_GUTTER_GAP <= viewportWidth) {
    return preferred;
  }

  const fallback = rect.left - panelWidth - DOCUMENT_GUTTER_GAP;
  if (fallback >= DOCUMENT_GUTTER_GAP) {
    return fallback;
  }

  return Math.max(
    DOCUMENT_GUTTER_GAP,
    viewportWidth - panelWidth - DOCUMENT_GUTTER_GAP,
  );
}
