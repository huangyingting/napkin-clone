"use client";

import { Minus, Shapes } from "lucide-react";
import { useState } from "react";

import {
  InheritedFontControl,
  LineHeightControl,
  ParagraphSpacingControl,
  RichTextBox,
  RoleSelectControl,
  VerticalAlignControl,
  defaultPresentationRole,
  presentationRoleValue,
} from "./controls";
import { PanelSection, PropRow, SelectField } from "./primitives";
import {
  HorizontalAlignControl,
  TextEmphasisControl,
  TextPanelCardHeader,
  TextSizeColorControl,
} from "./text-style-controls";
import type { SlideInspectorProps } from "./types";
import { ColorPicker, Tabs } from "@/components/ui";
import {
  elementDesignOverrides,
  shapeContent,
  shapeTextDesign,
} from "@/components/presentation/slide-canvas/v6-model";
import type {
  Deck,
  ShapeKind,
  Slide,
  SlideElement,
  TextElementStyle,
} from "@/lib/presentation/deck";
import type { ElementPatch } from "@/lib/presentation/deck-mutations";
import { resolveRoleToken } from "@/lib/presentation/presentation-theme";
import { runsToHtml, shouldStoreRuns } from "@/lib/presentation/rich-text-html";
import { matchSlideFont } from "@/lib/presentation/slide-fonts";
import { resolveSlideTokenSet } from "@/lib/presentation/style-cascade";

const SHAPE_OPTIONS: ShapeKind[] = ["rect", "ellipse", "line", "triangle"];

const DEFAULT_SHAPE_TEXT_STYLE: TextElementStyle = {
  fontSize: 4,
  bold: false,
  italic: false,
  align: "center",
};

function useShapeLabelState({
  element,
  deck,
  slide,
  onUpdateElement,
}: {
  element: Extract<SlideElement, { kind: "shape" }>;
  deck: Deck;
  slide: Slide;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  const currentShape = shapeContent(element);
  const style = { ...DEFAULT_SHAPE_TEXT_STYLE, ...shapeTextDesign(element) };
  const updateStyle = (next: TextElementStyle) => {
    onUpdateElement(element.id, {
      designOverrides: {
        ...elementDesignOverrides(element),
        textStyle: next,
      },
    } as ElementPatch);
  };

  const role = defaultPresentationRole(element);
  const tokenSet = resolveSlideTokenSet(deck, slide);
  const roleToken = resolveRoleToken(tokenSet, role);
  const inheritedColor = roleToken.color;
  const inheritedFontLabel =
    matchSlideFont(roleToken.fontFamily ?? tokenSet.typography.fontFamily)
      ?.label ?? "theme font";

  return {
    currentShape,
    style,
    inheritedColor,
    inheritedFontLabel,
    updateStyle,
  };
}

function ShapeContentControl({
  element,
  deck,
  slide,
  onUpdateElement,
}: {
  element: Extract<SlideElement, { kind: "shape" }>;
  deck: Deck;
  slide: Slide;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  const { currentShape } = useShapeLabelState({
    element,
    deck,
    slide,
    onUpdateElement,
  });

  return (
    <RichTextBox
      label="Label"
      placeholder="Add label"
      html={runsToHtml(currentShape.textRuns, currentShape.text ?? "")}
      hideLabel
      fill
      onChange={({ text, runs }, coalesceKey) =>
        onUpdateElement(
          element.id,
          {
            content: {
              ...currentShape,
              kind: "shape",
              text: text.trim().length > 0 ? text : undefined,
              textRuns:
                shouldStoreRuns(runs) && text.trim().length > 0
                  ? runs
                  : undefined,
            },
          } as ElementPatch,
          coalesceKey,
        )
      }
    />
  );
}

function ShapeLabelStyleControls({
  element,
  deck,
  slide,
  onUpdateElement,
}: {
  element: Extract<SlideElement, { kind: "shape" }>;
  deck: Deck;
  slide: Slide;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  const { style, inheritedColor, inheritedFontLabel, updateStyle } =
    useShapeLabelState({ element, deck, slide, onUpdateElement });

  return (
    <>
      <RoleSelectControl
        element={element}
        onChange={(role) =>
          onUpdateElement(element.id, {
            role: presentationRoleValue(role),
          } as ElementPatch)
        }
      />
      <TextEmphasisControl style={style} onChange={updateStyle} />
      <TextSizeColorControl
        style={style}
        inheritedColor={inheritedColor}
        onChange={updateStyle}
      />
      <InheritedFontControl
        style={style}
        inheritedLabel={inheritedFontLabel}
        showReset={false}
        onChange={updateStyle}
      />
    </>
  );
}

function ShapeParagraphControls({
  element,
  deck,
  slide,
  onUpdateElement,
}: {
  element: Extract<SlideElement, { kind: "shape" }>;
  deck: Deck;
  slide: Slide;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  const { style, updateStyle } = useShapeLabelState({
    element,
    deck,
    slide,
    onUpdateElement,
  });

  return (
    <>
      <HorizontalAlignControl style={style} onChange={updateStyle} />
      <LineHeightControl style={style} onChange={updateStyle} />
      <ParagraphSpacingControl style={style} onChange={updateStyle} />
      <VerticalAlignControl style={style} onChange={updateStyle} />
    </>
  );
}

type ShapeInspectorTab = "style" | "paragraph" | "content";

export function ShapePanel({
  element,
  deck,
  slide,
  showAdvanced,
  onUpdateElement,
}: {
  element: Extract<SlideElement, { kind: "shape" }>;
  deck: Deck;
  slide: Slide;
  showAdvanced: boolean;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  const [activeTab, setActiveTab] = useState<ShapeInspectorTab>("style");
  const currentShape = shapeContent(element);
  const resetStyle = () => {
    const currentFontSize = shapeTextDesign(element).fontSize;
    const {
      fill: _discardedFill,
      stroke: _discardedStroke,
      radius: _discardedRadius,
      textStyle: _discardedTextStyle,
      ...nextDesign
    } = elementDesignOverrides(element);
    onUpdateElement(element.id, {
      designOverrides:
        currentFontSize === undefined
          ? nextDesign
          : { ...nextDesign, textStyle: { fontSize: currentFontSize } },
      role: undefined,
    } as ElementPatch);
  };
  const resetParagraph = () => {
    const nextStyle = { ...shapeTextDesign(element) };
    delete nextStyle.align;
    delete nextStyle.lineHeight;
    delete nextStyle.verticalAlign;
    delete nextStyle.paragraphSpacing;
    const { textStyle: _discarded, ...baseDesign } =
      elementDesignOverrides(element);
    onUpdateElement(element.id, {
      designOverrides:
        Object.keys(nextStyle).length > 0
          ? { ...baseDesign, textStyle: nextStyle }
          : baseDesign,
    } as ElementPatch);
  };
  const resetContentStyles = () => {
    onUpdateElement(element.id, {
      content: {
        ...currentShape,
        kind: "shape",
        textRuns: undefined,
      },
    } as ElementPatch);
  };

  if (currentShape.shape === "line") {
    return (
      <ShapeAppearancePanel
        element={element}
        showAdvanced={showAdvanced}
        onUpdateElement={onUpdateElement}
      />
    );
  }

  return (
    <PanelSection
      className={activeTab === "content" ? "min-h-0 flex-1 gap-1" : "gap-1"}
    >
      <Tabs
        aria-label="Shape settings"
        value={activeTab}
        onChange={setActiveTab}
        options={[
          { value: "style", label: "Style" },
          { value: "paragraph", label: "Paragraph" },
          { value: "content", label: "Content" },
        ]}
      />

      {activeTab === "style" ? (
        <div className="flex flex-col gap-2 rounded-ds-md bg-ds-surface-raised/60 p-2 ring-1 ring-ds-border-subtle">
          <div className="flex justify-end">
            <TextPanelCardHeader
              resetLabel="Reset style"
              onReset={resetStyle}
            />
          </div>
          <ShapeAppearanceControls
            element={element}
            showAdvanced={showAdvanced}
            onUpdateElement={onUpdateElement}
          />
          <ShapeLabelStyleControls
            element={element}
            deck={deck}
            slide={slide}
            onUpdateElement={onUpdateElement}
          />
        </div>
      ) : null}

      {activeTab === "paragraph" ? (
        <div className="flex flex-col gap-2 rounded-ds-md bg-ds-surface-raised/60 p-2 ring-1 ring-ds-border-subtle">
          <div className="flex justify-end">
            <TextPanelCardHeader
              resetLabel="Reset paragraph"
              onReset={resetParagraph}
            />
          </div>
          <ShapeParagraphControls
            element={element}
            deck={deck}
            slide={slide}
            onUpdateElement={onUpdateElement}
          />
        </div>
      ) : null}

      {activeTab === "content" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-ds-md bg-ds-surface-raised/60 p-2 ring-1 ring-ds-border-subtle">
          <div className="flex justify-end">
            <TextPanelCardHeader
              resetLabel="Reset content"
              onReset={resetContentStyles}
            />
          </div>
          <ShapeContentControl
            element={element}
            deck={deck}
            slide={slide}
            onUpdateElement={onUpdateElement}
          />
        </div>
      ) : null}
    </PanelSection>
  );
}

export function ShapeAppearanceControls({
  element,
  showAdvanced,
  onUpdateElement,
}: {
  element: Extract<SlideElement, { kind: "shape" }>;
  showAdvanced: boolean;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  const currentShape = shapeContent(element);
  const currentShapeDesign = elementDesignOverrides(element);
  const currentStroke = currentShapeDesign.stroke as
    | { color: string; width: number }
    | undefined;
  const currentFill =
    typeof (currentShapeDesign.fill as { value?: unknown } | undefined)
      ?.value === "string"
      ? (currentShapeDesign.fill as { value: string }).value
      : "#6366f1";

  return (
    <>
      <PropRow label="Kind">
        <SelectField
          value={currentShape.shape}
          ariaLabel="Shape kind"
          onChange={(value) =>
            onUpdateElement(element.id, {
              content: {
                ...currentShape,
                kind: "shape",
                shape: value as ShapeKind,
              },
            } as ElementPatch)
          }
          options={SHAPE_OPTIONS.map((shape) => ({
            value: shape,
            label: shape,
          }))}
        />
      </PropRow>
      {currentShape.shape !== "line" ? (
        <PropRow label="Fill">
          <ColorPicker
            color={currentFill}
            fallback="#6366f1"
            aria-label="Fill color"
            onChange={(hex) =>
              onUpdateElement(element.id, {
                designOverrides: {
                  ...currentShapeDesign,
                  fill: { value: hex },
                },
              } as ElementPatch)
            }
          />
        </PropRow>
      ) : null}
      {currentShape.shape !== "triangle" ? (
        <PropRow label={currentShape.shape === "line" ? "Thickness" : "Border"}>
          {currentShape.shape !== "line" ? (
            <ColorPicker
              color={currentStroke?.color ?? "#000000"}
              fallback="#000000"
              aria-label="Border color"
              onChange={(hex) =>
                onUpdateElement(element.id, {
                  designOverrides: {
                    ...currentShapeDesign,
                    stroke: {
                      color: hex,
                      width: currentStroke?.width ?? 0.4,
                    },
                  },
                } as ElementPatch)
              }
            />
          ) : null}
          <input
            type="range"
            min={0}
            max={3}
            step={0.25}
            value={
              currentStroke?.width ?? (currentShape.shape === "line" ? 0.4 : 0)
            }
            onChange={(event) => {
              const width = Number(event.target.value);
              onUpdateElement(element.id, {
                designOverrides: {
                  ...currentShapeDesign,
                  stroke:
                    width <= 0
                      ? undefined
                      : {
                          color:
                            currentStroke?.color ??
                            (currentShape.shape === "line"
                              ? currentFill
                              : "#000000"),
                          width,
                        },
                },
              } as ElementPatch);
            }}
            className="min-w-0 flex-1 accent-ds-accent"
            aria-label={
              currentShape.shape === "line" ? "Line thickness" : "Border width"
            }
          />
        </PropRow>
      ) : null}
      {currentShape.shape === "rect" && showAdvanced ? (
        <PropRow label="Radius">
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={
              typeof currentShapeDesign.radius === "number"
                ? currentShapeDesign.radius
                : 0
            }
            onChange={(event) => {
              const radius = Number(event.target.value);
              onUpdateElement(element.id, {
                designOverrides: {
                  ...currentShapeDesign,
                  radius: radius <= 0 ? undefined : radius,
                },
              } as ElementPatch);
            }}
            className="min-w-0 flex-1 accent-ds-accent"
            aria-label="Corner radius"
          />
        </PropRow>
      ) : null}
    </>
  );
}

export function ShapeAppearancePanel({
  element,
  showAdvanced,
  onUpdateElement,
}: {
  element: Extract<SlideElement, { kind: "shape" }>;
  showAdvanced: boolean;
  onUpdateElement: SlideInspectorProps["onUpdateElement"];
}) {
  const currentShape = shapeContent(element);
  return (
    <PanelSection
      title={currentShape.shape === "line" ? "Line" : "Shape"}
      icon={
        currentShape.shape === "line" ? (
          <Minus size={12} aria-hidden="true" />
        ) : (
          <Shapes size={12} aria-hidden="true" />
        )
      }
    >
      <ShapeAppearanceControls
        element={element}
        showAdvanced={showAdvanced}
        onUpdateElement={onUpdateElement}
      />
    </PanelSection>
  );
}
