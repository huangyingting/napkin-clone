"use client";

import { Upload } from "lucide-react";
import { useRef, useState } from "react";

import {
  slideAccentValue,
  slideBackgroundGradientValue,
  slideBackgroundImageValue,
  slideSolidBackgroundValue,
} from "@/components/presentation/v6-deck-ui";
import { FOCUS_RING } from "@/components/ui/tokens";
import { assertNever } from "@/lib/assert-never";
import { ColorOverride } from "@/components/presentation/slide-inspector/controls";
import {
  FIELD_CLASS,
  PanelSection,
  PropRow,
  SelectField,
} from "@/components/presentation/slide-inspector/primitives";
import type { SlideInspectorProps } from "@/components/presentation/slide-inspector/types";
import {
  inspectSlideDesignOrigins,
  type Deck,
  type Slide,
  type SlideDesignOriginLayer,
} from "@/lib/presentation/deck";
import { canAddImage, dataUrlByteSize } from "@/lib/presentation/image-element";
import { allThemeTokenSets } from "@/lib/presentation/presentation-theme";
import {
  SLIDE_TEMPLATES,
  type SlideTemplateKind,
} from "@/lib/presentation/slide-templates";
import { useImageUpload } from "@/lib/presentation/use-image-upload";
import { resolveSlideThemeColors } from "@/lib/presentation/style-cascade";
import {
  mergeSwatches,
  tokenSetSwatchColors,
} from "@/lib/presentation/text-style";

const BUILT_IN_THEME_TOKEN_SETS = allThemeTokenSets();
const THEME_BACKGROUND_SWATCHES = tokenSetSwatchColors(
  BUILT_IN_THEME_TOKEN_SETS,
  "slideBg",
);
const THEME_ACCENT_SWATCHES = tokenSetSwatchColors(
  BUILT_IN_THEME_TOKEN_SETS,
  "accent",
);

type TemplateOption = {
  id: string;
  label: string;
  custom: boolean;
};

function designOriginLabel(layer: SlideDesignOriginLayer): string {
  switch (layer) {
    case "theme":
      return "Inherited from theme";
    case "master":
      return "Inherited from master";
    case "deck":
      return "Inherited from deck default";
    case "slide":
      return "Slide override";
    default:
      return assertNever(layer);
  }
}

function slideTemplateKind(slide: Slide): SlideTemplateKind {
  const templateId = slide.templateId;
  if (templateId === "title") return "title";
  if (templateId === "content") return "content";
  if (templateId === "two-column") return "two-column";
  if (templateId === "media" || templateId === "visual") return "visual";
  return "blank";
}

export function SlidePanelBody({
  slide,
  deck,
  brandSwatches,
  showAdvanced,
  documentId,
  slideAssetPort,
  onApplyTemplate,
  onReapplyTemplate,
  onCreateCustomTemplate,
  onUpdateCustomTemplateFromSlide,
  onDeleteCustomTemplate,
  onSetSlideMaster,
  onCreateMaster,
  onSetDefaultMaster,
  onDeleteMaster,
  onUpdateMasterBackground,
  onAddMasterChromeText,
  onApplyMasterToAllSlides,
  onBackgroundChange,
  onBackgroundGradientChange,
  onBackgroundImageChange,
  onBackgroundAssetChange,
  onAccentChange,
}: {
  slide: Slide;
  deck: Deck;
  brandSwatches: readonly string[];
  showAdvanced: boolean;
  documentId?: string;
  slideAssetPort?: SlideInspectorProps["slideAssetPort"];
  onApplyTemplate: SlideInspectorProps["onApplyTemplate"];
  onReapplyTemplate: SlideInspectorProps["onReapplyTemplate"];
  onCreateCustomTemplate: SlideInspectorProps["onCreateCustomTemplate"];
  onUpdateCustomTemplateFromSlide: SlideInspectorProps["onUpdateCustomTemplateFromSlide"];
  onDeleteCustomTemplate: SlideInspectorProps["onDeleteCustomTemplate"];
  onSetSlideMaster: SlideInspectorProps["onSetSlideMaster"];
  onCreateMaster: SlideInspectorProps["onCreateMaster"];
  onSetDefaultMaster: SlideInspectorProps["onSetDefaultMaster"];
  onDeleteMaster: SlideInspectorProps["onDeleteMaster"];
  onUpdateMasterBackground: SlideInspectorProps["onUpdateMasterBackground"];
  onAddMasterChromeText: SlideInspectorProps["onAddMasterChromeText"];
  onApplyMasterToAllSlides: SlideInspectorProps["onApplyMasterToAllSlides"];
  onBackgroundChange: SlideInspectorProps["onBackgroundChange"];
  onBackgroundGradientChange: SlideInspectorProps["onBackgroundGradientChange"];
  onBackgroundImageChange: SlideInspectorProps["onBackgroundImageChange"];
  onBackgroundAssetChange?: SlideInspectorProps["onBackgroundAssetChange"];
  onAccentChange: SlideInspectorProps["onAccentChange"];
}) {
  const slideTemplateId = slideTemplateKind(slide);
  const [templateSelection, setTemplateSelection] = useState<{
    slideId: string;
    slideTemplateId: string;
    templateId: string;
  }>(() => ({
    slideId: slide.id,
    slideTemplateId,
    templateId: slideTemplateId,
  }));
  const selectedTemplateId =
    templateSelection.slideId === slide.id &&
    templateSelection.slideTemplateId === slideTemplateId
      ? templateSelection.templateId
      : slideTemplateId;
  const setSelectedTemplateId = (templateId: string) => {
    setTemplateSelection({
      slideId: slide.id,
      slideTemplateId,
      templateId,
    });
  };
  const [bgImageError, setBgImageError] = useState<string | null>(null);
  const bgFileInputRef = useRef<HTMLInputElement>(null);
  const templateOptions: TemplateOption[] = [
    ...SLIDE_TEMPLATES.map((template) => ({
      id: template.kind,
      label: template.label,
      custom: false,
    })),
    ...((deck.customTemplates ?? []).map((template) => ({
      id: template.id,
      label: template.name,
      custom: true,
    })) satisfies TemplateOption[]),
  ];
  const selectedTemplate =
    templateOptions.find((template) => template.id === selectedTemplateId) ??
    templateOptions[0];
  const deckMasters = deck.masters ?? [];
  const defaultMaster = deckMasters.find(
    (master) => master.id === deck.defaultMasterId,
  );
  const activeMaster =
    deckMasters.find((master) => master.id === slide.masterId) ??
    defaultMaster ??
    deckMasters[0];
  const activeMasterBackground =
    activeMaster?.background?.type === "solid" &&
    "value" in activeMaster.background.color
      ? activeMaster.background.color.value
      : undefined;
  const backgroundImage = slideBackgroundImageValue(slide);
  const backgroundGradient = slideBackgroundGradientValue(slide);
  const backgroundColor = slideSolidBackgroundValue(slide);
  const accentColor = slideAccentValue(slide);
  const designOrigins = inspectSlideDesignOrigins(deck, slide);
  const themeColors = resolveSlideThemeColors(deck, slide);

  function handleBackgroundImageChange(value: string | undefined) {
    if (value?.startsWith("data:")) {
      if (!value.startsWith("data:image/")) {
        setBgImageError("Please enter an image data URL (data:image/…).");
        return;
      }
      const addedBytes = value.length - dataUrlByteSize(backgroundImage);
      if (addedBytes > 0) {
        const budget = canAddImage(deck, addedBytes);
        if (!budget.ok) {
          const usedMb = (budget.totalBytes / (1024 * 1024)).toFixed(1);
          setBgImageError(
            `Deck image storage is full (${usedMb} MB). Remove an image or use a smaller file.`,
          );
          return;
        }
      }
    }
    setBgImageError(null);
    onBackgroundImageChange(value);
  }

  const { handleFile: handleBgImageFile } = useImageUpload({
    deck,
    currentSrc: backgroundImage,
    onAccept: (src, assetId) => {
      setBgImageError(null);
      if (assetId && onBackgroundAssetChange) {
        onBackgroundAssetChange({ url: src, assetId });
      } else {
        handleBackgroundImageChange(src);
      }
    },
    onError: (message) => setBgImageError(message),
    documentId: documentId ?? undefined,
    uploadFn: documentId ? slideAssetPort?.uploadSlideAsset : undefined,
  });

  return (
    <>
      {selectedTemplate ? (
        <PanelSection title="Template">
          <PropRow label="Blueprint">
            <SelectField
              value={selectedTemplate.id}
              onChange={setSelectedTemplateId}
              ariaLabel="Slide template"
              options={templateOptions.map((template) => ({
                value: template.id,
                label: template.label,
              }))}
            />
          </PropRow>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onApplyTemplate(selectedTemplate.id)}
              className={`rounded-ds-md border border-ds-border-subtle bg-ds-surface px-3 py-1.5 text-[13px] font-medium text-ds-text-primary hover:bg-ds-state-hover ${FOCUS_RING}`}
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => onReapplyTemplate(selectedTemplate.id)}
              className={`rounded-ds-md border border-ds-danger-border bg-ds-danger-surface px-3 py-1.5 text-[13px] font-medium text-ds-danger-text hover:opacity-90 ${FOCUS_RING}`}
            >
              Reapply
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onCreateCustomTemplate}
              className={`rounded-ds-md border border-ds-border-subtle bg-ds-surface px-3 py-1.5 text-[13px] font-medium text-ds-text-primary hover:bg-ds-state-hover ${FOCUS_RING}`}
            >
              Save custom
            </button>
            <button
              type="button"
              disabled={!selectedTemplate.custom}
              onClick={() =>
                onUpdateCustomTemplateFromSlide(selectedTemplate.id)
              }
              className={`rounded-ds-md border border-ds-danger-border bg-ds-danger-surface px-3 py-1.5 text-[13px] font-medium text-ds-danger-text hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
            >
              Update custom
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!selectedTemplate.custom}
              onClick={() => onDeleteCustomTemplate(selectedTemplate.id)}
              className={`rounded-ds-md border border-ds-danger-border bg-ds-danger-surface px-3 py-1.5 text-[13px] font-medium text-ds-danger-text hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
            >
              Delete custom
            </button>
          </div>
        </PanelSection>
      ) : null}
      {deckMasters.length > 0 ? (
        <PanelSection title="Master">
          <PropRow label="Default">
            <SelectField
              value={deck.defaultMasterId ?? deckMasters[0]?.id ?? ""}
              onChange={onSetDefaultMaster}
              ariaLabel="Deck default master"
              options={deckMasters.map((master) => ({
                value: master.id,
                label: master.name,
              }))}
            />
          </PropRow>
          <PropRow label="Chrome">
            <SelectField
              value={slide.masterId ?? "__default"}
              onChange={(value) =>
                onSetSlideMaster(value === "__default" ? undefined : value)
              }
              ariaLabel="Slide master"
              options={[
                {
                  value: "__default",
                  label: `Deck default${defaultMaster ? ` (${defaultMaster.name})` : ""}`,
                },
                ...deckMasters.map((master) => ({
                  value: master.id,
                  label: master.name,
                })),
              ]}
            />
          </PropRow>
          {designOrigins.masterId ? (
            <p className="text-[11px] leading-relaxed text-ds-text-muted">
              {designOriginLabel(designOrigins.masterId.layer)}
            </p>
          ) : null}
          {activeMaster ? (
            <ColorOverride
              label="Master background"
              value={activeMasterBackground}
              fallback={themeColors.bgColor}
              presets={mergeSwatches(brandSwatches, THEME_BACKGROUND_SWATCHES)}
              onChange={(color) =>
                onUpdateMasterBackground(activeMaster.id, color)
              }
            />
          ) : null}
          {activeMaster ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onAddMasterChromeText(activeMaster.id, "footer")}
                className={`rounded-ds-md border border-ds-border-subtle bg-ds-surface px-3 py-1.5 text-[13px] font-medium text-ds-text-primary hover:bg-ds-state-hover ${FOCUS_RING}`}
              >
                Add footer
              </button>
              <button
                type="button"
                onClick={() =>
                  onAddMasterChromeText(activeMaster.id, "pageNumber")
                }
                className={`rounded-ds-md border border-ds-border-subtle bg-ds-surface px-3 py-1.5 text-[13px] font-medium text-ds-text-primary hover:bg-ds-state-hover ${FOCUS_RING}`}
              >
                Add page #
              </button>
            </div>
          ) : null}
          {activeMaster ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onAddMasterChromeText(activeMaster.id, "logo")}
                className={`rounded-ds-md border border-ds-border-subtle bg-ds-surface px-3 py-1.5 text-[13px] font-medium text-ds-text-primary hover:bg-ds-state-hover ${FOCUS_RING}`}
              >
                Add logo
              </button>
              <button
                type="button"
                onClick={() =>
                  onAddMasterChromeText(activeMaster.id, "watermark")
                }
                className={`rounded-ds-md border border-ds-border-subtle bg-ds-surface px-3 py-1.5 text-[13px] font-medium text-ds-text-primary hover:bg-ds-state-hover ${FOCUS_RING}`}
              >
                Add watermark
              </button>
            </div>
          ) : null}
          {activeMaster ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onApplyMasterToAllSlides(activeMaster.id)}
                className={`rounded-ds-md border border-ds-border-subtle bg-ds-surface px-3 py-1.5 text-[13px] font-medium text-ds-text-primary hover:bg-ds-state-hover ${FOCUS_RING}`}
              >
                Apply to all
              </button>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onCreateMaster}
              className={`rounded-ds-md border border-ds-border-subtle bg-ds-surface px-3 py-1.5 text-[13px] font-medium text-ds-text-primary hover:bg-ds-state-hover ${FOCUS_RING}`}
            >
              Create master
            </button>
            <button
              type="button"
              disabled={
                !slide.masterId || slide.masterId === deck.defaultMasterId
              }
              onClick={() => {
                if (slide.masterId) onDeleteMaster(slide.masterId);
              }}
              className={`rounded-ds-md border border-ds-danger-border bg-ds-danger-surface px-3 py-1.5 text-[13px] font-medium text-ds-danger-text hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
            >
              Delete master
            </button>
          </div>
        </PanelSection>
      ) : null}
      <PanelSection title="Background">
        <ColorOverride
          label="Background"
          value={backgroundColor}
          fallback={themeColors.bgColor}
          presets={mergeSwatches(brandSwatches, THEME_BACKGROUND_SWATCHES)}
          onChange={onBackgroundChange}
        />
        <p className="text-[11px] leading-relaxed text-ds-text-muted">
          {designOriginLabel(designOrigins.background.layer)}
        </p>
        <ColorOverride
          label="Accent"
          value={accentColor}
          fallback={themeColors.accentColor}
          presets={mergeSwatches(brandSwatches, THEME_ACCENT_SWATCHES)}
          onChange={onAccentChange}
        />
        <p className="text-[11px] leading-relaxed text-ds-text-muted">
          {designOriginLabel(designOrigins.accent.layer)}
        </p>
        {showAdvanced ? (
          <>
            <PropRow label="Gradient">
              <input
                type="checkbox"
                checked={backgroundGradient !== undefined}
                onChange={(event) =>
                  onBackgroundGradientChange(
                    event.target.checked
                      ? {
                          from: backgroundGradient?.from ?? "#6366f1",
                          to: backgroundGradient?.to ?? "#ec4899",
                          angle: backgroundGradient?.angle ?? 135,
                        }
                      : undefined,
                  )
                }
                className="h-4 w-4 accent-ds-accent"
                aria-label="Enable gradient background"
              />
            </PropRow>
            {backgroundGradient ? (
              <PropRow label="Stops" align="center">
                <input
                  type="color"
                  value={backgroundGradient.from}
                  onChange={(event) =>
                    onBackgroundGradientChange({
                      ...backgroundGradient,
                      from: event.target.value,
                    })
                  }
                  className="h-7 w-9 cursor-pointer rounded border border-ds-border-subtle bg-transparent"
                  aria-label="Gradient start color"
                />
                <input
                  type="color"
                  value={backgroundGradient.to}
                  onChange={(event) =>
                    onBackgroundGradientChange({
                      ...backgroundGradient,
                      to: event.target.value,
                    })
                  }
                  className="h-7 w-9 cursor-pointer rounded border border-ds-border-subtle bg-transparent"
                  aria-label="Gradient end color"
                />
                <input
                  type="range"
                  min={0}
                  max={360}
                  step={5}
                  value={backgroundGradient.angle ?? 135}
                  onChange={(event) =>
                    onBackgroundGradientChange({
                      ...backgroundGradient,
                      angle: Number(event.target.value),
                    })
                  }
                  className="min-w-0 flex-1 accent-ds-accent"
                  aria-label="Gradient angle"
                />
              </PropRow>
            ) : null}
          </>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => bgFileInputRef.current?.click()}
            className={`flex w-full items-center justify-center gap-2 rounded-ds-md border border-dashed border-ds-border-subtle bg-ds-surface px-2 py-2 text-[13px] text-ds-text-secondary transition-colors hover:bg-ds-state-hover ${FOCUS_RING}`}
          >
            <Upload size={14} aria-hidden="true" />
            {backgroundImage ? "Replace image" : "Upload image"}
          </button>
          <input
            ref={bgFileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              handleBgImageFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <input
            type="text"
            value={backgroundImage ?? ""}
            onChange={(event) =>
              handleBackgroundImageChange(
                event.target.value.trim() === ""
                  ? undefined
                  : event.target.value.trim(),
              )
            }
            placeholder="https://… or data:image/…"
            className={`${FIELD_CLASS} ${FOCUS_RING}`}
            aria-label="Background image URL"
          />
          {bgImageError ? (
            <p role="alert" className="text-xs text-ds-danger-text">
              {bgImageError}
            </p>
          ) : null}
          <p className="text-[11px] leading-relaxed text-ds-text-muted">
            Overrides apply to this slide only. Image &gt; gradient &gt; solid
            color. “Theme” clears the color override.
          </p>
        </div>
      </PanelSection>
    </>
  );
}
