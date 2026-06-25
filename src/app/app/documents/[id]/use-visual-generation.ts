"use client";

import { useCallback, useRef, useState } from "react";

import {
  isCreditError,
  requestVisualCandidates,
  stampSourceText,
} from "@/lib/visual/generate";
import type { DetailLevel, Orientation } from "@/lib/ai/prompt";
import type { Visual, VisualKind } from "@/lib/visual/schema";

export type GenStatus = "idle" | "loading";

export const VISUAL_KIND_CATEGORY_ORDER = [
  { id: "mindmap", label: "Mindmap" },
  { id: "process", label: "Process" },
  { id: "data", label: "Data" },
  { id: "timelines", label: "Timelines" },
  { id: "comparison", label: "Comparison" },
  { id: "business", label: "Business Frameworks" },
  { id: "more", label: "More visuals" },
] as const;

export type VisualKindCategoryId =
  (typeof VISUAL_KIND_CATEGORY_ORDER)[number]["id"];
export type VisualResultSectionId = "ai" | VisualKindCategoryId;

export const VISUAL_KIND_CATEGORY: Partial<
  Record<VisualKind, VisualKindCategoryId>
> = {
  mindmap: "mindmap",
  concept: "mindmap",
  orgchart: "mindmap",
  flowchart: "process",
  list: "process",
  cycle: "process",
  funnel: "process",
  chart: "data",
  matrix: "data",
  timeline: "timelines",
  comparison: "comparison",
  venn: "comparison",
  pyramid: "business",
};

export const MAX_GENERATED_VISUALS_PER_SECTION = 8;

export interface GenOptions {
  type: VisualKind | "auto";
  orientation: Orientation;
  detailLevel: DetailLevel | "auto";
  stayCloserToText: boolean;
}

export const DEFAULT_GEN_OPTIONS: GenOptions = {
  type: "auto",
  orientation: "auto",
  detailLevel: "auto",
  stayCloserToText: false,
};

export const DEFAULT_EXPANDED_VISUAL_CATEGORIES: Record<string, boolean> = {
  ai: true,
  mindmap: true,
  process: true,
};

export function visualResultSectionForType(
  type: GenOptions["type"],
): VisualResultSectionId {
  if (type === "auto") {
    return "ai";
  }
  return VISUAL_KIND_CATEGORY[type] ?? "more";
}

export interface VisualGenerationTarget {
  text: string;
}

interface GenerateOptions {
  append?: boolean;
  limit?: number;
  options?: GenOptions;
}

export function useVisualGeneration() {
  const [status, setStatus] = useState<GenStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [errorSection, setErrorSection] =
    useState<VisualResultSectionId | null>(null);
  const [creditError, setCreditError] = useState(false);
  const [activeGenerationSection, setActiveGenerationSection] =
    useState<VisualResultSectionId | null>(null);
  const [generatedVisualsBySection, setGeneratedVisualsBySection] = useState<
    Partial<Record<VisualResultSectionId, Visual[]>>
  >({});
  const [genOptions, setGenOptions] = useState<GenOptions>(DEFAULT_GEN_OPTIONS);
  const sourceTextRef = useRef("");

  const resetGeneration = useCallback((keepOptions = true) => {
    setGeneratedVisualsBySection({});
    setError(null);
    setErrorSection(null);
    setStatus("idle");
    setActiveGenerationSection(null);
    setCreditError(false);
    sourceTextRef.current = "";
    if (!keepOptions) {
      setGenOptions(DEFAULT_GEN_OPTIONS);
    }
  }, []);

  const generate = useCallback(
    async (
      target: VisualGenerationTarget,
      generateOptions: GenerateOptions = {},
    ) => {
      const opts = generateOptions.options ?? genOptions;
      const section = visualResultSectionForType(opts.type);
      const append = generateOptions.append ?? true;
      const limit = generateOptions.limit ?? MAX_GENERATED_VISUALS_PER_SECTION;

      sourceTextRef.current = target.text.trim();
      setStatus("loading");
      setActiveGenerationSection(section);
      setError(null);
      setErrorSection(null);
      setCreditError(false);

      const result = await requestVisualCandidates(target.text, {
        type: opts.type,
        orientation: opts.orientation,
        detailLevel: opts.detailLevel,
        stayCloserToText: opts.stayCloserToText,
      });

      setStatus("idle");
      setActiveGenerationSection(null);
      if (result.ok) {
        setGeneratedVisualsBySection((current) => ({
          ...current,
          [section]: append
            ? [...result.candidates, ...(current[section] ?? [])].slice(
                0,
                limit,
              )
            : result.candidates.slice(0, limit),
        }));
      } else {
        setError(result.error);
        setErrorSection(section);
        setCreditError(isCreditError(result));
      }
      return { ...result, section };
    },
    [genOptions],
  );

  const stampGeneratedVisual = useCallback(
    (visual: Visual) => stampSourceText(visual, sourceTextRef.current),
    [],
  );

  return {
    status,
    error,
    errorSection,
    creditError,
    activeGenerationSection,
    generatedVisualsBySection,
    genOptions,
    setGenOptions,
    setGeneratedVisualsBySection,
    generate,
    resetGeneration,
    stampGeneratedVisual,
  };
}
