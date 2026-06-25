# Editor Architecture

**Status:** Current  
**Last updated:** 2026-06-23

These documents describe the interactive editor surfaces and the slide styling
architecture used by those surfaces.

| Document                                                 | Scope                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [comments-and-anchors.md](comments-and-anchors.md)       | Comment threads, text/visual anchors, slide anchors, and lifecycle behavior.               |
| [lexical-editor.md](lexical-editor.md)                   | Lexical editor selection model, tool registry, visual lifecycle, and deck autosave UX.     |
| [theme-layout.md](theme-layout.md)                       | Slide token cascade, masters, layouts, and style override resolution.                      |
| [deck-template-authoring.md](deck-template-authoring.md) | Global deck template contract, semantic roles, reset-to-inherited, and authoring workflow. |

## Related Contracts

- [../data-model/deck.md](../data-model/deck.md) for persisted deck shape.
- [../data-model/visual-mirror.md](../data-model/visual-mirror.md) for visual persistence.
- [../presentation/slide-editor.md](../presentation/slide-editor.md) for the
  slide editor runtime.
- [../presentation/rendering-and-export.md](../presentation/rendering-and-export.md)
  for present mode and export behavior.
