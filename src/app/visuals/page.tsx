import type { Metadata } from "next";

import { VisualRenderer } from "@/components/visual/visual-renderer";
import { FIXTURE_LIST } from "@/lib/visual/fixtures";
import type { VisualKind } from "@/lib/visual/schema";

export const metadata: Metadata = {
  title: "Visual gallery — TextIQ",
  description:
    "Sample renderings of every visual type the engine supports: flowchart, mind map, list/scene, chart, concept diagram, timeline, cycle, comparison, funnel, venn, pyramid, matrix, and org chart.",
};

const KIND_LABEL: Record<VisualKind, string> = {
  flowchart: "Flowchart",
  mindmap: "Mind map",
  list: "List / scene",
  chart: "Chart",
  concept: "Concept diagram",
  timeline: "Timeline",
  cycle: "Cycle",
  comparison: "Comparison",
  funnel: "Funnel",
  venn: "Venn diagram",
  pyramid: "Pyramid",
  matrix: "Matrix",
  orgchart: "Org chart",
};

export default function VisualGalleryPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <header className="mb-10 flex flex-col gap-3">
        <span className="w-fit rounded-full border border-ds-border-subtle bg-ds-surface-sunken px-3 py-1 text-xs font-medium text-ds-text-secondary">
          Renderer preview
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-ds-text-primary sm:text-4xl">
          Visual gallery
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ds-text-secondary">
          Each card is a sample fixture rendered straight from the typed visual
          schema (nodes + edges + style) by the SVG renderer. The engine
          supports thirteen visual types.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {FIXTURE_LIST.map((visual) => (
          <section
            key={visual.type}
            aria-label={KIND_LABEL[visual.type]}
            data-visual-type={visual.type}
            className="flex flex-col gap-4 rounded-2xl border border-ds-border-subtle bg-ds-surface-raised p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold tracking-tight text-ds-text-primary">
                {visual.title ?? KIND_LABEL[visual.type]}
              </h2>
              <span className="rounded-full bg-ds-surface-sunken px-2.5 py-1 text-xs font-medium text-ds-text-secondary">
                {KIND_LABEL[visual.type]}
              </span>
            </div>
            <div className="overflow-hidden rounded-xl border border-ds-border-subtle bg-ds-surface-raised">
              <VisualRenderer visual={visual} className="h-auto w-full" />
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
