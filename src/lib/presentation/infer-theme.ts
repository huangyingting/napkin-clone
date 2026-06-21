/**
 * Pure helper that derives a deck's starting {@link DeckTheme} from the visual
 * blocks in a document's block list.
 *
 * The six deck themes mirror the visual style-theme names, so the mapping is
 * direct: a visual whose colors match the `indigo` / `ocean` / `forest` /
 * `sunset` / `grape` STYLE_THEME contributes one vote to the same-named deck
 * theme. The most-frequently-used visual theme becomes the deck theme.
 *
 * `default` is intentionally NOT inferred — it stays reserved for embed/dark
 * contexts and remains selectable from the top-bar theme picker. When no visual
 * matches an inferable theme (no visuals, or all custom-colored), the deck falls
 * back to the brand-aligned `indigo` rather than the bleak `default`.
 *
 * Pure and DOM-free — fully testable under `node --test`.
 */

import type { DeckTheme } from "@/lib/presentation/deck";
import type { DocumentBlock } from "@/lib/visual/document-export";
import { isThemeActive } from "@/lib/visual/transforms";

/**
 * Deck themes that mirror a visual STYLE_THEME of the same id, listed in
 * canonical tie-break order. When two themes are used equally often, the one
 * earlier in this list wins, keeping inference deterministic. `default` is
 * excluded because it is never inferred.
 */
const INFERABLE_THEMES: readonly DeckTheme[] = [
  "indigo",
  "ocean",
  "forest",
  "sunset",
  "grape",
];

/** Brand-aligned theme used when no dominant visual theme can be inferred. */
const FALLBACK_THEME: DeckTheme = "indigo";

/**
 * Inspects the visual blocks in `blocks` and returns the most-frequently-used
 * visual theme as a {@link DeckTheme}. Ties are broken deterministically by
 * {@link INFERABLE_THEMES} order. Returns {@link FALLBACK_THEME} when no visual
 * matches an inferable theme.
 */
export function inferDeckTheme(blocks: DocumentBlock[]): DeckTheme {
  const counts = new Map<DeckTheme, number>();

  for (const block of blocks) {
    if (block.kind !== "visual") continue;
    for (const theme of INFERABLE_THEMES) {
      if (isThemeActive(block.visual, theme)) {
        counts.set(theme, (counts.get(theme) ?? 0) + 1);
        break;
      }
    }
  }

  let best: DeckTheme = FALLBACK_THEME;
  let bestCount = 0;
  // Iterate in canonical order so the first theme reaching the max count wins,
  // giving deterministic tie-breaking.
  for (const theme of INFERABLE_THEMES) {
    const count = counts.get(theme) ?? 0;
    if (count > bestCount) {
      best = theme;
      bestCount = count;
    }
  }

  return bestCount > 0 ? best : FALLBACK_THEME;
}
