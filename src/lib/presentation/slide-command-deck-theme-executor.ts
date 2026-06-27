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
  SetCanvasFormatCommand,
  SetPresentationThemeCommand,
  UpdateThemeOverridesCommand,
} from "./slide-command-contracts";
import { makePatch, success } from "./slide-command-executor-helpers";

export type DeckThemeFamilyCommand =
  | SetPresentationThemeCommand
  | UpdateThemeOverridesCommand
  | SetCanvasFormatCommand;

export function executeDeckThemeFamilyCommand(
  deck: Deck,
  cmd: DeckThemeFamilyCommand,
) {
  switch (cmd.type) {
    case "SET_PRESENTATION_THEME":
      return success(
        setDeckTheme(deck, cmd.themeId),
        deck.slides.map((s) => s.id),
        [],
        undefined,
        [
          makePatch(
            "presentation.set_theme",
            deck.slides.map((s) => s.id),
            [],
            { deckFields: { design: { themeId: cmd.themeId } } },
          ),
        ],
      );
    case "UPDATE_THEME_OVERRIDES": {
      if (cmd.reset) {
        return success(
          resetDeckTemplate(deck),
          deck.slides.map((s) => s.id),
          [],
          undefined,
          [
            makePatch(
              "presentation.update_theme_overrides",
              deck.slides.map((s) => s.id),
              [],
              { deckFields: { resetThemeOverrides: true } },
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
            "presentation.update_theme_overrides",
            deck.slides.map((s) => s.id),
            [],
            {
              deckFields: {
                design: {
                  themeOverrides: (next as any).design?.themeOverrides,
                },
              },
            },
          ),
        ],
      );
    }
    case "SET_CANVAS_FORMAT":
      return success(setDeckSlideFormat(deck, cmd.format), [], [], undefined, [
        makePatch("canvas.set_format", [], [], {
          deckFields: { canvas: { format: cmd.format } },
        }),
      ]);
  }
}
