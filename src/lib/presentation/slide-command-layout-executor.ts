import type { Deck } from "./deck-core";
import {
  applySlideLayoutPreservingContent,
  resetSlideLayoutPositions,
} from "./deck-mutation-layout";
import { updateSlide } from "./deck-mutation-slides";
import type {
  ApplySlideLayoutCommand,
  ResetSlideLayoutCommand,
  UpdateSlideLayoutHintCommand,
} from "./slide-command-contracts";
import {
  failure,
  findSlideIndex,
  makePatch,
  success,
} from "./slide-command-executor-helpers";

export type LayoutFamilyCommand =
  | UpdateSlideLayoutHintCommand
  | ApplySlideLayoutCommand
  | ResetSlideLayoutCommand;

export function executeLayoutFamilyCommand(
  deck: Deck,
  cmd: LayoutFamilyCommand,
) {
  switch (cmd.type) {
    case "UPDATE_SLIDE_LAYOUT_HINT": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      return success(
        updateSlide(deck, index, { layout: cmd.layout }),
        [cmd.slideId],
        [],
        undefined,
        [
          makePatch("slide.update_layout_hint", [cmd.slideId], [], {
            slideFields: { [cmd.slideId]: { layout: cmd.layout } },
          }),
        ],
      );
    }
    case "APPLY_SLIDE_LAYOUT": {
      if (cmd.slideIndex < 0 || cmd.slideIndex >= deck.slides.length) {
        return failure(deck, `Invalid slideIndex: ${cmd.slideIndex}`);
      }
      const slide = deck.slides[cmd.slideIndex]!;
      const nextDeck = applySlideLayoutPreservingContent(
        deck,
        cmd.slideIndex,
        cmd.layout,
      );
      return success(nextDeck, [slide.id], [], undefined, [
        makePatch("slide.apply_layout", [slide.id], []),
      ]);
    }
    case "RESET_SLIDE_LAYOUT": {
      if (cmd.slideIndex < 0 || cmd.slideIndex >= deck.slides.length) {
        return failure(deck, `Invalid slideIndex: ${cmd.slideIndex}`);
      }
      const slide = deck.slides[cmd.slideIndex]!;
      const nextDeck = resetSlideLayoutPositions(
        deck,
        cmd.slideIndex,
        cmd.layout,
      );
      return success(nextDeck, [slide.id], [], undefined, [
        makePatch("slide.reset_layout", [slide.id], []),
      ]);
    }
  }
}
