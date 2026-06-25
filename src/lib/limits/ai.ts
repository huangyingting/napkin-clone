import type { LimitDefinition } from "@/lib/limits/budgets";

export const AI_GENERATION_INPUT_MAX_CHARS = 10_000;
export const GENERATED_DECK_MAX_SLIDES = 40;
export const DECK_OUTPUT_TOKEN_BUDGET = 16_000;

export const AI_INPUT_LIMIT: LimitDefinition = {
  id: "ai.visual.input.chars",
  description: "Maximum text accepted by visual generation before an LLM call.",
  value: AI_GENERATION_INPUT_MAX_CHARS,
  unit: "chars",
  enforcement: "enforced",
  diagnostic: { scope: "api.generate", metric: "aiInputChars" },
  source: "src/lib/ai/generate.ts",
};

export const AI_DECK_INPUT_LIMIT: LimitDefinition = {
  id: "ai.deck.input.chars",
  description:
    "Maximum outline accepted by deck generation before an LLM call.",
  value: AI_GENERATION_INPUT_MAX_CHARS,
  unit: "chars",
  enforcement: "enforced",
  diagnostic: { scope: "api.generate-deck", metric: "aiDeckInputChars" },
  source: "src/lib/ai/generate-deck.ts",
};

export const GENERATED_DECK_SLIDE_LIMIT: LimitDefinition = {
  id: "ai.deck.output.slides",
  description: "Maximum slides kept from an AI-generated deck.",
  value: GENERATED_DECK_MAX_SLIDES,
  unit: "count",
  enforcement: "enforced",
  diagnostic: { scope: "ai.generate-deck", metric: "generatedDeckSlides" },
  source: "src/lib/ai/generate-deck.ts",
};

export const DECK_OUTPUT_TOKEN_LIMIT: LimitDefinition = {
  id: "ai.deck.output.tokens",
  description: "Soft output token budget passed to deck generation.",
  value: DECK_OUTPUT_TOKEN_BUDGET,
  unit: "count",
  enforcement: "warning",
  diagnostic: { scope: "api.generate-deck", metric: "deckOutputTokens" },
  source: "src/lib/ai/generate-deck.ts",
};

export function formatVisualInputTooLongError(length: number): string {
  return `Input text is too long (${length} characters). The maximum is ${AI_GENERATION_INPUT_MAX_CHARS}.`;
}

export function formatDeckInputTooLongError(length: number): string {
  return `Document outline is too long (${length} characters). The maximum is ${AI_GENERATION_INPUT_MAX_CHARS}.`;
}
