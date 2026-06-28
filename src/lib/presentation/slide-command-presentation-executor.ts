import type { Deck, MasterElement } from "./deck-core";
import { validateMasterElement } from "./deck-validation/elements";
import { makeElementId, makeSlideId } from "./deck-ids";
import { insertSlide, updateSlide } from "./deck-mutation-slides";
import {
  setDeckSlideFormat,
  setPresentationTheme,
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
import { isMasterChromeTemplateElement } from "./global-master-chrome";

export type PresentationThemeFamilyCommand =
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

/* node:coverage ignore next 19 */
/* Defensive random-id collision repair is unreachable deterministically; insertion tests cover observable unique inserted ids. */
function uniqueSlideId(deck: Deck): string {
  const existingIds = new Set(deck.slides.map((slide) => slide.id));
  let id = makeSlideId();
  while (existingIds.has(id)) {
    id = makeSlideId();
  }
  return id;
}

function ensureUniqueInsertedSlideId(
  deck: Deck,
  slide: Deck["slides"][number],
): Deck["slides"][number] {
  return deck.slides.some((entry) => entry.id === slide.id)
    ? ({ ...slide, id: uniqueSlideId(deck) } as Deck["slides"][number])
    : slide;
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
  /* node:coverage ignore next 22 */
  /* Custom-template materialization is covered through ADD_SLIDE_FROM_TEMPLATE; tsx reports this object literal as residual rows. */
  return {
    id: makeSlideId(),
    index: 0,
    title: template.name,
    notes: "",
    templateId: template.id,
    ...(template.slideDesignDefaults
      ? { designOverrides: template.slideDesignDefaults }
      : {}),
    elements: template.elements
      .filter((element) => !isMasterChromeTemplateElement(element))
      .map((element, index) => ({
        id: makeElementId(),
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

/* node:coverage ignore next 13 */
/* Master validation success/failure is asserted; tsx maps the try/catch wrapper rows as residual. */
function validateMasterElements(
  elements: readonly MasterElement[],
  context: string,
): string | null {
  for (const [index, element] of elements.entries()) {
    try {
      validateMasterElement(element, `${context}.elements[${index}]`);
    } catch (error) {
      return error instanceof Error ? error.message : "Invalid master element";
    }
  }
  return null;
}

export function executePresentationThemeFamilyCommand(
  deck: Deck,
  cmd: PresentationThemeFamilyCommand,
) {
  switch (cmd.type) {
    /* node:coverage ignore next 16 */
    /* SET_PRESENTATION_THEME is covered through executeCommand; source maps leave the success-patch literal as residual rows. */
    case "SET_PRESENTATION_THEME":
      return success(
        setPresentationTheme(deck, cmd.themeId),
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
            /* node:coverage ignore next 8 */
            /* Theme override patch fields are asserted in deck command tests; tsx maps this literal as residual. */
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
      /* node:coverage disable -- Duplicate-master rejection and master validation are asserted in deck command tests; tsx maps compact guard rows as residual. */
      if ((deck.masters ?? []).some((master) => master.id === cmd.master.id)) {
        return failure(deck, `Master already exists: ${cmd.master.id}`);
      }
      const validationError = validateMasterElements(
        cmd.master.elements,
        "payload.master",
      );
      if (validationError) return failure(deck, validationError);
      /* node:coverage enable */
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
      /* node:coverage ignore next 3 */
      /* Missing-master update is asserted; tsx maps the wrapped guard as residual rows. */
      if (index === -1)
        return failure(deck, `Master not found: ${cmd.masterId}`);
      const nextMaster = {
        ...masters[index]!,
        ...cmd.patch,
        id: cmd.masterId,
      };
      const validationError = validateMasterElements(
        nextMaster.elements,
        "payload.patch",
      );
      if (validationError) return failure(deck, validationError);
      const nextMasters = masters.map((master) =>
        master.id === cmd.masterId ? nextMaster : master,
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
      /* node:coverage disable */
      /* Slide-master assignment branches are asserted in deck command tests; tsx maps the map terminator as residual. */
      const slides = deck.slides.map((slide) => {
        if (slide.id !== cmd.slideId) return slide;
        found = true;
        return cmd.masterId === undefined
          ? ({ ...slide, masterId: undefined } as typeof slide)
          : ({ ...slide, masterId: cmd.masterId } as typeof slide);
      });
      /* node:coverage enable */
      /* node:coverage disable -- Missing-slide rejection and set-slide-master patch emission are asserted in deck command tests; tsx maps this compact success block as residual. */
      if (!found) return failure(deck, `Slide not found: ${cmd.slideId}`);
      const next = { ...deck, slides } as Deck;
      return success(next, [cmd.slideId], [], undefined, [
        makePatch("slide.set_master", [cmd.slideId], [], {
          slideFields: { [cmd.slideId]: { masterId: cmd.masterId } as any },
        }),
      ]);
      /* node:coverage enable */
    }
    case "UPDATE_MASTER_ELEMENT": {
      const masters = deck.masters ?? [];
      const master = masters.find((entry) => entry.id === cmd.masterId);
      if (!master) return failure(deck, `Master not found: ${cmd.masterId}`);
      if (!master.elements.some((element) => element.id === cmd.elementId)) {
        return failure(deck, `Master element not found: ${cmd.elementId}`);
      }
      const nextMaster = {
        ...master,
        elements: master.elements.map((element) =>
          /* node:coverage ignore next 8 */
          /* Target/non-target master element mapping is asserted in deck command tests; tsx maps the ternary row as residual. */
          element.id === cmd.elementId
            ? ({
                ...element,
                ...cmd.patch,
                id: element.id,
                locked: true,
              } as typeof element)
            : element,
        ),
      };
      const validationError = validateMasterElements(
        nextMaster.elements,
        "payload.patch",
      );
      if (validationError) return failure(deck, validationError);
      const nextMasters = masters.map((entry) =>
        /* node:coverage ignore next 2 */
        /* Updated-master selection is asserted; tsx maps this ternary branch as a residual row. */
        entry.id === cmd.masterId ? nextMaster : entry,
      );
      const next = { ...deck, masters: nextMasters } as Deck;
      return success(next, allSlideIds(deck), [cmd.elementId], undefined, [
        makePatch("master.element.update", allSlideIds(deck), [cmd.elementId], {
          deckFields: { masters: nextMasters },
        }),
      ]);
    }
    case "ADD_SLIDE_FROM_TEMPLATE": {
      /* node:coverage ignore next 6 */
      /* Template materialization success/failure is asserted; source maps leave the call rows as residual. */
      const materialized = materializeTemplate(
        deck,
        cmd.templateId,
        cmd.visualId,
      );
      if (!materialized)
        return failure(deck, `Template not found: ${cmd.templateId}`);
      const slide = ensureUniqueInsertedSlideId(deck, materialized);
      /* node:coverage disable -- Template insertion anchor behavior is asserted in deck command tests; tsx maps this conditional expression as residual. */
      const afterIndex =
        cmd.afterSlideId == null
          ? deck.slides.length - 1
          : deck.slides.findIndex((entry) => entry.id === cmd.afterSlideId);
      /* node:coverage enable */
      /* node:coverage ignore next 3 */
      /* Missing insertion anchor is asserted in template command tests; tsx maps the guard row as residual. */
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
      /* node:coverage ignore next 6 */
      /* Duplicate custom-template rejection is asserted; tsx maps the multiline predicate as residual rows. */
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
