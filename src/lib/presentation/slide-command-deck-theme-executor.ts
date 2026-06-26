import type { Deck } from "./deck-core";
import {
  setDeckSlideFormat,
  setDeckTheme,
} from "./deck-mutation-deck-settings";
import {
  resetDeckTemplate,
  updateDeckTemplate,
} from "./deck-mutation-template";
import type {
  SetDeckFormatCommand,
  SetDeckThemeCommand,
  UpdateDeckTemplateCommand,
} from "./slide-command-contracts";
import { makePatch, success } from "./slide-command-executor-helpers";

export type DeckThemeFamilyCommand =
  | SetDeckThemeCommand
  | UpdateDeckTemplateCommand
  | SetDeckFormatCommand;

export function executeDeckThemeFamilyCommand(
  deck: Deck,
  cmd: DeckThemeFamilyCommand,
) {
  switch (cmd.type) {
    case "SET_DECK_THEME":
      return success(
        setDeckTheme(deck, cmd.themeId),
        deck.slides.map((s) => s.id),
        [],
        undefined,
        [
          makePatch(
            "deck.set_theme",
            deck.slides.map((s) => s.id),
            [],
            { deckFields: { themeId: cmd.themeId } },
          ),
        ],
      );
    case "UPDATE_DECK_TEMPLATE": {
      if (cmd.reset) {
        return success(
          resetDeckTemplate(deck),
          deck.slides.map((s) => s.id),
          [],
          undefined,
          [
            makePatch(
              "deck.update_template",
              deck.slides.map((s) => s.id),
              [],
              { deckFields: { resetTemplate: true } },
            ),
          ],
        );
      }
      const next = updateDeckTemplate(deck, cmd.patch);
      return success(
        next,
        deck.slides.map((s) => s.id),
        [],
        undefined,
        [
          makePatch(
            "deck.update_template",
            deck.slides.map((s) => s.id),
            [],
            { deckFields: { customTokenSet: next.customTokenSet } },
          ),
        ],
      );
    }
    case "SET_DECK_FORMAT":
      return success(
        setDeckSlideFormat(deck, cmd.slideFormat),
        [],
        [],
        undefined,
        [
          makePatch("deck.set_format", [], [], {
            deckFields: { slideFormat: cmd.slideFormat },
          }),
        ],
      );
  }
}
