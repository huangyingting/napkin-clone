/**
 * AI deck plan schema for v7.
 *
 * AI generates plans, not rendered decks. The plan is validated and repaired
 * before being compiled into SlideNode trees via the template compiler.
 */

import type {
  SemanticTemplateKind,
  SlideTone,
  SlideDensity,
  SlideEmphasis,
  SlotKey,
  AssetId,
} from "./schema";

// ---------------------------------------------------------------------------
// Slot values
// ---------------------------------------------------------------------------

export type BulletSlotItem = { text: string; children?: BulletSlotItem[] };
export type MetricSlotItem = { value: string; label: string; detail?: string };
export type CardSlotItem = { title: string; body?: string; metric?: string };
export type StepSlotItem = { title: string; body?: string; date?: string };
export type TimelineSlotItem = {
  label: string;
  title: string;
  body?: string;
};

export type SlotValue =
  | { type: "shortText"; text: string }
  | { type: "paragraph"; paragraphs: string[] }
  | { type: "bullets"; items: BulletSlotItem[] }
  | { type: "metric"; value: string; label: string; detail?: string }
  | { type: "metrics"; items: MetricSlotItem[] }
  | { type: "cards"; items: CardSlotItem[] }
  | { type: "steps"; items: StepSlotItem[] }
  | {
      type: "image";
      assetId?: AssetId;
      prompt?: string;
      alt?: string;
    }
  | {
      type: "table";
      columns: string[];
      rows: string[][];
      caption?: string;
    }
  | { type: "timeline"; items: TimelineSlotItem[] }
  | { type: "visual"; visualId: string; caption?: string };

// ---------------------------------------------------------------------------
// AI slide spec
// ---------------------------------------------------------------------------

export type AiSlideSpec = {
  kind: SemanticTemplateKind;
  tone?: SlideTone;
  density?: SlideDensity;
  emphasis?: SlideEmphasis;
  slots: Partial<Record<SlotKey, SlotValue>>;
  speakerNotes?: string;
};

// ---------------------------------------------------------------------------
// AI deck plan
// ---------------------------------------------------------------------------

export type AiDeckPlanV1 = {
  planVersion: 1;
  title?: string;
  locale?: string;
  slides: AiSlideSpec[];
};

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isSlotValue(value: unknown): value is SlotValue {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.type === "string";
}
