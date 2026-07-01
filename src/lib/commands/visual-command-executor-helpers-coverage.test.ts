import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addEdge,
  duplicateNode,
  reconnectEdge,
} from "@/lib/commands/visual-command-executor-helpers";
import { createBlankVisual } from "@/lib/visual/blank";

function assertSuccess<T extends { next: unknown }>(
  result: T | { error: string },
): asserts result is T {
  assert.equal("error" in result, false);
}

describe("visual command executor graph helper coverage", () => {
  it("adds edges with optional fields preserved", () => {
    const visual = createBlankVisual("flowchart");
    const result = addEdge(visual, {
      id: "edge-custom",
      from: "n1",
      to: "n3",
      label: "Skip",
      directed: true,
      lineStyle: "dashed",
      lineWidth: 2,
      arrowStyle: "filled",
    });

    assertSuccess(result);
    assert.equal(result.edgeId, "edge-custom");
    assert.deepEqual(result.next.edges.at(-1), {
      id: "edge-custom",
      from: "n1",
      to: "n3",
      label: "Skip",
      directed: true,
      lineStyle: "dashed",
      lineWidth: 2,
      arrowStyle: "filled",
    });
  });

  it("reconnects one endpoint while keeping the omitted endpoint", () => {
    const visual = createBlankVisual("flowchart");
    const result = reconnectEdge(visual, "e1", undefined, "n3");

    assertSuccess(result);
    assert.deepEqual(
      result.next.edges.find((edge) => edge.id === "e1"),
      { id: "e1", from: "n1", to: "n3" },
    );
  });

  it("rejects node duplication for kinds that disable it", () => {
    const visual = createBlankVisual("venn");
    assert.deepEqual(duplicateNode(visual, "n1"), {
      error: 'Kind "venn" does not support node duplication.',
    });
  });
});
