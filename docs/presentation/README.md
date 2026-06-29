# Presentation Architecture

**Status:** Current  
**Last updated:** 2026-06-27

These documents describe the runtime presentation layer: the slide editor UI,
stage interactions, present mode, and export pipeline. They sit between the
persisted deck contract and the React components that render/edit slides.

| Document                                                                   | Scope                                                                                    |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [assets.md](assets.md)                                                     | Slide image upload, storage, protected serving, deck references, and cleanup.            |
| [theme-packages.md](theme-packages.md)                                     | Theme package catalog, apply behavior, template identity, and master boundaries.         |
| [package-template-generation-plan.md](package-template-generation-plan.md) | Planned package-template AI deck generation, semantic templates, and table element work. |
| [slide-editor.md](slide-editor.md)                                         | Slide editor runtime, stage/inspector boundaries, autosave, source links, and presence.  |
| [slide-stage-interactions.md](slide-stage-interactions.md)                 | Stage hit-testing, preselection, selection, drag, edit, connector, and overlap behavior. |
| [rendering-and-export.md](rendering-and-export.md)                         | Shared slide rendering, present/public viewers, export specs, and preflight diagnostics. |

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
