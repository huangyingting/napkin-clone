import type { DeckV7 } from "../schema";
import { resolveDeckAssetSource } from "../deck-asset-source";
import type { ExportDeckSpec } from "../export-spec";

export function resolveExportSpecAssetSources(
  deck: DeckV7,
  exportSpec: ExportDeckSpec,
): ExportDeckSpec {
  return {
    ...exportSpec,
    slides: exportSpec.slides.map((slide) => ({
      ...slide,
      operations: slide.operations.map((operation) => {
        if (operation.type === "image") {
          return {
            ...operation,
            assetId:
              resolveDeckAssetSource(deck, operation.assetId) ??
              operation.assetId,
          };
        }
        if (operation.type === "visual" && operation.assetId) {
          const assetSource = resolveDeckAssetSource(deck, operation.assetId);
          const visualAsset = deck.assets.visuals?.[operation.assetId];
          const { assetId: originalAssetId, ...rest } = operation;
          void originalAssetId;
          return {
            ...rest,
            ...(assetSource ? { assetId: assetSource } : {}),
            ...(operation.visualId === undefined && visualAsset?.visualId
              ? { visualId: visualAsset.visualId }
              : {}),
            ...(operation.alt === undefined && visualAsset?.alt
              ? { alt: visualAsset.alt }
              : {}),
          };
        }
        return operation;
      }),
    })),
  };
}
