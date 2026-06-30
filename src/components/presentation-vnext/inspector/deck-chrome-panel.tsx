"use client";

import type { JSX } from "react";

import type {
  DeckChromeConfig,
  DeckChromeKind,
  SlideDeckChromeOverrides,
  SlideProps,
} from "@/lib/presentation-vnext/schema";
import { FOCUS_RING } from "@/components/ui/tokens";

const CHROME_KINDS: DeckChromeKind[] = [
  "logo",
  "footer",
  "pageNumber",
  "watermark",
  "border",
  "safeArea",
];

const LABELS: Record<DeckChromeKind, string> = {
  logo: "Logo",
  footer: "Footer",
  pageNumber: "Page number",
  watermark: "Watermark",
  border: "Border",
  safeArea: "Safe area",
};

type ChromeOverrideMode = "inherit" | "disabled" | "detached" | "override";
type ChromeValuePatch = Partial<NonNullable<DeckChromeConfig[DeckChromeKind]>>;

export interface DeckChromePanelProps {
  chrome?: DeckChromeConfig;
  slideProps?: SlideProps;
  onUpdateChrome: (patch: Partial<DeckChromeConfig>) => void;
  onUpdateSlideProps: (patch: Partial<SlideProps>) => void;
}

function inputClass(extra = "") {
  return `rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1 text-xs text-ds-text-primary outline-none ${FOCUS_RING}${extra ? ` ${extra}` : ""}`;
}

function nextOverrides(
  current: SlideDeckChromeOverrides | undefined,
  kind: DeckChromeKind,
  mode: ChromeOverrideMode,
  inheritedValue?: ChromeValuePatch,
): SlideDeckChromeOverrides {
  const existing = current?.[kind];
  const existingValue = existing?.mode === "override" ? existing.value : {};
  return {
    ...(current ?? {}),
    [kind]:
      mode === "override"
        ? { mode, value: { ...(inheritedValue ?? {}), ...existingValue } }
        : mode === "detached"
          ? { mode }
          : { mode },
  };
}

function updateOverrideValue(
  current: SlideDeckChromeOverrides | undefined,
  kind: DeckChromeKind,
  patch: ChromeValuePatch,
): SlideDeckChromeOverrides {
  const existing = current?.[kind];
  const existingValue = existing?.mode === "override" ? existing.value : {};
  return {
    ...(current ?? {}),
    [kind]: { mode: "override", value: { ...existingValue, ...patch } },
  };
}

function valueRecord(value: ChromeValuePatch): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

function stringField(value: ChromeValuePatch, key: string, fallback = "") {
  const candidate = valueRecord(value)[key];
  return typeof candidate === "string" ? candidate : fallback;
}

function numberField(value: ChromeValuePatch, key: string, fallback: number) {
  const candidate = valueRecord(value)[key];
  return typeof candidate === "number" && Number.isFinite(candidate)
    ? candidate
    : fallback;
}

function enabledField(value: ChromeValuePatch) {
  const candidate = valueRecord(value).enabled;
  return typeof candidate === "boolean" ? candidate : true;
}

function parseNumber(value: string): number | undefined {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isConfigured(item: { enabled?: boolean } | undefined): boolean {
  return item !== undefined && item.enabled !== false;
}

function renderOverrideFields(
  kind: DeckChromeKind,
  value: ChromeValuePatch,
  onPatch: (patch: ChromeValuePatch) => void,
): JSX.Element {
  const enabledControl = (
    <label className="grid grid-cols-[auto_1fr] items-center gap-2 text-[11px] text-ds-text-secondary">
      <input
        type="checkbox"
        checked={enabledField(value)}
        onChange={(event) => onPatch({ enabled: event.currentTarget.checked })}
      />
      Enabled on this slide
    </label>
  );

  if (kind === "logo") {
    return (
      <div className="col-span-2 ml-2 grid grid-cols-2 gap-2 border-l border-ds-border-subtle pl-2">
        {enabledControl}
        <input
          value={stringField(value, "assetId")}
          placeholder="Logo asset id"
          onChange={(event) => onPatch({ assetId: event.currentTarget.value })}
          className={inputClass("col-span-2 font-mono")}
        />
        <select
          value={stringField(value, "placement", "top-right")}
          onChange={(event) =>
            onPatch({
              placement: event.currentTarget.value as NonNullable<
                DeckChromeConfig["logo"]
              >["placement"],
            })
          }
          className={inputClass()}
        >
          <option value="top-left">Top left</option>
          <option value="top-right">Top right</option>
          <option value="bottom-left">Bottom left</option>
          <option value="bottom-right">Bottom right</option>
        </select>
        <select
          value={stringField(value, "size", "medium")}
          onChange={(event) =>
            onPatch({
              size: event.currentTarget.value as NonNullable<
                DeckChromeConfig["logo"]
              >["size"],
            })
          }
          className={inputClass()}
        >
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
      </div>
    );
  }

  if (kind === "footer") {
    return (
      <div className="col-span-2 ml-2 grid grid-cols-2 gap-2 border-l border-ds-border-subtle pl-2">
        {enabledControl}
        <input
          value={stringField(value, "text")}
          placeholder="Footer text"
          onChange={(event) => onPatch({ text: event.currentTarget.value })}
          className={inputClass("col-span-2")}
        />
        <select
          value={stringField(value, "align", "center")}
          onChange={(event) =>
            onPatch({
              align: event.currentTarget.value as NonNullable<
                DeckChromeConfig["footer"]
              >["align"],
            })
          }
          className={inputClass()}
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </div>
    );
  }

  if (kind === "pageNumber") {
    return (
      <div className="col-span-2 ml-2 grid grid-cols-2 gap-2 border-l border-ds-border-subtle pl-2">
        {enabledControl}
        <select
          value={stringField(value, "format", "number")}
          onChange={(event) =>
            onPatch({
              format: event.currentTarget.value as NonNullable<
                DeckChromeConfig["pageNumber"]
              >["format"],
            })
          }
          className={inputClass()}
        >
          <option value="number">1</option>
          <option value="number-total">1 / total</option>
        </select>
        <select
          value={stringField(value, "placement", "bottom-right")}
          onChange={(event) =>
            onPatch({
              placement: event.currentTarget.value as NonNullable<
                DeckChromeConfig["pageNumber"]
              >["placement"],
            })
          }
          className={inputClass()}
        >
          <option value="bottom-left">Bottom left</option>
          <option value="bottom-center">Bottom center</option>
          <option value="bottom-right">Bottom right</option>
        </select>
      </div>
    );
  }

  if (kind === "watermark") {
    return (
      <div className="col-span-2 ml-2 grid grid-cols-2 gap-2 border-l border-ds-border-subtle pl-2">
        {enabledControl}
        <input
          value={stringField(value, "text")}
          placeholder="Watermark text"
          onChange={(event) => onPatch({ text: event.currentTarget.value })}
          className={inputClass("col-span-2")}
        />
        <select
          value={stringField(value, "layoutMode", "diagonal")}
          onChange={(event) =>
            onPatch({
              layoutMode: event.currentTarget.value as NonNullable<
                DeckChromeConfig["watermark"]
              >["layoutMode"],
            })
          }
          className={inputClass()}
        >
          <option value="center">Center</option>
          <option value="diagonal">Diagonal</option>
        </select>
        <select
          value={stringField(value, "size", "medium")}
          onChange={(event) =>
            onPatch({
              size: event.currentTarget.value as NonNullable<
                DeckChromeConfig["watermark"]
              >["size"],
            })
          }
          className={inputClass()}
        >
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
      </div>
    );
  }

  return (
    <div className="col-span-2 ml-2 grid grid-cols-2 gap-2 border-l border-ds-border-subtle pl-2">
      {enabledControl}
      <input
        type="color"
        value={stringField(
          value,
          "color",
          kind === "border" ? "#cbd5e1" : "#94a3b8",
        )}
        onChange={(event) => onPatch({ color: event.currentTarget.value })}
        className={`h-8 rounded-ds-md border border-ds-border-subtle bg-ds-surface ${FOCUS_RING}`}
      />
      <input
        type="number"
        min="0"
        step="0.25"
        value={numberField(value, "widthPt", kind === "border" ? 1 : 0.75)}
        onChange={(event) =>
          onPatch({ widthPt: parseNumber(event.currentTarget.value) })
        }
        className={inputClass()}
      />
    </div>
  );
}

export function DeckChromePanel({
  chrome,
  slideProps,
  onUpdateChrome,
  onUpdateSlideProps,
}: DeckChromePanelProps): JSX.Element {
  const deckChromeOverrides = slideProps?.deckChrome;

  return (
    <section className="flex flex-col gap-3 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[10px] font-bold uppercase tracking-[0.06em] text-ds-text-muted">
          Deck Chrome
        </h4>
        <button
          type="button"
          onClick={() => onUpdateSlideProps({ deckChrome: undefined })}
          className="rounded-ds-sm border border-ds-border-subtle px-2 py-1 text-[11px] text-ds-text-secondary hover:bg-ds-state-hover"
        >
          Reset slide
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <label className="grid grid-cols-[auto_1fr] items-center gap-2 text-xs text-ds-text-secondary">
          <input
            type="checkbox"
            checked={isConfigured(chrome?.logo)}
            onChange={(event) =>
              onUpdateChrome({
                logo: {
                  ...(chrome?.logo ?? {}),
                  enabled: event.currentTarget.checked,
                },
              })
            }
          />
          Global logo
        </label>
        <input
          value={chrome?.logo?.assetId ?? ""}
          placeholder="Image asset id"
          onChange={(event) =>
            onUpdateChrome({
              logo: {
                ...(chrome?.logo ?? {}),
                assetId: event.currentTarget.value,
              },
            })
          }
          className={inputClass("font-mono")}
        />
        <select
          value={chrome?.logo?.placement ?? "top-right"}
          onChange={(event) =>
            onUpdateChrome({
              logo: {
                ...(chrome?.logo ?? {}),
                placement: event.currentTarget.value as NonNullable<
                  DeckChromeConfig["logo"]
                >["placement"],
              },
            })
          }
          className={inputClass()}
        >
          <option value="top-left">Top left</option>
          <option value="top-right">Top right</option>
          <option value="bottom-left">Bottom left</option>
          <option value="bottom-right">Bottom right</option>
        </select>
        <select
          value={chrome?.logo?.size ?? "medium"}
          onChange={(event) =>
            onUpdateChrome({
              logo: {
                ...(chrome?.logo ?? {}),
                size: event.currentTarget.value as NonNullable<
                  DeckChromeConfig["logo"]
                >["size"],
              },
            })
          }
          className={inputClass()}
        >
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
      </div>

      <div className="grid grid-cols-[auto_1fr] items-center gap-2 text-xs text-ds-text-secondary">
        <input
          id="deck-chrome-footer-enabled"
          type="checkbox"
          checked={isConfigured(chrome?.footer)}
          onChange={(event) =>
            onUpdateChrome({
              footer: {
                ...(chrome?.footer ?? {}),
                enabled: event.currentTarget.checked,
              },
            })
          }
        />
        <label htmlFor="deck-chrome-footer-enabled">Global footer</label>
      </div>
      <input
        value={chrome?.footer?.text ?? ""}
        placeholder="Footer text"
        onChange={(event) =>
          onUpdateChrome({
            footer: {
              ...(chrome?.footer ?? {}),
              text: event.currentTarget.value,
            },
          })
        }
        className={inputClass()}
      />
      <select
        value={chrome?.footer?.align ?? "center"}
        onChange={(event) =>
          onUpdateChrome({
            footer: {
              ...(chrome?.footer ?? {}),
              align: event.currentTarget.value as NonNullable<
                DeckChromeConfig["footer"]
              >["align"],
            },
          })
        }
        className={inputClass()}
      >
        <option value="left">Footer left</option>
        <option value="center">Footer centered</option>
        <option value="right">Footer right</option>
      </select>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
          Page number
          <select
            value={isConfigured(chrome?.pageNumber) ? "on" : "off"}
            onChange={(event) =>
              onUpdateChrome({
                pageNumber: {
                  ...(chrome?.pageNumber ?? {}),
                  enabled: event.currentTarget.value === "on",
                },
              })
            }
            className={inputClass()}
          >
            <option value="off">Off</option>
            <option value="on">On</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
          Format
          <select
            value={chrome?.pageNumber?.format ?? "number"}
            onChange={(event) =>
              onUpdateChrome({
                pageNumber: {
                  ...(chrome?.pageNumber ?? {}),
                  format: event.currentTarget.value as NonNullable<
                    DeckChromeConfig["pageNumber"]
                  >["format"],
                },
              })
            }
            className={inputClass()}
          >
            <option value="number">1</option>
            <option value="number-total">1 / total</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
          Placement
          <select
            value={chrome?.pageNumber?.placement ?? "bottom-right"}
            onChange={(event) =>
              onUpdateChrome({
                pageNumber: {
                  ...(chrome?.pageNumber ?? {}),
                  placement: event.currentTarget.value as NonNullable<
                    DeckChromeConfig["pageNumber"]
                  >["placement"],
                },
              })
            }
            className={inputClass()}
          >
            <option value="bottom-left">Bottom left</option>
            <option value="bottom-center">Bottom center</option>
            <option value="bottom-right">Bottom right</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-[auto_1fr] items-center gap-2 text-xs text-ds-text-secondary">
        <input
          id="deck-chrome-watermark-enabled"
          type="checkbox"
          checked={isConfigured(chrome?.watermark)}
          onChange={(event) =>
            onUpdateChrome({
              watermark: {
                ...(chrome?.watermark ?? {}),
                enabled: event.currentTarget.checked,
              },
            })
          }
        />
        <label htmlFor="deck-chrome-watermark-enabled">Global watermark</label>
      </div>
      <input
        value={chrome?.watermark?.text ?? ""}
        placeholder="Watermark text"
        onChange={(event) =>
          onUpdateChrome({
            watermark: {
              ...(chrome?.watermark ?? {}),
              text: event.currentTarget.value,
            },
          })
        }
        className={inputClass()}
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
          Watermark layout
          <select
            value={chrome?.watermark?.layoutMode ?? "diagonal"}
            onChange={(event) =>
              onUpdateChrome({
                watermark: {
                  ...(chrome?.watermark ?? {}),
                  layoutMode: event.currentTarget.value as NonNullable<
                    DeckChromeConfig["watermark"]
                  >["layoutMode"],
                },
              })
            }
            className={inputClass()}
          >
            <option value="center">Center</option>
            <option value="diagonal">Diagonal</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
          Watermark size
          <select
            value={chrome?.watermark?.size ?? "medium"}
            onChange={(event) =>
              onUpdateChrome({
                watermark: {
                  ...(chrome?.watermark ?? {}),
                  size: event.currentTarget.value as NonNullable<
                    DeckChromeConfig["watermark"]
                  >["size"],
                },
              })
            }
            className={inputClass()}
          >
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
          Border
          <select
            value={isConfigured(chrome?.border) ? "on" : "off"}
            onChange={(event) =>
              onUpdateChrome({
                border: {
                  ...(chrome?.border ?? {}),
                  enabled: event.currentTarget.value === "on",
                },
              })
            }
            className={inputClass()}
          >
            <option value="off">Off</option>
            <option value="on">On</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
          Border color
          <input
            type="color"
            value={chrome?.border?.color ?? "#cbd5e1"}
            onChange={(event) =>
              onUpdateChrome({
                border: {
                  ...(chrome?.border ?? {}),
                  color: event.currentTarget.value,
                },
              })
            }
            className={`h-8 rounded-ds-md border border-ds-border-subtle bg-ds-surface ${FOCUS_RING}`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
          Border width
          <input
            type="number"
            min="0"
            step="0.25"
            value={chrome?.border?.widthPt ?? 1}
            onChange={(event) =>
              onUpdateChrome({
                border: {
                  ...(chrome?.border ?? {}),
                  widthPt: parseNumber(event.currentTarget.value),
                },
              })
            }
            className={inputClass()}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
          Safe area
          <select
            value={isConfigured(chrome?.safeArea) ? "on" : "off"}
            onChange={(event) =>
              onUpdateChrome({
                safeArea: {
                  ...(chrome?.safeArea ?? {}),
                  enabled: event.currentTarget.value === "on",
                },
              })
            }
            className={inputClass()}
          >
            <option value="off">Off</option>
            <option value="on">On</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
          Safe area color
          <input
            type="color"
            value={chrome?.safeArea?.color ?? "#94a3b8"}
            onChange={(event) =>
              onUpdateChrome({
                safeArea: {
                  ...(chrome?.safeArea ?? {}),
                  color: event.currentTarget.value,
                },
              })
            }
            className={`h-8 rounded-ds-md border border-ds-border-subtle bg-ds-surface ${FOCUS_RING}`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ds-text-secondary">
          Safe area width
          <input
            type="number"
            min="0"
            step="0.25"
            value={chrome?.safeArea?.widthPt ?? 0.75}
            onChange={(event) =>
              onUpdateChrome({
                safeArea: {
                  ...(chrome?.safeArea ?? {}),
                  widthPt: parseNumber(event.currentTarget.value),
                },
              })
            }
            className={inputClass()}
          />
        </label>
      </div>

      <div className="my-1 h-px bg-ds-border-subtle" aria-hidden="true" />
      <h5 className="text-[10px] font-bold uppercase tracking-[0.06em] text-ds-text-muted">
        Slide Overrides
      </h5>
      {CHROME_KINDS.map((kind) => {
        const override = deckChromeOverrides?.[kind];
        const mode = override?.mode ?? "inherit";
        const overrideValue =
          override?.mode === "override" && override.value ? override.value : {};
        return (
          <div
            key={kind}
            className="grid grid-cols-[1fr_auto] items-center gap-2 text-xs text-ds-text-secondary"
          >
            <label htmlFor={`deck-chrome-override-${kind}`}>
              {LABELS[kind]}
            </label>
            <select
              id={`deck-chrome-override-${kind}`}
              value={mode}
              onChange={(event) =>
                onUpdateSlideProps({
                  deckChrome: nextOverrides(
                    deckChromeOverrides,
                    kind,
                    event.currentTarget.value as ChromeOverrideMode,
                    chrome?.[kind],
                  ),
                })
              }
              className={inputClass("w-32")}
            >
              <option value="inherit">Inherit</option>
              <option value="disabled">Disable</option>
              <option value="override">Override</option>
              {mode === "detached" ? (
                <option value="detached">Detached</option>
              ) : null}
            </select>
            {mode === "override"
              ? renderOverrideFields(kind, overrideValue, (patch) =>
                  onUpdateSlideProps({
                    deckChrome: updateOverrideValue(
                      deckChromeOverrides,
                      kind,
                      patch,
                    ),
                  }),
                )
              : null}
          </div>
        );
      })}
    </section>
  );
}
