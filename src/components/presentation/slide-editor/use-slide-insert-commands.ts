"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import type { Deck, ShapeKind, SlideElement } from "@/lib/presentation/deck";
import { buildVisualElement, makeElementId } from "@/lib/presentation/deck";
import {
  addElement,
  type DistributiveOmit,
} from "@/lib/presentation/deck-mutations";
import type { AddElementKind } from "@/components/presentation/slide-inspector";
import {
  commitCommand,
  type DeckPatch,
} from "@/lib/presentation/slide-commands";
import { clearPendingPatches } from "./use-slide-editor-commit";
import {
  TEMPLATE_IMAGE_PLACEHOLDER_SRC,
  buildTemplateSlide,
  type SlideTemplateKind,
} from "@/lib/presentation/slide-templates";
import {
  buildInsertables,
  insertableTextElement,
  insertableVisualElement,
  type Insertable,
} from "@/lib/presentation/document-insertable";
import { insertSlide } from "@/lib/presentation/deck-mutations";
import { DEFAULT_VISUAL_BOX } from "@/lib/presentation/deck";
import { SLIDE_TEXT_FONT_SIZE } from "@/lib/presentation/text-defaults";
import {
  createTextResizeMeasurer,
  fitTextElementToContent,
  type TextLikeElement,
} from "@/lib/presentation/text-element-fit";
import { useImageUpload } from "@/lib/presentation/use-image-upload";
import type { Visual } from "@/lib/visual/schema";
import type { DocumentTextBlock } from "@/lib/content";
import type { ElementBox } from "@/lib/presentation/deck";
import type { PresentationRole } from "@/lib/presentation/presentation-theme";
import { emitProductTelemetry } from "@/lib/telemetry/product";
import type { SlideAssetActionPort } from "@/lib/action-ports";
import { deckCanvasFormat } from "@/components/presentation/v6-deck-ui";

type DoCommitAndChange = (
  deck: Deck,
  cmd: Parameters<typeof commitCommand>[1],
) => void;

function presentationRoleLabel(role: PresentationRole): string {
  switch (role) {
    case "title":
      return "Title";
    case "sectionTitle":
      return "Section title";
    case "subtitle":
      return "Subtitle";
    case "body":
      return "Body";
    case "bullet":
      return "Bullet";
    case "quote":
      return "Quote";
    case "caption":
      return "Caption";
    case "footer":
      return "Footer";
    case "label":
      return "Label";
    case "media":
      return "Media";
    case "visual":
      return "Visual";
    case "image":
      return "Image";
    case "logo":
      return "Logo";
    case "pageNumber":
      return "Page number";
    case "background":
      return "Background";
  }
}

function presentationRoleFontSize(role: PresentationRole): number {
  switch (role) {
    case "title":
      return SLIDE_TEXT_FONT_SIZE.h1;
    case "sectionTitle":
      return SLIDE_TEXT_FONT_SIZE.h2;
    case "bullet":
      return SLIDE_TEXT_FONT_SIZE.list;
    case "subtitle":
    case "caption":
    case "footer":
    case "label":
    case "quote":
    case "media":
    case "visual":
    case "image":
    case "logo":
    case "pageNumber":
    case "background":
    case "body":
      return SLIDE_TEXT_FONT_SIZE.text;
  }
}

function defaultTextBox(role: PresentationRole): ElementBox {
  switch (role) {
    case "title":
      return { x: 10, y: 18, w: 80, h: 14 };
    case "sectionTitle":
      return { x: 14, y: 26, w: 72, h: 10 };
    case "subtitle":
      return { x: 14, y: 34, w: 72, h: 9 };
    case "bullet":
      return { x: 14, y: 28, w: 72, h: 48 };
    case "caption":
      return { x: 18, y: 78, w: 64, h: 8 };
    case "footer":
      return { x: 8, y: 90, w: 84, h: 5 };
    case "label":
      return { x: 30, y: 44, w: 40, h: 10 };
    case "quote":
      return { x: 18, y: 36, w: 64, h: 18 };
    case "media":
    case "visual":
    case "image":
    case "logo":
    case "pageNumber":
    case "background":
    case "body":
      return { x: 20, y: 40, w: 60, h: 16 };
  }
}

function buildDefaultTextElement(
  role: PresentationRole,
  id: string,
): DistributiveOmit<SlideElement, "id" | "zIndex"> & { id: string } {
  const label = presentationRoleLabel(role);
  const isBullet = role === "bullet";
  const text = isBullet ? "First point\nSecond point" : label;
  const paragraphs = isBullet
    ? [
        { text: "First point", listType: "bullet" as const },
        { text: "Second point", listType: "bullet" as const },
      ]
    : [{ text: label }];
  return {
    id,
    kind: "text",
    role,
    box: defaultTextBox(role),
    content: { kind: "text", text, paragraphs },
    designOverrides: {
      textStyle: {
        fontSize: presentationRoleFontSize(role),
        bold: role === "title" || role === "sectionTitle",
        italic: role === "caption",
        align: role === "title" || role === "subtitle" ? "center" : "left",
      },
    },
  } as unknown as DistributiveOmit<SlideElement, "id" | "zIndex"> & {
    id: string;
  };
}

/** Builds a freshly-positioned element for the "Add" buttons. */
function buildDefaultElement(
  kind: AddElementKind,
  accent: string,
  id: string,
  shapeKind: ShapeKind = "rect",
): DistributiveOmit<SlideElement, "id" | "zIndex"> & { id: string } {
  switch (kind) {
    case "image":
      return {
        id,
        kind: "image",
        role: "image",
        box: { x: 25, y: 22, w: 50, h: 56 },
        content: {
          kind: "image",
          src: TEMPLATE_IMAGE_PLACEHOLDER_SRC,
          alt: "Image placeholder",
        },
      } as unknown as DistributiveOmit<SlideElement, "id" | "zIndex"> & {
        id: string;
      };
    case "shape":
      return {
        id,
        kind: "shape",
        role: "label",
        box:
          shapeKind === "line"
            ? { x: 20, y: 50, w: 60, h: 2 }
            : { x: 30, y: 34, w: 40, h: 32 },
        content: { kind: "shape", shape: shapeKind },
        designOverrides: { fill: { value: accent } },
      } as unknown as DistributiveOmit<SlideElement, "id" | "zIndex"> & {
        id: string;
      };
    default:
      return buildDefaultTextElement(kind, id);
  }
}

interface UseSlideInsertCommandsOptions {
  deck: Deck;
  safeSelected: number;
  pendingPatchesRef: { current: DeckPatch[] };
  onDeckChange: (deck: Deck) => void;
  doCommitAndChange: DoCommitAndChange;
  handleSelectElement: (id: string) => void;
  fittedStageSize: { width: number; height: number };
  zoom: number;
  accentForSelected: string;
  visuals: ReadonlyMap<string, Visual>;
  documentTextBlocks: readonly DocumentTextBlock[];
  documentId?: string;
  slideAssetPort?: SlideAssetActionPort;
  setInsertMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setSpotlightPickerOpen: (
    open: boolean | ((prev: boolean) => boolean),
  ) => void;
  setAddTemplateOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setVisualPickerOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setSelectedIndex: (
    indexOrUpdater: number | ((prev: number) => number),
  ) => void;
}

export function useSlideInsertCommands({
  deck,
  safeSelected,
  pendingPatchesRef,
  onDeckChange,
  doCommitAndChange,
  handleSelectElement,
  fittedStageSize,
  zoom,
  accentForSelected,
  visuals,
  documentTextBlocks,
  documentId,
  slideAssetPort,
  setInsertMenuOpen,
  setSpotlightPickerOpen,
  setAddTemplateOpen,
  setVisualPickerOpen,
  setSelectedIndex,
}: UseSlideInsertCommandsOptions) {
  const insertImageFileInputRef = useRef<HTMLInputElement>(null);
  const insertImagePendingIdRef = useRef<string | null>(null);
  const [insertImageError, setInsertImageError] = useState<string | null>(null);

  const fitInsertedTextElement = useCallback(
    <T extends TextLikeElement>(element: T, anchor: "top-left" | "center") => {
      const stageWidth = fittedStageSize.width * zoom;
      const stageHeight = fittedStageSize.height * zoom;
      if (stageWidth <= 0 || stageHeight <= 0) {
        return element;
      }
      const measurer = createTextResizeMeasurer(stageWidth, stageHeight);
      return fitTextElementToContent(element, measurer, anchor);
    },
    [fittedStageSize.height, fittedStageSize.width, zoom],
  );
  const handleAddTemplate = useCallback(
    (kind: SlideTemplateKind) => {
      if (kind === "visual" && visuals.size > 0) {
        setAddTemplateOpen(false);
        setSpotlightPickerOpen(true);
        return;
      }
      const slide = buildTemplateSlide(kind, {
        slideFormat: deckCanvasFormat(deck),
      });
      const next = insertSlide(deck, safeSelected, slide);
      clearPendingPatches(pendingPatchesRef);
      onDeckChange(next);
      emitProductTelemetry("product.editor.command.succeeded", {
        commandName: "add_template_slide",
        slideCount: next.slides.length,
        surface: "slide-editor",
      });
      setSelectedIndex(Math.min(safeSelected + 1, next.slides.length - 1));
      setAddTemplateOpen(false);
    },
    [
      deck,
      onDeckChange,
      pendingPatchesRef,
      safeSelected,
      visuals,
      setAddTemplateOpen,
      setSpotlightPickerOpen,
      setSelectedIndex,
    ],
  );

  const handleSpotlightPick = useCallback(
    (visualId: string) => {
      const slide = buildTemplateSlide("visual", {
        slideFormat: deckCanvasFormat(deck),
        visualId,
      });
      const next = insertSlide(deck, safeSelected, slide);
      clearPendingPatches(pendingPatchesRef);
      onDeckChange(next);
      emitProductTelemetry("product.editor.command.succeeded", {
        commandName: "add_visual_spotlight_slide",
        slideCount: next.slides.length,
        surface: "slide-editor",
      });
      setSelectedIndex(Math.min(safeSelected + 1, next.slides.length - 1));
      setSpotlightPickerOpen(false);
    },
    [
      deck,
      onDeckChange,
      pendingPatchesRef,
      safeSelected,
      setSpotlightPickerOpen,
      setSelectedIndex,
    ],
  );

  const handleInsertImageAccept = useCallback(
    (src: string, assetId?: string) => {
      const id = insertImagePendingIdRef.current;
      if (!id) return;
      insertImagePendingIdRef.current = null;
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      const baseElement = buildDefaultElement("image", accentForSelected, id);
      const element = {
        ...baseElement,
        content: {
          ...((baseElement as unknown as { content?: Record<string, unknown> })
            .content ?? {}),
          kind: "image",
          src,
          ...(assetId ? { assetId } : {}),
        },
      } as typeof baseElement;
      doCommitAndChange(deck, { type: "ADD_ELEMENT", slideId, element });
      handleSelectElement(id);
      setInsertImageError(null);
      setInsertMenuOpen(false);
    },
    [
      accentForSelected,
      deck,
      doCommitAndChange,
      handleSelectElement,
      safeSelected,
      setInsertMenuOpen,
    ],
  );

  const { handleFile: handleInsertImageFile } = useImageUpload({
    deck,
    currentSrc: "",
    onAccept: handleInsertImageAccept,
    onError: (message) => {
      insertImagePendingIdRef.current = null;
      setInsertImageError(message);
    },
    documentId,
    uploadFn: documentId ? slideAssetPort?.uploadSlideAsset : undefined,
  });

  const handleAddElement = useCallback(
    (kind: AddElementKind, shapeKind?: ShapeKind) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      if (kind === "image") {
        const id = makeElementId();
        insertImagePendingIdRef.current = id;
        setInsertImageError(null);

        const input = insertImageFileInputRef.current;
        if (!input) {
          const element = buildDefaultElement("image", accentForSelected, id);
          doCommitAndChange(deck, { type: "ADD_ELEMENT", slideId, element });
          handleSelectElement(id);
          setInsertMenuOpen(false);
          return;
        }

        const doFallback = () => {
          if (insertImagePendingIdRef.current !== id) return;
          insertImagePendingIdRef.current = null;
          const element = buildDefaultElement("image", accentForSelected, id);
          doCommitAndChange(deck, { type: "ADD_ELEMENT", slideId, element });
          handleSelectElement(id);
          setInsertMenuOpen(false);
        };

        const handleCancel = () => {
          input.removeEventListener("cancel", handleCancel);
          window.removeEventListener("focus", handleWindowFocus);
          doFallback();
        };

        const handleWindowFocus = () => {
          window.removeEventListener("focus", handleWindowFocus);
          setTimeout(() => {
            input.removeEventListener("cancel", handleCancel);
            doFallback();
          }, 300);
        };

        input.addEventListener("cancel", handleCancel);
        window.addEventListener("focus", handleWindowFocus);
        input.click();
        return;
      }

      const id = makeElementId();
      const rawElement = buildDefaultElement(
        kind,
        accentForSelected,
        id,
        shapeKind,
      );
      const element =
        rawElement.kind === "text"
          ? fitInsertedTextElement(rawElement, "top-left")
          : rawElement;
      doCommitAndChange(deck, { type: "ADD_ELEMENT", slideId, element });
      handleSelectElement(id);
      setInsertMenuOpen(false);
    },
    [
      accentForSelected,
      deck,
      doCommitAndChange,
      fitInsertedTextElement,
      handleSelectElement,
      safeSelected,
      setInsertMenuOpen,
    ],
  );

  const handleAddTextElement = useCallback(
    (box: ElementBox): string | null => {
      const slideId = deck.slides[safeSelected]?.id;
      const selectedSlide = deck.slides[safeSelected];
      if (!selectedSlide || !slideId) return null;
      const id = makeElementId();
      const element: TextLikeElement = {
        ...(buildDefaultElement(
          "body",
          accentForSelected,
          id,
        ) as TextLikeElement),
        box,
      };
      const fitted = fitInsertedTextElement(element, "center");
      doCommitAndChange(deck, {
        type: "ADD_ELEMENT",
        slideId,
        element: fitted,
      });
      handleSelectElement(id);
      return id;
    },
    [
      accentForSelected,
      deck,
      doCommitAndChange,
      fitInsertedTextElement,
      handleSelectElement,
      safeSelected,
    ],
  );

  const handleAddVisual = useCallback(
    (visualId: string) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      const element = buildVisualElement(visualId);
      doCommitAndChange(deck, { type: "ADD_ELEMENT", slideId, element });
      handleSelectElement(element.id);
      setVisualPickerOpen(false);
      setInsertMenuOpen(false);
    },
    [
      deck,
      doCommitAndChange,
      handleSelectElement,
      safeSelected,
      setVisualPickerOpen,
      setInsertMenuOpen,
    ],
  );

  const handleInsertDocumentVisual = useCallback(
    (item: Extract<Insertable, { kind: "visual" }>) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      const element = insertableVisualElement(item, { documentId });
      doCommitAndChange(deck, { type: "ADD_ELEMENT", slideId, element });
      handleSelectElement(element.id);
    },
    [deck, doCommitAndChange, documentId, handleSelectElement, safeSelected],
  );

  const handleInsertDocumentText = useCallback(
    (item: Extract<Insertable, { kind: "text" }>) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      const element = fitInsertedTextElement(
        insertableTextElement(item, { documentId }),
        "top-left",
      );
      doCommitAndChange(deck, { type: "ADD_ELEMENT", slideId, element });
      handleSelectElement(element.id);
    },
    [
      deck,
      doCommitAndChange,
      documentId,
      fitInsertedTextElement,
      handleSelectElement,
      safeSelected,
    ],
  );

  const handleAddAllVisuals = useCallback(() => {
    const ids = [...visuals.keys()];
    if (ids.length === 0) return;
    let next = deck;
    ids.forEach((visualId, i) => {
      const offset = Math.min(i, 8) * 2;
      const element = buildVisualElement(visualId, {
        box: {
          x: DEFAULT_VISUAL_BOX.x + offset,
          y: DEFAULT_VISUAL_BOX.y + offset,
          w: DEFAULT_VISUAL_BOX.w,
          h: DEFAULT_VISUAL_BOX.h,
        },
      });
      next = addElement(next, safeSelected, element);
    });
    clearPendingPatches(pendingPatchesRef);
    onDeckChange(next);
  }, [deck, onDeckChange, pendingPatchesRef, safeSelected, visuals]);

  const documentTextInsertables = useMemo(
    () =>
      buildInsertables(documentTextBlocks as DocumentTextBlock[]).filter(
        (item): item is Extract<Insertable, { kind: "text" }> =>
          item.kind === "text",
      ),
    [documentTextBlocks],
  );

  return {
    insertImageFileInputRef,
    handleInsertImageFile,
    insertImageError,
    fitInsertedTextElement,
    handleAddTemplate,
    handleSpotlightPick,
    handleAddElement,
    handleAddTextElement,
    handleAddVisual,
    handleInsertDocumentVisual,
    handleInsertDocumentText,
    handleAddAllVisuals,
    documentTextInsertables,
  };
}
