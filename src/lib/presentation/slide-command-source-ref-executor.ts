import type { Deck } from "./deck-core";
import {
  activeSourceRef,
  relinkSource,
  unlinkSource,
  type SourceRef,
} from "./deck-source-refs";
import { removeElement, updateElement } from "./deck-mutation-elements";
import type { ElementPatch } from "./deck-mutation-shared";
import type {
  RefreshElementFromSourceCommand,
  RelinkElementSourceCommand,
  RemoveSourceElementCommand,
  UnlinkElementSourceCommand,
} from "./slide-command-contracts";
import {
  failure,
  findSlideIndex,
  makePatch,
  success,
} from "./slide-command-executor-helpers";

export type SourceRefFamilyCommand =
  | RefreshElementFromSourceCommand
  | UnlinkElementSourceCommand
  | RelinkElementSourceCommand
  | RemoveSourceElementCommand;

export function executeSourceRefFamilyCommand(
  deck: Deck,
  cmd: SourceRefFamilyCommand,
) {
  switch (cmd.type) {
    case "REFRESH_ELEMENT_FROM_SOURCE": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      const element = deck.slides[index]!.elements?.find(
        (e) => e.id === cmd.elementId,
      );
      if (!element) return failure(deck, `Element not found: ${cmd.elementId}`);
      if (element.sourceRef === undefined)
        return failure(deck, `Element has no source link: ${cmd.elementId}`);
      const sourceRef: SourceRef = activeSourceRef(cmd.sourceRef);
      const patch: ElementPatch =
        element.kind === "text"
          ? {
              text: cmd.text ?? element.text,
              ...(cmd.runs !== undefined ? { runs: cmd.runs } : {}),
              sourceRef,
            }
          : { sourceRef };
      return success(
        updateElement(deck, index, cmd.elementId, patch),
        [cmd.slideId],
        [cmd.elementId],
        undefined,
        [
          makePatch("element.update", [cmd.slideId], [cmd.elementId], {
            elementFields: { [cmd.elementId]: patch },
          }),
        ],
      );
    }
    case "UNLINK_ELEMENT_SOURCE": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      const element = deck.slides[index]!.elements?.find(
        (e) => e.id === cmd.elementId,
      );
      if (!element) return failure(deck, `Element not found: ${cmd.elementId}`);
      if (element.sourceRef === undefined)
        return failure(deck, `Element has no source link: ${cmd.elementId}`);
      const patch: ElementPatch = {
        sourceRef: unlinkSource(element).sourceRef,
      };
      return success(
        updateElement(deck, index, cmd.elementId, patch),
        [cmd.slideId],
        [cmd.elementId],
        undefined,
        [
          makePatch("element.update", [cmd.slideId], [cmd.elementId], {
            elementFields: { [cmd.elementId]: patch },
          }),
        ],
      );
    }
    case "RELINK_ELEMENT_SOURCE": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      const element = deck.slides[index]!.elements?.find(
        (e) => e.id === cmd.elementId,
      );
      if (!element) return failure(deck, `Element not found: ${cmd.elementId}`);
      if (element.sourceRef === undefined)
        return failure(deck, `Element has no source link: ${cmd.elementId}`);
      const patch: ElementPatch = {
        sourceRef: relinkSource(element, cmd.sourceRef).sourceRef,
      };
      return success(
        updateElement(deck, index, cmd.elementId, patch),
        [cmd.slideId],
        [cmd.elementId],
        undefined,
        [
          makePatch("element.update", [cmd.slideId], [cmd.elementId], {
            elementFields: { [cmd.elementId]: patch },
          }),
        ],
      );
    }
    case "REMOVE_SOURCE_ELEMENT": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      if (!deck.slides[index]!.elements?.some((e) => e.id === cmd.elementId))
        return failure(deck, `Element not found: ${cmd.elementId}`);
      return success(
        removeElement(deck, index, cmd.elementId),
        [cmd.slideId],
        [cmd.elementId],
        undefined,
        [
          makePatch("element.remove", [cmd.slideId], [cmd.elementId], {
            removedIds: [cmd.elementId],
          }),
        ],
      );
    }
  }
}
