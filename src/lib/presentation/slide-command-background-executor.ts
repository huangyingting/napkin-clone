import type { Deck } from "./deck-core";
import {
  setSlideAccent,
  setSlideBackground,
  setSlideBackgroundAsset,
  setSlideBackgroundGradient,
  setSlideBackgroundImage,
} from "./deck-mutation-slide-style";
import type {
  DeckPatch,
  SetSlideAccentCommand,
  SetSlideBackgroundAssetCommand,
  SetSlideBackgroundCommand,
  SetSlideBackgroundGradientCommand,
  SetSlideBackgroundImageCommand,
} from "./slide-command-contracts";
import {
  failure,
  findSlideIndex,
  makePatch,
  success,
} from "./slide-command-executor-helpers";

export type BackgroundFamilyCommand =
  | SetSlideBackgroundCommand
  | SetSlideBackgroundGradientCommand
  | SetSlideBackgroundImageCommand
  | SetSlideBackgroundAssetCommand
  | SetSlideAccentCommand;

export function executeBackgroundFamilyCommand(
  deck: Deck,
  cmd: BackgroundFamilyCommand,
) {
  switch (cmd.type) {
    case "SET_SLIDE_BACKGROUND": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      const fields: DeckPatch["slideFields"] =
        cmd.background !== undefined
          ? { [cmd.slideId]: { background: cmd.background } }
          : { [cmd.slideId]: {} };
      return success(
        setSlideBackground(deck, index, cmd.background),
        [cmd.slideId],
        [],
        undefined,
        [
          makePatch("slide.set_background", [cmd.slideId], [], {
            slideFields: fields,
          }),
        ],
      );
    }
    case "SET_SLIDE_BACKGROUND_GRADIENT": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      const fields: DeckPatch["slideFields"] =
        cmd.gradient !== undefined
          ? { [cmd.slideId]: { backgroundGradient: cmd.gradient } }
          : { [cmd.slideId]: {} };
      return success(
        setSlideBackgroundGradient(deck, index, cmd.gradient),
        [cmd.slideId],
        [],
        undefined,
        [
          makePatch("slide.set_background_gradient", [cmd.slideId], [], {
            slideFields: fields,
          }),
        ],
      );
    }
    case "SET_SLIDE_BACKGROUND_IMAGE": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      const fields: DeckPatch["slideFields"] =
        cmd.image !== undefined
          ? { [cmd.slideId]: { backgroundImage: cmd.image } }
          : { [cmd.slideId]: {} };
      return success(
        setSlideBackgroundImage(deck, index, cmd.image),
        [cmd.slideId],
        [],
        undefined,
        [
          makePatch("slide.set_background_image", [cmd.slideId], [], {
            slideFields: fields,
          }),
        ],
      );
    }
    case "SET_SLIDE_BACKGROUND_ASSET": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      const fields: DeckPatch["slideFields"] = cmd.opts
        ? {
            [cmd.slideId]: {
              backgroundImage: cmd.opts.url,
              backgroundAssetId: cmd.opts.assetId,
            },
          }
        : { [cmd.slideId]: {} };
      return success(
        setSlideBackgroundAsset(deck, index, cmd.opts),
        [cmd.slideId],
        [],
        undefined,
        [
          makePatch("slide.set_background_asset", [cmd.slideId], [], {
            slideFields: fields,
          }),
        ],
      );
    }
    case "SET_SLIDE_ACCENT": {
      const index = findSlideIndex(deck, cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      const fields: DeckPatch["slideFields"] =
        cmd.accent !== undefined
          ? { [cmd.slideId]: { accent: cmd.accent } }
          : { [cmd.slideId]: {} };
      return success(
        setSlideAccent(deck, index, cmd.accent),
        [cmd.slideId],
        [],
        undefined,
        [
          makePatch("slide.set_accent", [cmd.slideId], [], {
            slideFields: fields,
          }),
        ],
      );
    }
  }
}
