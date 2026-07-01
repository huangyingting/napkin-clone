import { buildShareSegment } from "@/lib/slug";

export function buildDocumentShareUrl(
  origin: string,
  shareId: string | null,
  slug: string | null,
): string | null {
  if (!origin || !shareId || !slug) return null;
  return `${origin}/share/${buildShareSegment(slug, shareId)}`;
}

export function toPresentShareUrl(shareUrl: string): string {
  return shareUrl.replace("/share/", "/present/");
}

export function toEmbedShareUrl(shareUrl: string): string {
  return shareUrl.replace("/share/", "/embed/");
}
