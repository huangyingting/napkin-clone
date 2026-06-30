# Presentation Architecture

**Status:** Current  
**Last updated:** 2026-06-29

These documents describe the runtime presentation layer: the slide editor UI,
stage interactions, present mode, and export pipeline. They sit between the
persisted deck contract and the React components that render/edit slides.

| Document                                                                         | Scope                                                                                                   |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [assets.md](assets.md)                                                           | Slide image upload, storage, protected serving, deck references, and cleanup.                           |
| [theme-packages.md](theme-packages.md)                                           | Theme package catalog, apply behavior, template identity, and master boundaries.                        |
| [semantic-slide-design-system.md](semantic-slide-design-system.md)               | Implemented vNext semantic slide schema, theme packages, semantic templates, AI generation, and export. |
| [v7-slide-editor-implementation-plan.md](v7-slide-editor-implementation-plan.md) | Concrete migration plan for making the v7 slide editor production-usable.                               |
| [v7-slide-editor-github-issues.md](v7-slide-editor-github-issues.md)             | Ordered epic and GitHub issue backlog for the v7 legacy replacement release.                            |
| [package-template-generation-plan.md](package-template-generation-plan.md)       | Planned package-template AI deck generation, semantic templates, and table element work.                |
| [slide-editor.md](slide-editor.md)                                               | Slide editor runtime, stage/inspector boundaries, autosave, source links, and presence.                 |
| [slide-stage-interactions.md](slide-stage-interactions.md)                       | Stage hit-testing, preselection, selection, drag, edit, connector, and overlap behavior.                |
| [rendering-and-export.md](rendering-and-export.md)                               | Shared slide rendering, present/public viewers, export specs, and preflight diagnostics.                |

## VNext UI Design

The detailed UI design for the v7/vNext migration lives in this subsystem:

- [slide-editor-ui-v7.md](slide-editor-ui-v7.md) — V7 slide editor UI design spec (top toolbar, context toolbar, right inspector, bottom filmstrip, inline editing, component inventory, a11y, flows, verification).

## Related Contracts

- [../data-model/deck.md](../data-model/deck.md) for the persisted deck JSON
  shape.
- [../editor/theme-layout.md](../editor/theme-layout.md) for style cascade and
  master/layout resolution.
- [../commands/command-envelope.md](../commands/command-envelope.md) for
  serializable command metadata.
- [../public-render/README.md](../public-render/README.md) for public
  share/embed/present/asset resolution.
- [../security/access-and-sharing.md](../security/access-and-sharing.md) for
  public route and protected asset access policy.
- [../visual/README.md](../visual/README.md) for visual kind registry and
  renderer/export capabilities.

## Boundaries

- Presentation components consume current `Slide.elements[]` directly.
- The editor owns interactions and deck mutations; render/export code stays
  read-only.
- Export code is split into pure spec builders and browser/PPTX appliers.
