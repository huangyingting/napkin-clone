/** Public mutation facade for deck editing helpers. */

export {
  reindex,
  freshBlankSlide,
  mapSlide,
  nextZIndex,
} from "./deck-mutation-shared";
export type { DistributiveOmit, ElementPatch } from "./deck-mutation-shared";

export {
  reorderSlides,
  moveSlide,
  addSlide,
  insertSlide,
  duplicateSlide,
  removeSlide,
  updateSlide,
} from "./deck-mutation-slides";

export {
  setDeckTheme,
  setDeckSlideFormat,
} from "./deck-mutation-deck-settings";

export {
  updatePresentationThemeOverrides,
  resetPresentationThemeOverrides,
} from "./presentation-theme-overrides";
export type { PresentationThemeOverridesPatch } from "./presentation-theme-overrides";

export {
  addElement,
  updateElement,
  DUPLICATE_ELEMENT_OFFSET_PCT,
  duplicateElement,
  duplicateElements,
  removeElement,
  removeElements,
  nudgeElements,
  bringElementToFront,
  sendElementToBack,
  setElementBoxes,
  setElementPatches,
  groupElements,
  ungroupElements,
} from "./deck-mutation-elements";
export type {
  DuplicateElementResult,
  DuplicateElementsResult,
} from "./deck-mutation-elements";

export {
  alignElements,
  distributeElements,
  matchSizeElements,
  arrangeSelectedElements,
} from "./deck-mutation-arrangement";

export {
  setSlideBackground,
  setSlideAccent,
  setSlideBackgroundGradient,
  setSlideBackgroundImage,
  setSlideBackgroundAsset,
} from "./deck-mutation-slide-style";

export {
  setElementHidden,
  setElementLocked,
  moveElementZOrder,
  renameElement,
  reorderElement,
} from "./deck-mutation-layers";
