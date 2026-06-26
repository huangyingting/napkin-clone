import { FIXTURES } from "@/lib/visual/fixtures";
import type { Visual, VisualKind } from "@/lib/visual/schema";

/** A representative source visual per kind (richer fixtures, not blank seeds). */
export function sourceFor(kind: VisualKind): Visual {
  return FIXTURES[kind];
}
