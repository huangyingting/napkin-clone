/** Editing capability data for each visual kind. */

import type { VisualKind } from "@/lib/visual/schema";
import type { KindEditingCapabilities } from "./registry-types";

/** Full graph-editing: all operations available. */
const FULL_GRAPH_EDITING: KindEditingCapabilities = {
  nodeAddable: true,
  nodeDeletable: true,
  edgeAddable: true,
  edgeDeletable: true,
  edgeReconnectable: true,
  nodeDuplicatable: true /* node:coverage disable */,
  autoLayoutSupported: true,
}; /* node:coverage enable */

/** Node-only editing: nodes can be added/removed but edges are managed by the renderer. */
const NODE_ONLY_EDITING: KindEditingCapabilities = {
  nodeAddable: true,
  nodeDeletable: true,
  edgeAddable: false,
  edgeDeletable: false,
  edgeReconnectable: false,
  nodeDuplicatable: true,
  autoLayoutSupported: false,
};

/** Read-only: structural editing — all operations disabled. Kept for future use by read-only kinds. */
export const READ_ONLY_EDITING: KindEditingCapabilities = {
  nodeAddable: false,
  nodeDeletable: false,
  edgeAddable: false,
  edgeDeletable: false,
  edgeReconnectable: false,
  nodeDuplicatable: false,
  autoLayoutSupported: false,
};

export const KIND_EDITING_CAPABILITIES = {
  flowchart: FULL_GRAPH_EDITING,
  mindmap: FULL_GRAPH_EDITING,
  list: NODE_ONLY_EDITING,
  chart: NODE_ONLY_EDITING,
  concept: FULL_GRAPH_EDITING,
  timeline: NODE_ONLY_EDITING,
  cycle: NODE_ONLY_EDITING,
  comparison: NODE_ONLY_EDITING,
  funnel: NODE_ONLY_EDITING,
  venn: {
    nodeAddable: true,
    nodeDeletable: true,
    edgeAddable: false,
    edgeDeletable: false,
    edgeReconnectable: false,
    nodeDuplicatable: false,
    autoLayoutSupported: false,
  },
  pyramid: NODE_ONLY_EDITING,
  matrix: NODE_ONLY_EDITING,
  orgchart: FULL_GRAPH_EDITING,
} satisfies Record<VisualKind, KindEditingCapabilities>;
