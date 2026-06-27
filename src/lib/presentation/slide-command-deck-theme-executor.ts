import type { Deck } from "./deck-core";
import { insertSlide, updateSlide } from "./deck-mutation-slides";
import {
  setDeckSlideFormat,
  setDeckTheme,
} from "./deck-mutation-deck-settings";
import {
  resetPresentationThemeOverrides,
  updatePresentationThemeOverrides,
} from "./presentation-theme-overrides";
import type {
  AddSlideFromTemplateCommand,
  ApplySlideTemplateCommand,
  CreateMasterCommand,
  CreateCustomTemplateCommand,
  DeleteCustomTemplateCommand,
  DeleteMasterCommand,
  SetCanvasFormatCommand,
  SetDefaultMasterCommand,
  SetSlideMasterCommand,
  SetPresentationThemeCommand,
  UpdateMasterCommand,
  UpdateMasterElementCommand,
  UpdateCustomTemplateCommand,
  UpdateThemeOverridesCommand,
} from "./slide-command-contracts";
import { failure, makePatch, success } from "./slide-command-executor-helpers";
import { buildTemplateSlide, type SlideTemplateKind } from "./slide-templates";

export type DeckThemeFamilyCommand =
  | SetPresentationThemeCommand
  | UpdateThemeOverridesCommand
  | SetCanvasFormatCommand
  | CreateMasterCommand
  | UpdateMasterCommand
  | DeleteMasterCommand
  | SetDefaultMasterCommand
  | SetSlideMasterCommand
  | UpdateMasterElementCommand
  | AddSlideFromTemplateCommand
  | ApplySlideTemplateCommand
  | CreateCustomTemplateCommand
  | UpdateCustomTemplateCommand
  | DeleteCustomTemplateCommand;

function allSlideIds(deck: Deck): string[] {
  return deck.slides.map((slide) => slide.id);
}

const BUILT_IN_TEMPLATE_IDS = new Set<SlideTemplateKind>([
  "title",
  "content",
  "visual",
  "two-column",
  "blank",
]);

function deckFormat(deck: Deck) {
  return (deck as any).canvas?.format;
}

function materializeTemplate(
  deck: Deck,
  templateId: string,
  visualId?: string,
): Deck["slides"][number] | null {
  if (BUILT_IN_TEMPLATE_IDS.has(templateId as SlideTemplateKind)) {
    return buildTemplateSlide(templateId as SlideTemplateKind, {
      slideFormat: deckFormat(deck),
      visualId,
    });
  }
  const template = (deck.customTemplates ?? []).find(
    (entry) => entry.id === templateId,
  );
  if (!template) return null;
  return {
    id: crypto.randomUUID(),
    index: 0,
    title: template.name,
    notes: "",
    templateId: template.id,
    ...(template.defaultMasterId ? { masterId: template.defaultMasterId } : {}),
    ...(template.slideDesignDefaults
      ? { designOverrides: template.slideDesignDefaults }
      : {}),
    elements: template.elements.map((element, index) => ({
      id: crypto.randomUUID(),
      kind: element.kind,
      role: element.role,
      box: (element as any).box ?? { x: 10, y: 10, w: 80, h: 20 },
      zIndex: index,
      content: element.contentDefaults ?? { kind: element.kind },
      designOverrides: element.designOverrides ?? {},
    })) as any,
  } as Deck["slides"][number];
}

function elementMatchKey(element: { kind?: string; role?: string }): string {
  return `${element.kind ?? ""}:${element.role ?? ""}`;
}

function preserveExistingContent(
  nextElements: readonly any[],
  existingElements: readonly any[],
): any[] {
  const used = new Set<number>();
  return nextElements.map((element) => {
    const matchIndex = existingElements.findIndex((candidate, index) => {
      return (
        !used.has(index) &&
        elementMatchKey(candidate) === elementMatchKey(element) &&
        candidate.content?.kind === element.content?.kind
      );
    });
    if (matchIndex === -1) return element;
    used.add(matchIndex);
    return {
      ...element,
      content: existingElements[matchIndex].content,
    };
  });
}

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
          resetPresentationThemeOverrides(deck),
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
      const next = updatePresentationThemeOverrides(deck, cmd.patch);
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
    case "CREATE_MASTER": {
      if ((deck.masters ?? []).some((master) => master.id === cmd.master.id)) {
        return failure(deck, `Master already exists: ${cmd.master.id}`);
      }
      const masters = [...(deck.masters ?? []), cmd.master];
      const next = { ...deck, masters } as Deck;
      return success(next, [], [], undefined, [
        makePatch("master.create", [], [], {
          deckFields: { masters },
          addedIds: [cmd.master.id],
        }),
      ]);
    }
    case "UPDATE_MASTER": {
      const masters = deck.masters ?? [];
      const index = masters.findIndex((master) => master.id === cmd.masterId);
      if (index === -1)
        return failure(deck, `Master not found: ${cmd.masterId}`);
      const nextMasters = masters.map((master) =>
        master.id === cmd.masterId
          ? { ...master, ...cmd.patch, id: master.id }
          : master,
      );
      const next = { ...deck, masters: nextMasters } as Deck;
      return success(next, allSlideIds(deck), [], undefined, [
        makePatch("master.update", allSlideIds(deck), [], {
          deckFields: { masters: nextMasters },
        }),
      ]);
    }
    case "DELETE_MASTER": {
      const masters = deck.masters ?? [];
      if (!masters.some((master) => master.id === cmd.masterId)) {
        return failure(deck, `Master not found: ${cmd.masterId}`);
      }
      if (deck.defaultMasterId === cmd.masterId) {
        return failure(deck, "Cannot delete the default master");
      }
      const nextMasters = masters.filter(
        (master) => master.id !== cmd.masterId,
      );
      const slides = deck.slides.map((slide) =>
        slide.masterId === cmd.masterId
          ? ({ ...slide, masterId: undefined } as typeof slide)
          : slide,
      );
      const next = { ...deck, masters: nextMasters, slides } as Deck;
      return success(next, allSlideIds(deck), [], undefined, [
        makePatch("master.delete", allSlideIds(deck), [], {
          deckFields: { masters: nextMasters },
          removedIds: [cmd.masterId],
        }),
      ]);
    }
    case "SET_DEFAULT_MASTER": {
      if (!(deck.masters ?? []).some((master) => master.id === cmd.masterId)) {
        return failure(deck, `Master not found: ${cmd.masterId}`);
      }
      const next = { ...deck, defaultMasterId: cmd.masterId } as Deck;
      return success(next, allSlideIds(deck), [], undefined, [
        makePatch("master.set_default", allSlideIds(deck), [], {
          deckFields: { defaultMasterId: cmd.masterId },
        }),
      ]);
    }
    case "SET_SLIDE_MASTER": {
      if (
        cmd.masterId !== undefined &&
        !(deck.masters ?? []).some((master) => master.id === cmd.masterId)
      ) {
        return failure(deck, `Master not found: ${cmd.masterId}`);
      }
      let found = false;
      const slides = deck.slides.map((slide) => {
        if (slide.id !== cmd.slideId) return slide;
        found = true;
        return cmd.masterId === undefined
          ? ({ ...slide, masterId: undefined } as typeof slide)
          : ({ ...slide, masterId: cmd.masterId } as typeof slide);
      });
      if (!found) return failure(deck, `Slide not found: ${cmd.slideId}`);
      const next = { ...deck, slides } as Deck;
      return success(next, [cmd.slideId], [], undefined, [
        makePatch("slide.set_master", [cmd.slideId], [], {
          slideFields: { [cmd.slideId]: { masterId: cmd.masterId } as any },
        }),
      ]);
    }
    case "UPDATE_MASTER_ELEMENT": {
      const masters = deck.masters ?? [];
      const master = masters.find((entry) => entry.id === cmd.masterId);
      if (!master) return failure(deck, `Master not found: ${cmd.masterId}`);
      if (!master.elements.some((element) => element.id === cmd.elementId)) {
        return failure(deck, `Master element not found: ${cmd.elementId}`);
      }
      const nextMasters = masters.map((entry) =>
        entry.id === cmd.masterId
          ? {
              ...entry,
              elements: entry.elements.map((element) =>
                element.id === cmd.elementId
                  ? ({
                      ...element,
                      ...cmd.patch,
                      id: element.id,
                      locked: true,
                    } as typeof element)
                  : element,
              ),
            }
          : entry,
      );
      const next = { ...deck, masters: nextMasters } as Deck;
      return success(next, allSlideIds(deck), [cmd.elementId], undefined, [
        makePatch("master.element.update", allSlideIds(deck), [cmd.elementId], {
          deckFields: { masters: nextMasters },
        }),
      ]);
    }
    case "ADD_SLIDE_FROM_TEMPLATE": {
      const slide = materializeTemplate(deck, cmd.templateId, cmd.visualId);
      if (!slide) return failure(deck, `Template not found: ${cmd.templateId}`);
      const afterIndex =
        cmd.afterSlideId == null
          ? deck.slides.length - 1
          : deck.slides.findIndex((entry) => entry.id === cmd.afterSlideId);
      if (cmd.afterSlideId != null && afterIndex === -1) {
        return failure(deck, `Slide not found: ${cmd.afterSlideId}`);
      }
      const next = insertSlide(deck, afterIndex, slide);
      const inserted =
        next.slides[
          Math.max(0, Math.min(afterIndex + 1, next.slides.length - 1))
        ];
      const slideId = inserted?.id ?? slide.id;
      return success(next, [slideId], [], undefined, [
        makePatch("slide.add_from_template", [slideId], [], {
          addedIds: [slideId],
        }),
      ]);
    }
    case "APPLY_SLIDE_TEMPLATE": {
      const slide = materializeTemplate(deck, cmd.templateId, cmd.visualId);
      if (!slide) return failure(deck, `Template not found: ${cmd.templateId}`);
      const index = deck.slides.findIndex((entry) => entry.id === cmd.slideId);
      if (index === -1) return failure(deck, `Slide not found: ${cmd.slideId}`);
      const existing = deck.slides[index]!;
      const nextSlide = {
        ...existing,
        templateId: cmd.templateId,
        ...(slide.masterId !== undefined ? { masterId: slide.masterId } : {}),
        ...(slide.designOverrides !== undefined
          ? { designOverrides: slide.designOverrides }
          : {}),
        elements:
          cmd.mode === "preserve"
            ? preserveExistingContent(
                slide.elements ?? [],
                existing.elements ?? [],
              )
            : (slide.elements ?? []),
      };
      const next = updateSlide(deck, index, nextSlide as never);
      return success(next, [cmd.slideId], [], undefined, [
        makePatch("slide.apply_template", [cmd.slideId], [], {
          slideFields: { [cmd.slideId]: { templateId: cmd.templateId } as any },
        }),
      ]);
    }
    case "CREATE_CUSTOM_TEMPLATE": {
      if (
        (deck.customTemplates ?? []).some(
          (entry) => entry.id === cmd.template.id,
        )
      ) {
        return failure(deck, `Template already exists: ${cmd.template.id}`);
      }
      const customTemplates = [...(deck.customTemplates ?? []), cmd.template];
      const next = { ...deck, customTemplates } as Deck;
      return success(next, [], [], undefined, [
        makePatch("template.create_custom", [], [], {
          deckFields: { customTemplates },
          addedIds: [cmd.template.id],
        }),
      ]);
    }
    case "UPDATE_CUSTOM_TEMPLATE": {
      const templates = deck.customTemplates ?? [];
      if (!templates.some((entry) => entry.id === cmd.templateId)) {
        return failure(deck, `Template not found: ${cmd.templateId}`);
      }
      const customTemplates = templates.map((entry) =>
        entry.id === cmd.templateId
          ? { ...entry, ...cmd.patch, id: entry.id }
          : entry,
      );
      const next = { ...deck, customTemplates } as Deck;
      return success(next, [], [], undefined, [
        makePatch("template.update_custom", [], [], {
          deckFields: { customTemplates },
        }),
      ]);
    }
    case "DELETE_CUSTOM_TEMPLATE": {
      const templates = deck.customTemplates ?? [];
      if (!templates.some((entry) => entry.id === cmd.templateId)) {
        return failure(deck, `Template not found: ${cmd.templateId}`);
      }
      const customTemplates = templates.filter(
        (entry) => entry.id !== cmd.templateId,
      );
      const next = { ...deck, customTemplates } as Deck;
      return success(next, [], [], undefined, [
        makePatch("template.delete_custom", [], [], {
          deckFields: { customTemplates },
          removedIds: [cmd.templateId],
        }),
      ]);
    }
  }
}
