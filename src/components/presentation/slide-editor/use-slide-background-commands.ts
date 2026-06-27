"use client";

import { useCallback } from "react";

import type { Deck, DeckTheme } from "@/lib/presentation/deck";
import {
  commitCommand,
  type DeckPatch,
} from "@/lib/presentation/slide-commands";
import type { PresentationThemeOverridesPatch } from "@/lib/presentation/deck-mutations";
import {
  bucketCount,
  bucketDurationMs,
  emitProductTelemetry,
} from "@/lib/telemetry/product";
import { appendPendingPatches } from "./use-slide-editor-commit";
import { type SlideFormat } from "@/lib/presentation/slide-format";
import {
  slideBackgroundGradientValue,
  slideBackgroundImageValue,
  slideSolidBackgroundValue,
} from "@/components/presentation/v6-deck-ui";

export type BackgroundGradient = { from: string; to: string; angle?: number };

export const SOLID_BACKGROUND_OPTIONS: {
  id: string;
  label: string;
  color: string;
}[] = [
  { id: "black", label: "Black", color: "#050505" },
  { id: "graphite", label: "Graphite", color: "#525252" },
  { id: "ash", label: "Ash", color: "#737373" },
  { id: "stone", label: "Stone", color: "#a3a3a3" },
  { id: "silver", label: "Silver", color: "#b8b8b8" },
  { id: "mist", label: "Mist", color: "#d4d4d4" },
  { id: "white", label: "White", color: "#fbfbfb" },
  { id: "vermillion", label: "Vermillion", color: "#df4038" },
  { id: "coral", label: "Coral", color: "#df625d" },
  { id: "orchid", label: "Orchid", color: "#d662b8" },
  { id: "lilac", label: "Lilac", color: "#caa2e7" },
  { id: "violet", label: "Violet", color: "#ad6ddd" },
  { id: "iris", label: "Iris", color: "#7b5cf0" },
  { id: "royal", label: "Royal", color: "#512ddc" },
  { id: "fjord", label: "Fjord", color: "#5799af" },
  { id: "sky", label: "Sky", color: "#6dbbd5" },
  { id: "aqua", label: "Aqua", color: "#8bd6d8" },
  { id: "azure", label: "Azure", color: "#6aaef0" },
  { id: "periwinkle", label: "Periwinkle", color: "#6374ee" },
  { id: "cobalt", label: "Cobalt", color: "#3455ad" },
  { id: "indigo", label: "Indigo", color: "#24139b" },
  { id: "leaf", label: "Leaf", color: "#66ba69" },
  { id: "lime", label: "Lime", color: "#9bd363" },
  { id: "sprout", label: "Sprout", color: "#cbfb6f" },
  { id: "sun", label: "Sun", color: "#f6dc62" },
  { id: "sand", label: "Sand", color: "#efbf61" },
  { id: "apricot", label: "Apricot", color: "#e99350" },
  { id: "orange", label: "Orange", color: "#e5782e" },
];

export const GRADIENT_BACKGROUND_OPTIONS: {
  id: string;
  label: string;
  gradient: BackgroundGradient;
}[] = [
  {
    id: "black-gloss",
    label: "Black gloss",
    gradient: { from: "#050505", to: "#525252", angle: 90 },
  },
  {
    id: "mono-shine",
    label: "Mono shine",
    gradient: { from: "#0b0b0b", to: "#f5f5f5", angle: 90 },
  },
  {
    id: "pearl",
    label: "Pearl",
    gradient: { from: "#a8a8a8", to: "#f7f7f7", angle: 135 },
  },
  {
    id: "lime-pop",
    label: "Lime pop",
    gradient: { from: "#8bd548", to: "#daf56d", angle: 135 },
  },
  {
    id: "gold-night",
    label: "Gold night",
    gradient: { from: "#0f0d05", to: "#99741a", angle: 90 },
  },
  {
    id: "sunset-glow",
    label: "Sunset glow",
    gradient: { from: "#7c3f96", to: "#f5d64d", angle: 90 },
  },
  {
    id: "deep-violet",
    label: "Deep violet",
    gradient: { from: "#060a36", to: "#2514a0", angle: 135 },
  },
  {
    id: "frost",
    label: "Frost",
    gradient: { from: "#d4f8de", to: "#b9c8ff", angle: 135 },
  },
  {
    id: "ember",
    label: "Ember",
    gradient: { from: "#dd3f3a", to: "#ec9a4e", angle: 135 },
  },
  {
    id: "berry",
    label: "Berry",
    gradient: { from: "#d94d59", to: "#7b5cf0", angle: 135 },
  },
  {
    id: "candy",
    label: "Candy",
    gradient: { from: "#5b73f0", to: "#d45fc4", angle: 135 },
  },
  {
    id: "cosmic",
    label: "Cosmic",
    gradient: { from: "#2f58b8", to: "#8b4fda", angle: 135 },
  },
  {
    id: "aqua-pop",
    label: "Aqua pop",
    gradient: { from: "#7a5cf2", to: "#78d5dd", angle: 135 },
  },
  {
    id: "ocean",
    label: "Ocean",
    gradient: { from: "#70ced8", to: "#3455ad", angle: 135 },
  },
  {
    id: "rainforest",
    label: "Rainforest",
    gradient: { from: "#745cf0", to: "#58b96a", angle: 135 },
  },
  {
    id: "meadow",
    label: "Meadow",
    gradient: { from: "#5e9eaf", to: "#98d45f", angle: 135 },
  },
  {
    id: "sea-lime",
    label: "Sea lime",
    gradient: { from: "#63b7d6", to: "#e8df66", angle: 135 },
  },
  {
    id: "honey",
    label: "Honey",
    gradient: { from: "#f8d35a", to: "#ee9f51", angle: 135 },
  },
  {
    id: "peach",
    label: "Peach",
    gradient: { from: "#d95faa", to: "#f2d65d", angle: 135 },
  },
  {
    id: "blush",
    label: "Blush",
    gradient: { from: "#fff2a8", to: "#e5a7f0", angle: 135 },
  },
  {
    id: "sherbet",
    label: "Sherbet",
    gradient: { from: "#7b5cf0", to: "#e99350", angle: 135 },
  },
];

export function gradientCss(gradient: BackgroundGradient): string {
  return `linear-gradient(${gradient.angle ?? 135}deg, ${gradient.from}, ${gradient.to})`;
}

export function sameGradient(
  a: BackgroundGradient | undefined,
  b: BackgroundGradient,
): boolean {
  if (!a) return false;
  return (
    a.from === b.from && a.to === b.to && (a.angle ?? 135) === (b.angle ?? 135)
  );
}

type DoCommitAndChange = (
  deck: Deck,
  cmd: Parameters<typeof commitCommand>[1],
) => void;

interface UseSlideBackgroundCommandsOptions {
  deck: Deck;
  safeSelected: number;
  pendingPatchesRef: { current: DeckPatch[] };
  onDeckChange: (deck: Deck) => void;
  doCommitAndChange: DoCommitAndChange;
  setThemeMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
}

export function useSlideBackgroundCommands({
  deck,
  safeSelected,
  pendingPatchesRef,
  onDeckChange,
  doCommitAndChange,
  setThemeMenuOpen,
}: UseSlideBackgroundCommandsOptions) {
  const applyDeckSolidBackground = useCallback(
    (color: string) => {
      let nextDeck = deck;
      const patches: DeckPatch[] = [];
      for (const slide of deck.slides) {
        const commands: Parameters<typeof commitCommand>[1][] = [];
        const backgroundImage = slideBackgroundImageValue(slide);
        const backgroundGradient = slideBackgroundGradientValue(slide);
        const backgroundColor = slideSolidBackgroundValue(slide);
        if (backgroundImage !== undefined) {
          commands.push({
            type: "SET_SLIDE_BACKGROUND_ASSET",
            slideId: slide.id,
            opts: undefined,
          });
        }
        if (backgroundGradient !== undefined) {
          commands.push({
            type: "SET_SLIDE_BACKGROUND_GRADIENT",
            slideId: slide.id,
            gradient: undefined,
          });
        }
        if (backgroundColor !== color) {
          commands.push({
            type: "SET_SLIDE_BACKGROUND",
            slideId: slide.id,
            background: color,
          });
        }
        for (const command of commands) {
          const { result, patches: commandPatches } = commitCommand(
            nextDeck,
            command,
          );
          if (!result.ok) return;
          nextDeck = result.deck;
          patches.push(...commandPatches);
        }
      }
      if (patches.length > 0) {
        appendPendingPatches(pendingPatchesRef, patches);
        onDeckChange(nextDeck);
        emitProductTelemetry("product.editor.command.succeeded", {
          commandName: "apply_deck_solid_background",
          elementCountBucket: bucketCount(patches.length),
          slideCount: nextDeck.slides.length,
          surface: "slide-editor",
        });
      }
      setThemeMenuOpen(false);
    },
    [deck, onDeckChange, pendingPatchesRef, setThemeMenuOpen],
  );

  const applyDeckGradientBackground = useCallback(
    (gradient: BackgroundGradient) => {
      let nextDeck = deck;
      const patches: DeckPatch[] = [];
      for (const slide of deck.slides) {
        const commands: Parameters<typeof commitCommand>[1][] = [];
        const backgroundImage = slideBackgroundImageValue(slide);
        const backgroundGradient = slideBackgroundGradientValue(slide);
        const backgroundColor = slideSolidBackgroundValue(slide);
        if (backgroundImage !== undefined) {
          commands.push({
            type: "SET_SLIDE_BACKGROUND_ASSET",
            slideId: slide.id,
            opts: undefined,
          });
        }
        if (backgroundColor !== undefined) {
          commands.push({
            type: "SET_SLIDE_BACKGROUND",
            slideId: slide.id,
            background: undefined,
          });
        }
        if (!sameGradient(backgroundGradient, gradient)) {
          commands.push({
            type: "SET_SLIDE_BACKGROUND_GRADIENT",
            slideId: slide.id,
            gradient,
          });
        }
        for (const command of commands) {
          const { result, patches: commandPatches } = commitCommand(
            nextDeck,
            command,
          );
          if (!result.ok) return;
          nextDeck = result.deck;
          patches.push(...commandPatches);
        }
      }
      if (patches.length > 0) {
        appendPendingPatches(pendingPatchesRef, patches);
        onDeckChange(nextDeck);
        emitProductTelemetry("product.editor.command.succeeded", {
          commandName: "apply_deck_gradient_background",
          elementCountBucket: bucketCount(patches.length),
          slideCount: nextDeck.slides.length,
          surface: "slide-editor",
        });
      }
      setThemeMenuOpen(false);
    },
    [deck, onDeckChange, pendingPatchesRef, setThemeMenuOpen],
  );

  const handleBackgroundChange = useCallback(
    (color: string | undefined) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "SET_SLIDE_BACKGROUND",
        slideId,
        background: color,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleAccentChange = useCallback(
    (color: string | undefined) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "SET_SLIDE_ACCENT",
        slideId,
        accent: color,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleBackgroundGradientChange = useCallback(
    (gradient: { from: string; to: string; angle?: number } | undefined) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "SET_SLIDE_BACKGROUND_GRADIENT",
        slideId,
        gradient,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleBackgroundImageChange = useCallback(
    (image: string | undefined) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "SET_SLIDE_BACKGROUND_IMAGE",
        slideId,
        image,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleBackgroundAssetChange = useCallback(
    (opts: { url: string; assetId: string } | undefined) => {
      const slideId = deck.slides[safeSelected]?.id;
      if (!slideId) return;
      doCommitAndChange(deck, {
        type: "SET_SLIDE_BACKGROUND_ASSET",
        slideId,
        opts,
      });
    },
    [deck, doCommitAndChange, safeSelected],
  );

  const handleSlideFormatChange = useCallback(
    (slideFormat: SlideFormat) => {
      const startedAt = performance.now();
      doCommitAndChange(deck, {
        type: "SET_CANVAS_FORMAT",
        format: slideFormat,
      });
      emitProductTelemetry("product.editor.command.succeeded", {
        commandName: "set_deck_format",
        durationBucket: bucketDurationMs(performance.now() - startedAt),
        slideCount: deck.slides.length,
        surface: "slide-editor",
      });
    },
    [deck, doCommitAndChange],
  );

  const handleUpdateThemeOverrides = useCallback(
    (patch: PresentationThemeOverridesPatch) => {
      doCommitAndChange(deck, { type: "UPDATE_THEME_OVERRIDES", patch });
    },
    [deck, doCommitAndChange],
  );

  const handleResetThemeOverrides = useCallback(() => {
    doCommitAndChange(deck, {
      type: "UPDATE_THEME_OVERRIDES",
      patch: {},
      reset: true,
    });
  }, [deck, doCommitAndChange]);

  const handleApplyDeckTheme = useCallback(
    (themeId: DeckTheme) => {
      doCommitAndChange(deck, { type: "SET_PRESENTATION_THEME", themeId });
    },
    [deck, doCommitAndChange],
  );

  // Derived active background values for the UI
  const activeSolidBackground = SOLID_BACKGROUND_OPTIONS.find((option) =>
    deck.slides.every(
      (slide) =>
        slideSolidBackgroundValue(slide) === option.color &&
        slideBackgroundGradientValue(slide) === undefined &&
        slideBackgroundImageValue(slide) === undefined,
    ),
  )?.id;

  const activeGradientBackground = GRADIENT_BACKGROUND_OPTIONS.find((option) =>
    deck.slides.every(
      (slide) =>
        sameGradient(slideBackgroundGradientValue(slide), option.gradient) &&
        slideSolidBackgroundValue(slide) === undefined &&
        slideBackgroundImageValue(slide) === undefined,
    ),
  )?.id;

  return {
    applyDeckSolidBackground,
    applyDeckGradientBackground,
    handleBackgroundChange,
    handleAccentChange,
    handleBackgroundGradientChange,
    handleBackgroundImageChange,
    handleBackgroundAssetChange,
    handleSlideFormatChange,
    handleUpdateThemeOverrides,
    handleResetThemeOverrides,
    handleApplyDeckTheme,
    activeSolidBackground,
    activeGradientBackground,
  };
}
