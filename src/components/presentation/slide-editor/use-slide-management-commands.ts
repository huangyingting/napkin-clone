"use client";

import { useCallback, useState } from "react";

import type { Deck, Slide, SlideElement } from "@/lib/presentation/deck";
import {
  commitCommand,
  executeCommand,
  type DeckPatch,
  type SlideCommand,
} from "@/lib/presentation/slide-commands";
import { appendPendingPatches } from "./use-slide-editor-commit";
import { emitProductTelemetry } from "@/lib/telemetry/product";
import { type SlideTemplateKind } from "@/lib/presentation/slide-templates";
import { hasMasterChromeKind } from "@/lib/presentation/global-master-chrome";

type TemplateId = SlideTemplateKind | string;

type DoCommitAndChange = (deck: Deck, cmd: SlideCommand) => void;

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
    handleConfirmTemplateReapply,
  };
}

function templateFromSlide(slide: Slide, id: string, name: string) {
  return {
    id,
    name,
    category: templateCategory(slide),
    ...(slide.designOverrides
      ? { slideDesignDefaults: slide.designOverrides }
      : {}),
    elements: (slide.elements ?? [])
      .filter((element) => !hasMasterChromeKind(element))
      .map(templateElementFromSlide),
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
