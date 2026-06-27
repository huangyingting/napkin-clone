"use client";

import { useCallback, useState } from "react";

import type { Deck, Slide, SlideElement } from "@/lib/presentation/deck";
import {
  commitCommand,
  executeCommand,
  type DeckPatch,
} from "@/lib/presentation/slide-commands";
import { appendPendingPatches } from "./use-slide-editor-commit";
import { emitProductTelemetry } from "@/lib/telemetry/product";
import {
  TEMPLATE_IMAGE_PLACEHOLDER_SRC,
  type SlideTemplateKind,
} from "@/lib/presentation/slide-templates";

type TemplateId = SlideTemplateKind | string;
type MasterChromeKind = "footer" | "pageNumber" | "logo" | "watermark";

type DoCommitAndChange = (
  deck: Deck,
  cmd: Parameters<typeof commitCommand>[1],
) => void;

interface UseSlideManagementCommandsOptions {
  deck: Deck;
  safeSelected: number;
  pendingPatchesRef: { current: DeckPatch[] };
  onDeckChange: (deck: Deck, opts?: { coalesceKey?: string }) => void;
  doCommitAndChange: DoCommitAndChange;
  clearSelection: () => void;
  setSelectedIndex: (
    indexOrUpdater: number | ((prev: number) => number),
  ) => void;
}

export function useSlideManagementCommands({
  deck,
  safeSelected,
  pendingPatchesRef,
  onDeckChange,
  doCommitAndChange,
  clearSelection,
  setSelectedIndex,
}: UseSlideManagementCommandsOptions) {
  const [pendingTemplateReapply, setPendingTemplateReapply] =
    useState<TemplateId | null>(null);

  const currentSlide = deck.slides[safeSelected];

  const handleMove = useCallback(
    (index: number, direction: number) => {
      const { result, commitOptions, patches } = commitCommand(deck, {
        type: "MOVE_SLIDE",
        slideIndex: index,
        direction,
      });
      if (!result.ok) return;
      appendPendingPatches(pendingPatchesRef, patches);
      onDeckChange(result.deck, commitOptions);
      emitProductTelemetry("product.editor.command.succeeded", {
        commandName: "move_slide",
        slideCount: result.deck.slides.length,
        surface: "slide-editor",
      });
      setSelectedIndex(index + (direction > 0 ? 1 : -1));
    },
    [deck, onDeckChange, pendingPatchesRef, setSelectedIndex],
  );

  const handleDuplicate = useCallback(
    (index: number) => {
      const slideId = deck.slides[index]?.id;
      if (!slideId) return;
      const { result, commitOptions, patches } = commitCommand(deck, {
        type: "DUPLICATE_SLIDE",
        slideId,
      });
      if (!result.ok) return;
      appendPendingPatches(pendingPatchesRef, patches);
      onDeckChange(result.deck, commitOptions);
      emitProductTelemetry("product.editor.command.succeeded", {
        commandName: "duplicate_slide",
        slideCount: result.deck.slides.length,
        surface: "slide-editor",
      });
      setSelectedIndex(index + 1);
    },
    [deck, onDeckChange, pendingPatchesRef, setSelectedIndex],
  );

  const handleRemove = useCallback(
    (index: number) => {
      const slideId = deck.slides[index]?.id;
      if (!slideId) return;
      const { result, commitOptions, patches } = commitCommand(deck, {
        type: "REMOVE_SLIDE",
        slideId,
      });
      if (!result.ok) return;
      appendPendingPatches(pendingPatchesRef, patches);
      onDeckChange(result.deck, commitOptions);
      emitProductTelemetry("product.editor.command.succeeded", {
        commandName: "remove_slide",
        slideCount: result.deck.slides.length,
        surface: "slide-editor",
      });
      setSelectedIndex((current) =>
        Math.max(0, Math.min(current, deck.slides.length - 2)),
      );
    },
    [deck, onDeckChange, pendingPatchesRef, setSelectedIndex],
  );

  const handleNotesChange = useCallback(
    (index: number, notes: string, coalesceKey?: string) => {
      const slideId = deck.slides[index]?.id;
      if (!slideId) return;
      const result = executeCommand(deck, {
        type: "UPDATE_SLIDE_NOTES",
        slideId,
        notes,
        ...(coalesceKey !== undefined ? { coalesceKey } : {}),
      });
      if (!result.ok) return;
      appendPendingPatches(pendingPatchesRef, result.patches);
      onDeckChange(
        result.deck,
        coalesceKey !== undefined
          ? { coalesceKey }
          : result.historyKey !== undefined
            ? { coalesceKey: result.historyKey }
            : undefined,
      );
    },
    [deck, onDeckChange, pendingPatchesRef],
  );

  const handleApplySlideTemplate = useCallback(
    (templateId: TemplateId) => {
      const slideId = currentSlide?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "APPLY_SLIDE_TEMPLATE",
        slideId,
        templateId,
      });
      clearSelection();
    },
    [deck, doCommitAndChange, currentSlide?.id, clearSelection],
  );

  const handleReapplySlideTemplate = useCallback((templateId: TemplateId) => {
    setPendingTemplateReapply(templateId);
  }, []);

  const handleCreateCustomTemplate = useCallback(() => {
    if (!currentSlide) return;
    const templateId = `custom-${crypto.randomUUID()}`;
    doCommitAndChange(deck, {
      type: "CREATE_CUSTOM_TEMPLATE",
      template: templateFromSlide(
        currentSlide,
        templateId,
        currentSlide.title.trim() ||
          `Custom ${(deck.customTemplates?.length ?? 0) + 1}`,
      ),
    });
  }, [currentSlide, deck, doCommitAndChange]);

  const handleUpdateCustomTemplateFromSlide = useCallback(
    (templateId: string) => {
      if (!currentSlide) return;
      const existing = (deck.customTemplates ?? []).find(
        (template) => template.id === templateId,
      );
      if (!existing) return;
      const next = templateFromSlide(currentSlide, templateId, existing.name);
      doCommitAndChange(deck, {
        type: "UPDATE_CUSTOM_TEMPLATE",
        templateId,
        patch: {
          name: next.name,
          category: next.category,
          ...(next.defaultMasterId
            ? { defaultMasterId: next.defaultMasterId }
            : {}),
          ...(next.slideDesignDefaults
            ? { slideDesignDefaults: next.slideDesignDefaults }
            : {}),
          elements: next.elements,
        },
      });
    },
    [currentSlide, deck, doCommitAndChange],
  );

  const handleDeleteCustomTemplate = useCallback(
    (templateId: string) => {
      doCommitAndChange(deck, { type: "DELETE_CUSTOM_TEMPLATE", templateId });
    },
    [deck, doCommitAndChange],
  );

  const handleSetSlideMaster = useCallback(
    (masterId: string | undefined) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "SET_SLIDE_MASTER",
        slideId,
        masterId,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleCreateMaster = useCallback(() => {
    const nextNumber = (deck.masters?.length ?? 0) + 1;
    doCommitAndChange(deck, {
      type: "CREATE_MASTER",
      master: {
        id: `master-${crypto.randomUUID()}`,
        name: `Master ${nextNumber}`,
        elements: [],
      },
    });
  }, [deck, doCommitAndChange]);

  const handleSetDefaultMaster = useCallback(
    (masterId: string) => {
      doCommitAndChange(deck, { type: "SET_DEFAULT_MASTER", masterId });
    },
    [deck, doCommitAndChange],
  );

  const handleDeleteMaster = useCallback(
    (masterId: string) => {
      doCommitAndChange(deck, { type: "DELETE_MASTER", masterId });
    },
    [deck, doCommitAndChange],
  );

  const handleUpdateMasterBackground = useCallback(
    (masterId: string, color: string | undefined) => {
      doCommitAndChange(deck, {
        type: "UPDATE_MASTER",
        masterId,
        patch: {
          background:
            color === undefined
              ? undefined
              : { type: "solid", color: { value: color } },
        },
      });
    },
    [deck, doCommitAndChange],
  );

  const handleAddMasterChromeText = useCallback(
    (masterId: string, kind: MasterChromeKind) => {
      const master = (deck.masters ?? []).find(
        (entry) => entry.id === masterId,
      );
      if (!master) return;
      const zIndex =
        master.elements.reduce(
          (max, element) => Math.max(max, element.zIndex),
          -1,
        ) + 1;
      doCommitAndChange(deck, {
        type: "UPDATE_MASTER",
        masterId,
        patch: {
          elements: [...master.elements, masterChromeElement(kind, zIndex)],
        },
      });
    },
    [deck, doCommitAndChange],
  );

  const handleApplyMasterToAllSlides = useCallback(
    (masterId: string) => {
      let working = deck;
      const patches: DeckPatch[] = [];
      for (const slide of deck.slides) {
        const { result, patches: nextPatches } = commitCommand(working, {
          type: "SET_SLIDE_MASTER",
          slideId: slide.id,
          masterId,
        });
        if (!result.ok) return;
        working = result.deck;
        patches.push(...nextPatches);
      }
      appendPendingPatches(pendingPatchesRef, patches);
      onDeckChange(working);
    },
    [deck, onDeckChange, pendingPatchesRef],
  );

  const handleConfirmTemplateReapply = useCallback(
    (mode: "replace" | "preserve") => {
      if (!pendingTemplateReapply) return;
      if (!currentSlide) {
        setPendingTemplateReapply(null);
        return;
      }
      doCommitAndChange(deck, {
        type: "APPLY_SLIDE_TEMPLATE",
        slideId: currentSlide.id,
        templateId: pendingTemplateReapply,
        mode,
      });
      clearSelection();
      setPendingTemplateReapply(null);
    },
    [
      pendingTemplateReapply,
      deck,
      doCommitAndChange,
      currentSlide,
      clearSelection,
    ],
  );

  return {
    pendingTemplateReapply,
    setPendingTemplateReapply,
    handleMove,
    handleDuplicate,
    handleRemove,
    handleNotesChange,
    handleApplySlideTemplate,
    handleReapplySlideTemplate,
    handleCreateCustomTemplate,
    handleUpdateCustomTemplateFromSlide,
    handleDeleteCustomTemplate,
    handleSetSlideMaster,
    handleCreateMaster,
    handleSetDefaultMaster,
    handleDeleteMaster,
    handleUpdateMasterBackground,
    handleAddMasterChromeText,
    handleApplyMasterToAllSlides,
    handleConfirmTemplateReapply,
  };
}

function templateFromSlide(slide: Slide, id: string, name: string) {
  return {
    id,
    name,
    category: templateCategory(slide),
    ...(slide.masterId ? { defaultMasterId: slide.masterId } : {}),
    ...(slide.designOverrides
      ? { slideDesignDefaults: slide.designOverrides }
      : {}),
    elements: (slide.elements ?? []).map(templateElementFromSlide),
  };
}

function templateCategory(
  slide: Slide,
): NonNullable<Deck["customTemplates"]>[number]["category"] {
  switch (slide.templateId) {
    case "title":
      return "title";
    case "section":
      return "section";
    case "media":
    case "visual":
      return "media";
    case "two-column":
      return "comparison";
    case "content":
      return "content";
    default:
      return "blank";
  }
}

function cloneRecord(input: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
}

function masterChromeElement(kind: MasterChromeKind, zIndex: number) {
  const id = `master-el-${crypto.randomUUID()}`;
  if (kind === "logo") {
    return {
      id,
      kind: "image",
      role: "logo",
      layer: "foreground",
      locked: true,
      box: { x: 4, y: 4, w: 12, h: 8 },
      zIndex,
      content: {
        kind: "image",
        src: TEMPLATE_IMAGE_PLACEHOLDER_SRC,
        alt: "Logo",
      },
    };
  }
  const text =
    kind === "footer"
      ? "Footer"
      : kind === "pageNumber"
        ? "{{pageNumber}}"
        : "Watermark";
  return {
    id,
    kind: "text",
    role: kind === "watermark" ? "background" : kind,
    layer: kind === "watermark" ? "background" : "foreground",
    locked: true,
    box:
      kind === "footer"
        ? { x: 6, y: 91, w: 72, h: 5 }
        : kind === "pageNumber"
          ? { x: 82, y: 91, w: 12, h: 5 }
          : { x: 18, y: 42, w: 64, h: 16 },
    zIndex,
    content: {
      kind: "text",
      text,
      paragraphs: [{ text }],
    },
    ...(kind === "watermark"
      ? {
          designOverrides: {
            textStyle: {
              fontSize: 8,
              align: "center",
              bold: true,
              italic: false,
              color: "#9ca3af",
            },
            opacity: 0.18,
          },
        }
      : {}),
  };
}

function templateElementFromSlide(element: SlideElement, index: number) {
  return {
    id: `template-element-${index + 1}`,
    kind: element.kind,
    ...(element.role ? { role: element.role } : {}),
    box: { ...element.box },
    contentDefaults: cloneRecord(
      element.content as unknown as Record<string, unknown>,
    ),
    ...(element.designOverrides
      ? {
          designOverrides: cloneRecord(
            element.designOverrides as Record<string, unknown>,
          ),
        }
      : {}),
  };
}
