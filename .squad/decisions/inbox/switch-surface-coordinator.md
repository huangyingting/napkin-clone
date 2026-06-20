### 2026-06-20T03:55:00Z: Right-Surface Coordinator — mutual exclusion + z-index discipline

**By:** Switch (via Squad)

**What:**
Introduced a `RightSurfaceContext` / `RightSurfaceProvider` at the editor root
(placed inside `LexicalComposer` > `VisualAnchorProvider`), backed by a
DOM-free pure reducer in `src/lib/right-surface-coordinator.ts`.

- **Mutual exclusion (Rule A + B):** When `SlideEditorButton` opens the
  `SlideEditor` panel (z-40, fixed right), it calls `openSlideEditor()` on
  the coordinator. `VisualCard` reads `suppressFloatPopover` and suppresses
  its floating `VisualContextPopover` (z-50) for the duration. Closing the
  slide editor calls `closeSlideEditor()` and restores the float.

- **UX decision — re-select while slide editor is open:** At `lg+` viewport
  (editing rail active), selecting a visual while the slide editor is open
  updates the docked rail's panel view (behind the slide editor overlay).
  At `< lg`, the float is suppressed entirely — no controls render — because
  the slide editor occupies the right side. This keeps the UX clean: the slide
  editor takes priority, and visual editing is deferred until it is closed.

- **Z-index discipline:** Top-toolbar dropdowns (Share → `z-[60]`, Export →
  `z-[60]`) are now above `FloatingSurface` (z-50) and the slide editor panel
  (z-40). Comments panel is already z-50 (fixed) and was not changed.

**Why:**
The floating visual popover (z-50) was rendering on top of the slide editor
panel (z-40) whenever a visual was selected while the slide editor was open
(issue #70). The share and export dropdowns (z-10 / z-20) were clipped behind
the slide editor (z-40) and unclickable (issue #71). Trinity's architectural
direction in epic #69 called for a single coordinator context rather than
ad-hoc guards in individual components. The pure reducer approach lets the
mutual-exclusion logic be unit-tested without a browser.
