# Presentation Architecture

**Status:** Current  
**Last updated:** 2026-06-23

These documents describe the runtime presentation layer: the slide editor UI,
stage interactions, present mode, and export pipeline. They sit between the
persisted deck contract and the React components that render/edit slides.

| Document                                           | Scope                                                                                    |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [assets.md](assets.md)                             | Slide image upload, storage, protected serving, deck references, and cleanup.            |
| [slide-editor.md](slide-editor.md)                 | Slide editor runtime, stage/inspector boundaries, autosave, source links, and presence.  |
| [rendering-and-export.md](rendering-and-export.md) | Shared slide rendering, present/public viewers, export specs, and preflight diagnostics. |

## Related Contracts

- [../data-model/deck.md](../data-model/deck.md) for the persisted deck JSON
  shape.
- [../editor/theme-layout.md](../editor/theme-layout.md) for style cascade and
  master/layout resolution.
- [../commands/command-envelope.md](../commands/command-envelope.md) for
  serializable command metadata.
- [../security/access-and-sharing.md](../security/access-and-sharing.md) for
  public route and protected asset access policy.

## Boundaries

- Presentation components consume current `Slide.elements[]` directly.
- The editor owns interactions and deck mutations; render/export code stays
  read-only.
- Export code is split into pure spec builders and browser/PPTX appliers.
