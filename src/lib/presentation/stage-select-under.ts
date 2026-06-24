import type { SlideElement } from "./deck";
import type { HitTestCandidate } from "./stage-hit-test";
import {
  isStageTargetSelected,
  resolveStageHitTarget,
  type StageInteractionTarget,
} from "./stage-targeting";

export interface SelectUnderOptions {
  groupEditingId?: string | null;
  selectedElementIds: ReadonlySet<string>;
}

function targetKey(target: StageInteractionTarget): string {
  return target.kind === "group"
    ? `group:${target.groupId}`
    : `element:${target.element.id}`;
}

export function selectUnderTargets(
  hits: readonly HitTestCandidate[],
  elements: readonly SlideElement[],
  options: Pick<SelectUnderOptions, "groupEditingId"> = {},
): StageInteractionTarget[] {
  const seen = new Set<string>();
  const targets: StageInteractionTarget[] = [];
  for (const hit of hits) {
    const target = resolveStageHitTarget(hit, elements, {
      groupEditingId: options.groupEditingId,
    });
    if (!target) continue;
    const key = targetKey(target);
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push(target);
  }
  return targets;
}

export function nextSelectUnderTarget(
  hits: readonly HitTestCandidate[],
  elements: readonly SlideElement[],
  options: SelectUnderOptions,
): StageInteractionTarget | null {
  const targets = selectUnderTargets(hits, elements, options);
  if (targets.length === 0) return null;
  const selectedIndex = targets.findIndex((target) =>
    isStageTargetSelected(target, options.selectedElementIds),
  );
  return targets[(selectedIndex + 1) % targets.length] ?? null;
}
