/**
 * Transitional import-graph exceptions.
 *
 * Each entry must carry a reason so remaining exceptions are visible in CI and
 * easy to retire as modules are split.
 */

export const allowedSccs = [
  // Keep sorted path signatures exact; the checker prints the signature for new SCCs.
];

export const allowedExportStars = [
  // Keep importer/specifier pairs exact; export-star barrels should be retired.
];

export const allowedInternalFacadeImports = [
  {
    file: "src/lib/commands/visual-command-adapter.ts",
    facade: "src/lib/commands/command-envelope.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/brand-deck-theme-adapter.ts",
    facade: "src/lib/presentation/deck-theme-tokens.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/brand-deck-theme-adapter.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/canvas-a11y.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/canvas-helpers.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/canvas-keyboard-connector.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/connector-geometry.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/connector-lifecycle.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/deck-diff.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/deck-hash.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/deck-layout-assign.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/deck-merge.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/deck-mutation-arrangement.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/deck-mutation-deck-settings.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/deck-mutation-elements.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/deck-mutation-layers.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/deck-mutation-layout.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/deck-mutation-shared.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/deck-mutation-slide-style.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/deck-mutation-slides.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/deck-mutation-template.ts",
    facade: "src/lib/presentation/deck-theme-tokens.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/deck-mutation-template.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/deck-schema.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/deck-validation/core.ts",
    facade: "src/lib/presentation/deck-theme-tokens.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/deck-validation/core.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/deck-validation/elements.ts",
    facade: "src/lib/presentation/deck-theme-tokens.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/deck-validation/elements.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/deck-validation/layouts.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/deck-validation/media.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/deck-validation/shared.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/deck-validation/source-refs.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/deck-validation/theme.ts",
    facade: "src/lib/presentation/deck-theme-tokens.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/deck-validation/theme.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/document-insertable.ts",
    facade: "src/lib/presentation/deck-theme-tokens.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/document-insertable.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/element-accessible-name.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/element-align.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/element-arrange.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/element-snap.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/fresh-deck.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/image-element.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/infer-theme.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/layout-apply.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/marquee-select.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/media-hit-geometry.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/patch-autosave.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/style-export-normalizers.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/rich-text-html.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/save-status.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/selection-transform.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/slide-command-background-executor.ts",
    facade: "src/lib/presentation/deck-mutations.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/slide-command-background-executor.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/slide-command-contracts.ts",
    facade: "src/lib/presentation/deck-mutations.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/slide-command-contracts.ts",
    facade: "src/lib/presentation/deck-theme-tokens.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/slide-command-contracts.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/slide-command-deck-theme-executor.ts",
    facade: "src/lib/presentation/deck-mutations.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/slide-command-deck-theme-executor.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/slide-command-element-executor.ts",
    facade: "src/lib/presentation/deck-mutations.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/slide-command-element-executor.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/slide-command-executor-helpers.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/slide-command-layout-executor.ts",
    facade: "src/lib/presentation/deck-mutations.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/slide-command-layout-executor.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/slide-command-slide-executor.ts",
    facade: "src/lib/presentation/deck-mutations.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/slide-command-slide-executor.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/slide-command-source-ref-executor.ts",
    facade: "src/lib/presentation/deck-mutations.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/slide-command-source-ref-executor.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/slide-commands.ts",
    facade: "src/lib/presentation/deck-mutations.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/slide-commands.ts",
    facade: "src/lib/presentation/deck-theme-tokens.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/slide-commands.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/slide-comment-anchors.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/slide-selection.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/slide-templates.ts",
    facade: "src/lib/presentation/deck-theme-tokens.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/slide-templates.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/slide-title.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/source-link-staleness.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/stage-hit-test.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/stage-interaction.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/stage-resize.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/stage-select-under.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/stage-targeting.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/strip-orphans.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/style-cascade-layers.ts",
    facade: "src/lib/presentation/deck-theme-tokens.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/style-cascade-layers.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/style-cascade-text.ts",
    facade: "src/lib/presentation/deck-theme-tokens.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/style-cascade-text.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/text-element-fit.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/text-hit-geometry.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/text-style.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/theme-preset-store.ts",
    facade: "src/lib/presentation/deck-theme-tokens.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/use-deck-history.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
  {
    file: "src/lib/presentation/use-image-upload.ts",
    facade: "src/lib/presentation/deck.ts",
    reason:
      "Deferred broad same-domain facade migration; current N11 changes retired cycles and star barrels without changing deck/editor behavior.",
  },
];

export const facadeRules = [
  {
    facade: "src/lib/commands/command-envelope.ts",
    domainRoot: "src/lib/commands",
    publicConsumers: ["src/lib/commands/command-envelope.test.ts"],
  },
  {
    facade: "src/lib/comments/index.ts",
    domainRoot: "src/lib/comments",
    publicConsumers: ["src/lib/comments/service.test.ts"],
  },
  {
    facade: "src/lib/limits/index.ts",
    domainRoot: "src/lib/limits",
    publicConsumers: ["src/lib/limits/limits.test.ts"],
  },
  {
    facade: "src/lib/presentation/deck.ts",
    domainRoot: "src/lib/presentation",
    publicConsumers: ["src/lib/presentation/deck.test.ts"],
  },
  {
    facade: "src/lib/presentation/deck-mutations.ts",
    domainRoot: "src/lib/presentation",
    publicConsumers: ["src/lib/presentation/deck-mutations.test.ts"],
  },
  {
    facade: "src/lib/presentation/deck-theme-tokens.ts",
    domainRoot: "src/lib/presentation",
    publicConsumers: ["src/lib/presentation/deck-theme-tokens.test.ts"],
  },
];
