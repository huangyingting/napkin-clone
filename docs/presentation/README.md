# Presentation Architecture

**Status:** Current  
**Last updated:** 2026-06-26

These documents describe the runtime presentation layer: the slide editor UI,
stage interactions, present mode, and export pipeline. They sit between the
persisted deck contract and the React components that render/edit slides.

| Document                                                   | Scope                                                                                    |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [assets.md](assets.md)                                     | Slide image upload, storage, protected serving, deck references, and cleanup.            |
| [slide-editor.md](slide-editor.md)                         | Slide editor runtime, stage/inspector boundaries, autosave, source links, and presence.  |
| [slide-stage-interactions.md](slide-stage-interactions.md) | Stage hit-testing, preselection, selection, drag, edit, connector, and overlap behavior. |
| [rendering-and-export.md](rendering-and-export.md)         | Shared slide rendering, present/public viewers, export specs, and preflight diagnostics. |

## Design Proposals

These documents record accepted designs that are not yet fully implemented.
When implemented, fold the resulting runtime contracts back into the current
behavior documents above.

| Document                                       | Scope                                                                                  |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| [slide-fonts-design.md](slide-fonts-design.md) | Self-hosted slide fonts, `fontId` registry, editable PPTX mapping, and migration plan. |

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
