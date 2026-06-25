import { shouldShowAttribution } from "@/lib/billing/attribution";

export interface PublicOwnerAttributionInput {
  name: string | null;
  email: string;
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
    ownerName: owner.name || owner.email.split("@")[0],
    showAttribution: shouldShowAttribution(owner.plan),
  };
}
