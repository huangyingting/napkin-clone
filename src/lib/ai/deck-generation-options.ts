import { GENERATED_DECK_MAX_SLIDES } from "@/lib/limits";

export const MAX_DECK_SLIDES = GENERATED_DECK_MAX_SLIDES;

export interface DeckVisualInventoryItem {
  id: string;
  title: string;
  type: string;
  summary: string;
}

export interface DeckGenerationOptions {
  length?: "short" | "medium" | "long";
  tone?: string;
  audience?: string;
  mode?: "faithful" | "presentationRewrite";
}
