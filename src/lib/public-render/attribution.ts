import { shouldShowAttribution } from "@/lib/billing/attribution";

export interface PublicOwnerAttributionInput {
  name: string | null;
  plan: string;
}

export interface PublicAttribution {
  ownerName: string;
  showAttribution: boolean;
}

export function buildPublicAttribution(
  owner: PublicOwnerAttributionInput,
): PublicAttribution {
  return {
    ownerName: owner.name || "Document owner",
    showAttribution: shouldShowAttribution(owner.plan),
  };
}
