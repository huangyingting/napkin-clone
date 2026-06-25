import { requiredSearchParam } from "@/lib/api/route-adapters";

export function parseCollabAuthorizeRoom(url: string): string | null {
  return requiredSearchParam(url, "room");
}
