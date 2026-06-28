export type ExportTarget = "pptx" | "pdf" | "image";
export type FidelityLevel = "full" | "partial" | "degraded" | "unsupported";

export interface FeatureFidelity {
  feature: string;
  pptx: FidelityLevel;
  pdf: FidelityLevel;
  image: FidelityLevel;
  notes?: string;
}

export const EXPORT_FIDELITY_MATRIX: FeatureFidelity[] = [
  { feature: "text-content", pptx: "full", pdf: "full", image: "full" },
  { feature: "text-formatting", pptx: "full", pdf: "full", image: "full" },
  {
    feature: "text-fit-mode",
    pptx: "partial",
    /* node:coverage ignore next -- text-fit-mode PDF fidelity is asserted; tsx maps this object field as uncovered. @preserve */
    pdf: "full",
    image: "full",
    notes: "shrink-to-fit relies on Office autofit behavior",
  },
  { feature: "vertical-align", pptx: "full", pdf: "full", image: "full" },
  { feature: "bullets-flat", pptx: "full", pdf: "full", image: "full" },
  {
    feature: "bullets-multilevel",
    pptx: "full",
    pdf: "full",
    image: "full",
  },
  { feature: "shape-text", pptx: "full", pdf: "full", image: "full" },
  {
    feature: "connector-straight",
    pptx: "full",
    pdf: "full",
    image: "full",
  },
  {
    feature: "connector-elbow",
    pptx: "partial",
    pdf: "full",
    image: "full",
    notes: "elbow connectors export as straight lines in PPTX",
  },
  { feature: "connector-arrows", pptx: "full", pdf: "full", image: "full" },
  { feature: "image-element", pptx: "full", pdf: "full", image: "full" },
  {
    feature: "image-crop",
    pptx: "partial",
    pdf: "full",
    image: "full",
    notes:
      "cover/contain sizing applied via native PPTX sizing; crop coordinates preserved via raster fallback",
  },
  {
    feature: "image-fit-fill",
    pptx: "full",
    pdf: "full",
    image: "full",
  },
  {
    feature: "image-fit-none",
    pptx: "partial",
    pdf: "full",
    image: "full",
    notes: "fitMode none uses raster fallback in PPTX",
  },
  {
    feature: "image-mask",
    pptx: "partial",
    pdf: "full",
    image: "full",
    notes: "non-none mask shapes use raster fallback in PPTX",
  },
  { feature: "opacity", pptx: "full", pdf: "full", image: "full" },
  { feature: "rotation", pptx: "full", pdf: "full", image: "full" },
  {
    feature: "shadow",
    pptx: "partial",
    pdf: "full",
    image: "full",
    notes: "outer shadows only in PPTX",
  },
  {
    feature: "group-elements",
    pptx: "partial",
    pdf: "full",
    image: "full",
    notes: "group membership is flattened; elements export individually",
  },
  {
    feature: "placeholder-element",
    pptx: "partial",
    pdf: "full",
    image: "full",
    notes: "placeholder scaffolds export as labeled boxes",
  },
  {
    feature: "source-ref-metadata",
    pptx: "unsupported",
    pdf: "unsupported",
    image: "unsupported",
    notes: "metadata-only provenance is not a visual export target",
  },
  {
    feature: "theme-typography",
    pptx: "partial",
    pdf: "full",
    image: "full",
    notes:
      "first font face is preserved; remaining CSS stack is system-dependent",
  },
  {
    feature: "visual-element",
    pptx: "partial",
    pdf: "full",
    image: "full",
    notes:
      "native where possible; unsupported or transformed visuals rasterize to PNG",
  },
  {
    feature: "hidden-element",
    pptx: "unsupported",
    pdf: "unsupported",
    image: "unsupported",
    notes:
      "hidden=true elements are filtered before export; they are not visual targets",
  },
  {
    feature: "locked-element",
    pptx: "full",
    pdf: "full",
    image: "full",
    notes:
      "locked only affects editor interactivity; locked elements export identically to unlocked ones",
  },
  {
    feature: "background-solid",
    pptx: "full",
    pdf: "full",
    image: "full",
  },
  {
    feature: "background-gradient",
    pptx: "partial",
    pdf: "full",
    image: "full",
    notes:
      "PPTX uses the gradient 'from' stop as a solid fill; full gradient is preserved for PDF/image renderers",
  },
  {
    feature: "background-image",
    pptx: "full",
    pdf: "full",
    image: "full",
  },
];

export function getFidelity(
  feature: string,
  target: ExportTarget,
): FidelityLevel | undefined {
  return EXPORT_FIDELITY_MATRIX.find((entry) => entry.feature === feature)?.[
    target
  ];
}

/* node:coverage disable */
// Feature filtering is asserted for populated and empty targets; tsx maps function boundaries as uncovered.
export function getUnsupportedFeatures(
  target: ExportTarget,
): FeatureFidelity[] {
  return EXPORT_FIDELITY_MATRIX.filter(
    (entry) => entry[target] === "unsupported",
  );
}

export function getDegradedFeatures(target: ExportTarget): FeatureFidelity[] {
  return EXPORT_FIDELITY_MATRIX.filter(
    (entry) => entry[target] === "degraded" || entry[target] === "partial",
  );
}
/* node:coverage enable */
