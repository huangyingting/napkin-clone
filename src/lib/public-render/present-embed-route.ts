import type { ResolvePublicRenderInput } from "./resolver-core";

export function buildPresentEmbedRenderInput(
  shareId: string,
): ResolvePublicRenderInput {
  return {
    params: { shareId },
    mode: "embed",
    projection: "presentation",
  };
}
