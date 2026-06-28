import type { AspectRatioPreset } from "@/lib/visual/schema";

/**
 * Named social-media output profile. Profiles are catalog data; SVG transforms
 * consume the resolved option fields and do not know about these ids.
 */
export type SocialPreset = "square" | "portrait" | "landscape" | "story";

export type OutputProfileId = SocialPreset;

/* node:coverage ignore next 20 -- type-only interface fields are erased by tsx but still appear in source maps. */
/** Full configuration for a social output profile. */
export interface SocialPresetConfig {
  /** Preset identifier. */
  id: SocialPreset;
  /** Human-readable label shown in the UI. */
  label: string;
  /** Canonical pixel dimensions (reference; actual output depends on scale). */
  canonicalWidth: number;
  canonicalHeight: number;
  /** Aspect ratio applied when letterboxing the SVG canvas. */
  aspectRatio: Exclude<AspectRatioPreset, "auto">;
  /**
   * Safe-area padding in SVG canvas units. The content is inset from the
   * canvas edge by this many units on every side.
   */
  padding: number;
  /** Default background fill color as a CSS colour string. */
  background: string;
  /** Minimum export scale recommended for crisp output at the canonical size. */
  minScale: number;
}

export type OutputProfileConfig = SocialPresetConfig;

/**
 * All four social export profiles covering the most common social-media
 * formats. Padding values assume a typical SVG canvas width of ~800 units; they
 * produce ≈ 5–8 % breathing room on each side.
 */
export const SOCIAL_PRESET_CONFIGS: Record<SocialPreset, SocialPresetConfig> = {
  square: {
    id: "square",
    label: "Square 1:1",
    canonicalWidth: 1080,
    canonicalHeight: 1080,
    aspectRatio: "1:1",
    padding: 48,
    background: "#ffffff",
    minScale: 2,
  },
  portrait: {
    id: "portrait",
    label: "Portrait 4:5",
    canonicalWidth: 1080,
    canonicalHeight: 1350,
    aspectRatio: "4:5",
    padding: 48,
    background: "#ffffff",
    minScale: 2,
  },
  landscape: {
    id: "landscape",
    label: "Landscape 16:9",
    canonicalWidth: 1200,
    canonicalHeight: 675,
    aspectRatio: "16:9",
    padding: 36,
    background: "#ffffff",
    minScale: 2,
  } /* node:coverage disable */,
  story: {
    id: "story",
    label: "Story/Reel 9:16",
    canonicalWidth: 1080,
    canonicalHeight: 1920,
    aspectRatio: "9:16",
    padding: 64,
    background: "#000000",
    minScale: 2,
  } /* node:coverage enable */,
};

/** Ordered catalog used by dialogs and preflight summaries. */
export const OUTPUT_PROFILE_CATALOG = [
  SOCIAL_PRESET_CONFIGS.square,
  SOCIAL_PRESET_CONFIGS.portrait,
  SOCIAL_PRESET_CONFIGS.landscape,
  SOCIAL_PRESET_CONFIGS.story,
] as const satisfies readonly SocialPresetConfig[];

export const SOCIAL_PRESET_CATALOG = OUTPUT_PROFILE_CATALOG;

export function getOutputProfile(id: OutputProfileId): OutputProfileConfig {
  return SOCIAL_PRESET_CONFIGS[id];
}

export function listOutputProfiles(): readonly OutputProfileConfig[] {
  return OUTPUT_PROFILE_CATALOG;
}
