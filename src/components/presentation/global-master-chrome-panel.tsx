"use client";

import { PanelBottom, Upload, X } from "lucide-react";
import { useRef, useState } from "react";

import { SlideCanvas } from "@/components/presentation/slide-canvas";
import { SegmentedControl } from "@/components/ui";
import { FOCUS_RING } from "@/components/ui/tokens";
import { FIELD_CLASS } from "@/components/presentation/slide-inspector/primitives";
import type { SlideAssetActionPort } from "@/lib/action-ports";
import type { Deck, Slide } from "@/lib/presentation/deck";
import {
  readGlobalMasterChromeState,
  type GlobalMasterChromeKind,
  type GlobalMasterChromeUpdate,
  type GlobalMasterFooterState,
  type GlobalMasterLogoState,
  type GlobalMasterPageNumberState,
  type GlobalMasterWatermarkState,
  type LogoPlacement,
  type LogoSize,
  type PageNumberFormat,
  type PageNumberPlacement,
  type WatermarkLayout,
  type WatermarkSize,
} from "@/lib/presentation/global-master-chrome";
import { slideAspectRatio } from "@/lib/presentation/slide-format";
import { useImageUpload } from "@/lib/presentation/use-image-upload";
import type { Visual } from "@/lib/visual/schema";

type MasterChromeTab = GlobalMasterChromeKind;

const TAB_OPTIONS: ReadonlyArray<{ value: MasterChromeTab; label: string }> = [
  { value: "logo", label: "Logo" },
  { value: "footer", label: "Footer" },
  { value: "pageNumber", label: "Page #" },
  { value: "watermark", label: "Watermark" },
];

const LOGO_PLACEMENTS: ReadonlyArray<{ value: LogoPlacement; label: string }> =
  [
    { value: "top-left", label: "TL" },
    { value: "top-right", label: "TR" },
    { value: "bottom-left", label: "BL" },
    { value: "bottom-right", label: "BR" },
  ];

const LOGO_SIZES: ReadonlyArray<{ value: LogoSize; label: string }> = [
  { value: "small", label: "S" },
  { value: "medium", label: "M" },
  { value: "large", label: "L" },
];

const ALIGN_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
] as const;

const PAGE_FORMATS: ReadonlyArray<{ value: PageNumberFormat; label: string }> =
  [
    { value: "number", label: "1" },
    { value: "number-total", label: "1 / N" },
  ];

const PAGE_PLACEMENTS: ReadonlyArray<{
  value: PageNumberPlacement;
  label: string;
}> = [
  { value: "bottom-left", label: "L" },
  { value: "bottom-center", label: "C" },
  { value: "bottom-right", label: "R" },
];

const WATERMARK_LAYOUTS: ReadonlyArray<{
  value: WatermarkLayout;
  label: string;
}> = [
  { value: "center", label: "Center" },
  { value: "diagonal", label: "Diagonal" },
];

const WATERMARK_SIZES: ReadonlyArray<{ value: WatermarkSize; label: string }> =
  [
    { value: "small", label: "S" },
    { value: "medium", label: "M" },
    { value: "large", label: "L" },
  ];

export interface GlobalMasterChromePanelProps {
  deck: Deck;
  slide: Slide;
  visuals: ReadonlyMap<string, Visual>;
  documentId?: string;
  slideAssetPort?: SlideAssetActionPort;
  onChange: (update: GlobalMasterChromeUpdate) => void;
}

function ToggleRow({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs font-medium text-ds-text-primary">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-ds-accent disabled:opacity-50"
      />
    </label>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-medium text-ds-text-secondary">
      {label}
      {children}
    </label>
  );
}

function GhostButton({
  children,
  onClick,
  disabled = false,
  danger = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        danger
          ? "text-ds-danger-text hover:bg-ds-danger-surface"
          : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary"
      } ${FOCUS_RING}`}
    >
      {children}
    </button>
  );
}

export function GlobalMasterChromePanel({
  deck,
  slide,
  visuals,
  documentId,
  slideAssetPort,
  onChange,
}: GlobalMasterChromePanelProps) {
  const [activeTab, setActiveTab] = useState<MasterChromeTab>("logo");
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const chrome = readGlobalMasterChromeState(deck);

  const updateLogo = (patch: Partial<GlobalMasterLogoState>) => {
    onChange({ kind: "logo", state: { ...chrome.logo, ...patch } });
  };
  const updateFooter = (patch: Partial<GlobalMasterFooterState>) => {
    onChange({ kind: "footer", state: { ...chrome.footer, ...patch } });
  };
  const updatePageNumber = (patch: Partial<GlobalMasterPageNumberState>) => {
    onChange({
      kind: "pageNumber",
      state: { ...chrome.pageNumber, ...patch },
    });
  };
  const updateWatermark = (patch: Partial<GlobalMasterWatermarkState>) => {
    onChange({
      kind: "watermark",
      state: { ...chrome.watermark, ...patch },
    });
  };

  const { handleFile: handleLogoFile } = useImageUpload({
    deck,
    currentSrc: chrome.logo.src,
    onAccept: (src, assetId) => {
      setLogoError(null);
      updateLogo({ enabled: true, src, assetId });
    },
    onError: setLogoError,
    documentId,
    uploadFn: documentId ? slideAssetPort?.uploadSlideAsset : undefined,
  });

  return (
    <div className="flex max-h-[70vh] w-[320px] flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-ds-border-subtle px-3 py-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-ds-sm bg-ds-accent-surface text-ds-accent-text">
          <PanelBottom size={14} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-xs font-semibold text-ds-text-primary">
            Customize deck chrome
          </h3>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 overflow-y-auto p-2.5">
        <SegmentedControl
          aria-label="Master chrome"
          value={activeTab}
          onChange={setActiveTab}
          options={TAB_OPTIONS}
          size="sm"
          stretch
        />

        <div className="mx-auto w-full max-w-[240px] rounded-ds-md border border-ds-border-subtle bg-ds-surface-sunken p-1.5">
          <div
            className="overflow-hidden rounded-ds-sm border border-ds-border-subtle bg-ds-surface shadow-ds-flat"
            style={{ aspectRatio: slideAspectRatio(deck.canvas?.format) }}
          >
            <SlideCanvas slide={slide} deck={deck} visuals={visuals} preview />
          </div>
        </div>

        {activeTab === "logo" ? (
          <div className="flex flex-col gap-3">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                handleLogoFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <ToggleRow
              label="Show logo"
              checked={chrome.logo.enabled}
              disabled={!chrome.logo.src}
              onChange={(enabled) => updateLogo({ enabled })}
            />
            <div className="flex gap-2">
              <GhostButton onClick={() => logoInputRef.current?.click()}>
                <Upload size={14} aria-hidden="true" />
                Choose image
              </GhostButton>
              <GhostButton
                danger
                disabled={!chrome.logo.src}
                onClick={() =>
                  updateLogo({ enabled: false, src: "", assetId: undefined })
                }
              >
                <X size={14} aria-hidden="true" />
                Clear
              </GhostButton>
            </div>
            {logoError ? (
              <p role="alert" className="text-xs text-ds-danger-text">
                {logoError}
              </p>
            ) : null}
            <Field label="Position">
              <SegmentedControl
                aria-label="Logo position"
                value={chrome.logo.placement}
                onChange={(placement) => updateLogo({ placement })}
                options={LOGO_PLACEMENTS}
                size="sm"
                stretch
              />
            </Field>
            <Field label="Size">
              <SegmentedControl
                aria-label="Logo size"
                value={chrome.logo.size}
                onChange={(size) => updateLogo({ size })}
                options={LOGO_SIZES}
                size="sm"
                stretch
              />
            </Field>
          </div>
        ) : null}

        {activeTab === "footer" ? (
          <div className="flex flex-col gap-3">
            <ToggleRow
              label="Show footer"
              checked={chrome.footer.enabled}
              onChange={(enabled) => updateFooter({ enabled })}
            />
            <Field label="Text">
              <input
                type="text"
                value={chrome.footer.text}
                onChange={(event) => updateFooter({ text: event.target.value })}
                className={`${FIELD_CLASS} ${FOCUS_RING}`}
              />
            </Field>
            <Field label="Alignment">
              <SegmentedControl
                aria-label="Footer alignment"
                value={chrome.footer.align}
                onChange={(align) => updateFooter({ align })}
                options={ALIGN_OPTIONS}
                size="sm"
                stretch
              />
            </Field>
          </div>
        ) : null}

        {activeTab === "pageNumber" ? (
          <div className="flex flex-col gap-3">
            <ToggleRow
              label="Show page number"
              checked={chrome.pageNumber.enabled}
              onChange={(enabled) => updatePageNumber({ enabled })}
            />
            <Field label="Format">
              <SegmentedControl
                aria-label="Page number format"
                value={chrome.pageNumber.format}
                onChange={(format) => updatePageNumber({ format })}
                options={PAGE_FORMATS}
                size="sm"
                stretch
              />
            </Field>
            <Field label="Position">
              <SegmentedControl
                aria-label="Page number position"
                value={chrome.pageNumber.placement}
                onChange={(placement) => updatePageNumber({ placement })}
                options={PAGE_PLACEMENTS}
                size="sm"
                stretch
              />
            </Field>
          </div>
        ) : null}

        {activeTab === "watermark" ? (
          <div className="flex flex-col gap-3">
            <ToggleRow
              label="Show watermark"
              checked={chrome.watermark.enabled}
              onChange={(enabled) => updateWatermark({ enabled })}
            />
            <Field label="Text">
              <input
                type="text"
                value={chrome.watermark.text}
                onChange={(event) =>
                  updateWatermark({ text: event.target.value })
                }
                className={`${FIELD_CLASS} ${FOCUS_RING}`}
              />
            </Field>
            <Field label="Layout">
              <SegmentedControl
                aria-label="Watermark layout"
                value={chrome.watermark.layout}
                onChange={(layout) => updateWatermark({ layout })}
                options={WATERMARK_LAYOUTS}
                size="sm"
                stretch
              />
            </Field>
            <Field label="Size">
              <SegmentedControl
                aria-label="Watermark size"
                value={chrome.watermark.size}
                onChange={(size) => updateWatermark({ size })}
                options={WATERMARK_SIZES}
                size="sm"
                stretch
              />
            </Field>
            <Field label="Opacity">
              <input
                type="range"
                min={0.05}
                max={0.6}
                step={0.05}
                value={chrome.watermark.opacity}
                onChange={(event) =>
                  updateWatermark({ opacity: Number(event.target.value) })
                }
                className="w-full accent-ds-accent"
              />
            </Field>
          </div>
        ) : null}
      </div>
    </div>
  );
}
