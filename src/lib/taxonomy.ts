import { TAG_NAME_MAX_LENGTH } from "@/lib/limits/document";
import { slugify } from "@/lib/slug";

export { TAG_NAME_MAX_LENGTH };

const TAG_SLUG_FALLBACK = "tag";
export const MAX_TAG_SLUG_COLLISION_ATTEMPTS = 25;

export function normalizeTagName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, TAG_NAME_MAX_LENGTH).trim();
}

export function deriveTagSlug(name: string): string {
  return slugify(name) || TAG_SLUG_FALLBACK;
}

export function tagSlugCandidate(
  baseSlug: string,
  attemptIndex: number,
): string {
  if (attemptIndex < 0) {
    throw new Error("Tag slug attempt index must be non-negative.");
  }
  return attemptIndex === 0 ? baseSlug : `${baseSlug}-${attemptIndex + 1}`;
}

export function tagSlugCandidates(
  baseSlug: string,
  maxAttempts = MAX_TAG_SLUG_COLLISION_ATTEMPTS,
): string[] {
  const safeAttempts =
    Number.isFinite(maxAttempts) && maxAttempts > 0
      ? Math.floor(maxAttempts)
      : 0;
  return Array.from({ length: safeAttempts }, (_, index) =>
    tagSlugCandidate(baseSlug, index),
  );
}

export function firstAvailableTagSlug(
  baseSlug: string,
  usedSlugs: ReadonlySet<string>,
  maxAttempts = MAX_TAG_SLUG_COLLISION_ATTEMPTS,
): string | null {
  for (const candidate of tagSlugCandidates(baseSlug, maxAttempts)) {
    if (!usedSlugs.has(candidate)) return candidate;
  }
  return null;
}
