# Slide Stage Interactions

**Status:** Current design target  
**Last updated:** 2026-06-24

This document defines how the slide editor stage should choose, preview, select,
move, resize, and edit elements when many elements overlap. It is the interaction
contract for `SlideStageEditor`, not the persisted deck schema.

## Source Files

| Area                         | Source                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Stage UI/controller          | [`src/components/presentation/slide-stage-editor.tsx`](../../../src/components/presentation/slide-stage-editor.tsx) |
| Semantic hit testing         | [`src/lib/presentation/stage-hit-test.ts`](../../../src/lib/presentation/stage-hit-test.ts)                         |
| Target resolution            | [`src/lib/presentation/stage-targeting.ts`](../../../src/lib/presentation/stage-targeting.ts)                       |
| Chrome layering              | [`src/lib/presentation/stage-chrome.ts`](../../../src/lib/presentation/stage-chrome.ts)                             |
| Interaction decision helpers | [`src/lib/presentation/stage-interaction.ts`](../../../src/lib/presentation/stage-interaction.ts)                   |
| Media hit geometry           | [`src/lib/presentation/media-hit-geometry.ts`](../../../src/lib/presentation/media-hit-geometry.ts)                 |
| Text hit geometry            | [`src/lib/presentation/text-hit-geometry.ts`](../../../src/lib/presentation/text-hit-geometry.ts)                   |
| Keyboard canvas helpers      | [`src/lib/presentation/canvas-a11y.ts`](../../../src/lib/presentation/canvas-a11y.ts)                               |
| Connector geometry           | [`src/lib/presentation/connector-geometry.ts`](../../../src/lib/presentation/connector-geometry.ts)                 |
| Element fitting              | [`src/lib/presentation/text-element-fit.ts`](../../../src/lib/presentation/text-element-fit.ts)                     |

## Goals

- Hover feedback should feel Canva-like: moving the pointer over the stage shows
  the element the editor believes the user is most likely targeting.
- Selection, drag, double-click edit, and context-menu targeting should use the
  same semantic hit-test result.
- Large text/bullet frames and large background-like shapes should not make lower
  content impossible to target.
- Selected/preselected frames must remain visible even when the target element is
  behind another element.
- Direct manipulation must stay predictable: click selects, second click edits
  text, drag starts only after pointer travel crosses the drag threshold.

## Interaction State Machine

The stage should be treated as a small state machine, even though some state is
currently represented by refs and React state in `SlideStageEditor`.

| State           | Meaning                                                                | Hover preselect? | Main transitions                                                                                  |
| --------------- | ---------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| `idle`          | No selected element, no pointer gesture, no editor                     | Yes              | hover -> preselect; pointerdown on element -> `press-pending`; pointerdown empty -> marquee/click |
| `selected-idle` | One or more elements selected, but no pointer gesture                  | Yes              | hover -> preselect any target; pointerdown selected/unselected element -> `press-pending`         |
| `press-pending` | Pointer is down but movement has not exceeded the click/drag threshold | No               | pointerup -> select or edit; pointermove beyond threshold -> `moving` / `resizing` / `rotating`   |
| `moving`        | Element(s) are actively moving                                         | No               | pointermove -> update boxes; pointerup -> commit gesture                                          |
| `resizing`      | Element(s) or multi-selection bounds are actively resizing             | No               | pointermove -> update boxes/font/connector endpoint; pointerup -> commit gesture                  |
| `marquee`       | Stage background drag is drawing a selection band                      | No               | pointerup -> select intersecting boxes or clear selection                                         |
| `editing`       | Inline text editor is mounted                                          | No               | input -> text patch; click stage background -> commit/exit and clear selection                    |

Important distinction: **selected is not moving**. A selected element may remain
selected while pointer movement over other elements continues to preselect those
other elements. The stage enters moving/resizing only after pointer movement
passes `CLICK_MOVE_THRESHOLD_PX`.

## Input Modalities

The interaction model is pointer-first, but it must not assume every input has a
hover phase.

| Input          | Behavior                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Mouse/trackpad | Full hover preselection, click selection, drag threshold, double-click edit, context menu.                                 |
| Pen/stylus     | Treat like pointer input; hover preselection is available only on devices/browsers that emit hover-style pointer movement. |
| Touch          | No reliable hover. Tap should select, second tap edits editable text, drag threshold starts movement.                      |
| Keyboard       | Uses roving tabindex and keyboard canvas helpers; `Alt+]` cycles select-under candidates at the focused element center.    |
| Screen readers | Use focus, selection announcements, and the layer list. Preselection itself is advisory visual chrome.                     |

Touch and keyboard users must always have deterministic alternatives through
selection, traversal, and the layer list; they should never depend on hover-only
feedback.

## Semantic Hit Testing

The stage should not rely on DOM overlay boxes for target selection. Instead,
`stage-hit-test.ts` computes ranked candidates from the pointer position and the
current slide elements.

The hit-test pipeline is:

1. Convert client coordinates to slide percent coordinates.
2. Collect candidates from elements whose interactive geometry contains or is
   near the pointer.
3. Drop hidden elements and, by default, locked elements.
4. Score candidates by interaction semantics.
5. Sort by score, then z-index, then DOM/order tie-break.

`HitTestCandidate` carries:

- `element`: the target element;
- `box`: the box used for manipulation;
- `score`: semantic priority;
- `reason`: why the candidate was included.

### Scoring Intent

Scores are intentionally semantic rather than purely visual z-index based.
Examples:

| Candidate condition                  | Priority intent                                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Text/bullet actual content hit       | Very high. Text content is often what users intend to edit/select, even if covered by a shape.  |
| Text/bullet near content             | High. A little tolerance around text makes targeting humane.                                    |
| Text/bullet frame-only hit           | Low. Empty frame area should not block lower visible objects.                                   |
| Connector or line stroke hit         | Very high. Thin objects need a generous distance threshold to be selectable.                    |
| Shape edge hit                       | Very high. Edges/corners usually mean the user is targeting the shape itself.                   |
| Small shape interior                 | High. Small shapes are likely intentional targets.                                              |
| Medium shape interior                | Medium-high.                                                                                    |
| Large/background-like shape interior | Low. Large covering shapes often function as backgrounds/containers and should not trap intent. |
| Selected element                     | Strong bonus. A selected covering element should remain easy to keep operating.                 |
| Z-index                              | Small tie-break bonus, not the whole decision.                                                  |

This is why a text element can be preselected even when a large shape covers it:
the pointer can be close to the text content, while the large shape's interior is
penalized as a likely background-like cover. Conversely, if the pointer is near
the shape edge, the shape edge score wins.

## Element-Specific Hit Rules

### Text

Text elements should not use the entire frame as their primary hit area.

- Actual text line/content area -> `text-content`.
- Slightly inflated text area -> `text-near`.
- Frame-only hit -> `text-frame`, low score.
- Alignment and vertical alignment affect the estimated visible text box.

The current implementation accepts an optional measured text geometry cache from
`text-hit-geometry.ts`. The cache is built by `SlideStageEditor` during layout
from a hidden DOM measurement host, stores line/content boxes in slide-percent
coordinates, and is passed into the pure `stage-hit-test.ts` pipeline. Cache
misses fall back to the heuristic geometry derived from line count, character
count, font size, alignment, and stage aspect ratio.

### Bullets

Bullets follow the text model, but include marker/indent slack:

- `BulletsElement.items[]` is authoritative for bullet text.
- Visible rows/near rows should outrank large shape interiors.
- Empty list frame areas should not trap lower objects.

### Shapes

Shape rules depend on shape kind:

- Rectangles: box hit, with edge vs interior scoring.
- Ellipses: mathematical ellipse hit test.
- Triangles: triangle area hit test.
- Lines: distance-to-line-segment threshold; line bounding boxes are not enough.

Large interior-only shape hits are downweighted so background-like shapes do not
make text and small objects underneath impossible to target. Shape edges remain
high priority so users can still select/manipulate the shape deliberately.

### Connectors

Connectors must be considered in both preselection and direct manipulation.

- Hit testing uses resolved connector endpoint points and a distance-to-segment
  threshold.
- Bound endpoints resolve through `resolveConnectorElementPoints` using current
  fitted boxes.
- Connector endpoint handles remain separate editing affordances once the
  connector is selected.
- While dragging an endpoint, anchor preview dots are shown on candidate target
  elements; this interaction intentionally suppresses general hover preselection.
- Candidate target elements are collected by `connectorAnchorCandidates` from
  elements under the pointer and elements with anchors inside the snap radius;
  final binding still uses the nearest snapped anchor from `snapLineEndpoint`.

A connector is not selected by its full bounding box. It should be targetable
near its stroke, with enough tolerance to be practical.

### Visuals And Images

Visual and image elements can use optional media-aware hit geometry. Visuals get
node-aware regions from `media-hit-geometry.ts` when positioned node bounds are
available; otherwise visuals and images fall back to their fitted box. Image
alpha/pixel-aware geometry is intentionally an extension hook rather than work
done in pointermove.

Large visuals/images are ambiguous: they can be primary content, but they can
also act as background-like covers. The current box-based rule is intentionally
conservative. Future scoring may need additional signals, such as:

- alpha-aware image hit testing for transparent PNG/WebP content;
- richer rendered-node hit testing for sparse visuals, including edges and
  labels outside basic node rectangles;
- background/cover intent from slide layout, element role, or user lock state;
- selected-object stickiness so large media remains operable once selected.

### Placeholders

Placeholders are low-priority box hits. They should be targetable, but should not
beat text content, line strokes, or explicit shape edges.

## Selection And Preselection Frames

Selection/preselection frames are visual chrome, not hit targets.

- Single selected and preselected frames render through a high z-index
  `pointer-events: none` overlay layer.
- This keeps the frame visible even when the selected/preselected element is
  behind another element.
- Stage chrome z-index values are centralized in `stage-chrome.ts` so selected
  element handle overlays, selected/preselected frames, group frames,
  multi-selection bounds, guides, marquees, and live badges preserve a stable
  stacking order.
- The frame overlay must not intercept pointer events.
- Multi-selection and group bounding boxes should also remain visually above
  slide elements. Multi-selection and group frames use the same named top-layer
  chrome scale as the single-element selection frame.
- Resize/rotate handles are shown only for the primary selected element and keep
  their pointer hit areas.

Resize and rotation handles are editing affordances, not hover preselection. The
handles belong to the selected primary element and should stay reachable even
when the selected element is behind another object. If handle visibility diverges
from frame visibility, handles should be moved to the same top-layer chrome
strategy as frames.

## Pointer Target Resolution

Pointer-down, double-click, and context-menu actions should ask the same semantic
hit-test for the target. This keeps hover feedback and click behavior aligned.

| Gesture                 | Target source                        | Result                                                                |
| ----------------------- | ------------------------------------ | --------------------------------------------------------------------- |
| Pointer move            | top semantic hit candidate           | update `preselectedElementId` while idle/selected-idle                |
| Pointer down on element | top semantic hit candidate           | select target immediately, enter `press-pending`                      |
| Pointer move threshold  | existing drag ref                    | enter moving/resizing/rotating and suppress hover preselection        |
| Pointer up no movement  | press-pending target                 | select only, or enter inline edit if it was the selected text element |
| Double click            | top semantic hit candidate           | enter group or inline text edit for that target                       |
| Context menu            | top semantic hit candidate           | select target and open menu for that target                           |
| Select-under cycle      | current ranked candidate stack       | `Alt`-click or `Alt+]` selects the next candidate in stack order      |
| Stage empty click       | no semantic hit, no marquee movement | clear selection                                                       |
| Editing stage click     | primary stage click while editing    | commit/exit inline edit and clear selection                           |

Pointer-down target resolution and hover preselection use the same ranked
candidate list, but side effects differ. Hover only updates
`preselectedElementId`; pointer-down stores a press-pending target; movement past
the threshold promotes that target into the active manipulation state.

The raw semantic hit candidate is resolved through `stage-targeting.ts` before
selection semantics are applied. This keeps group behavior consistent across
hover, pointer-down, double-click, context-menu selection, and future
select-under cycling while preserving the raw candidate stack for precision
fallback menus.

## Groups And Multi-Selection

Groups add another semantic layer over hit testing.

- Outside group-editing mode, clicking a grouped member selects the group as a
  unit.
- Inside group-editing mode, members are targetable individually.
- `stage-targeting.ts` is the shared boundary that turns a raw hit element into
  either an element target or a group target.
- Group bounding boxes are visual chrome and should not become hit-test
  blockers.
- Multi-selection transforms use the combined transform box, not the individual
  hit-test candidate under the pointer.
- Modifier-click selection toggles membership in the selection set and should
  not start drag tracking.

When group behavior and semantic hit-testing disagree, the group-editing mode is
the authority: unentered groups resolve to group-level selection; entered groups
resolve to member-level selection.

## Overlap Cases

| Scenario                                           | Expected result                                                                                 |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Large text frame over shape, pointer in text blank | Lower visible object can preselect/select.                                                      |
| Large shape over text, pointer near text content   | Text can win by semantic score, even if geometrically covered by the shape.                     |
| Pointer near shape edge                            | Shape wins.                                                                                     |
| Small shape over text                              | Small shape can win.                                                                            |
| Selected large shape over text                     | Selected shape keeps a strong bonus so it remains operable.                                     |
| Multiple arbitrary fully covered objects           | Semantic scoring can improve the common case, but layer list/context menu remains the fallback. |
| Line/connector over any element                    | Stroke-distance hit wins near the line; box interior alone should not.                          |
| Locked object over editable object                 | Locked object is excluded by default, so lower editable objects can be targeted.                |

## Precision Fallbacks

Semantic scoring should make common cases feel intelligent, but it is not a
replacement for precise layer selection.

- The layer list remains the deterministic way to select any element regardless
  of occlusion.
- The context menu exposes a `Select layer` section when multiple hit-test
  candidates are under the pointer, sorted by score/z-index.
- Select-under cycling reuses the same candidate list without changing default
  hover behavior: `Alt`-click cycles at the pointer, and `Alt+]` cycles at the
  focused element center.

These fallbacks are especially important for fully covered arbitrary objects,
nearly identical stacked shapes, locked/background layers, and dense groups.

## Performance And Caching

Pointer movement can fire at high frequency. The stage already batches pointer
processing with `requestAnimationFrame`; hit testing should preserve that model.

Implementation guidance:

- Keep hit-test helpers pure and DOM-free where possible.
- Reuse fitted boxes computed for rendering/manipulation.
- Avoid measuring DOM line boxes on every pointer move; cache measured text
  geometry if precise text hit testing is added later.
- Consider a spatial index only if slides grow beyond typical element counts.
- Keep hover preselection advisory so it never writes deck state or schedules
  autosave.

## Known Limitations And Future Work

- Text hit boxes use DOM-measured line/content boxes when the cache is available
  and fall back to heuristic boxes on cache miss. The cache is invalidated when
  slide elements, fitted boxes, or stage dimensions change.
- Visual and image hit testing is box-based. Alpha-aware image picking and
  visual-node hit testing could make sparse media behave more like Canva.
- If future group handles diverge from the multi-selection handle strategy, they
  should stay on the named top-layer chrome scale in `stage-chrome.ts`.
- Fully covered arbitrary objects cannot always be inferred correctly from a
  single pointer point. If semantic scoring is ambiguous, right-click layer
  selection or the layer list remains the precise fallback.
- Select-under cycling uses the ordered candidate list returned by the hit-test;
  it remains a precision fallback rather than a replacement for semantic
  scoring.

## Invariants

1. Hover preselection is advisory and never mutates the deck.
2. Selection state changes only through explicit pointer/keyboard/menu actions.
3. Moving/resizing starts only after the pointer passes the drag threshold.
4. Hit testing is pure and covered by DOM-free tests.
5. Visual frames render above slide elements but never intercept pointer events.
6. Connector/line hit testing is distance based, not bounding-box based.
7. `SlideCanvas` remains read-only; all interaction logic lives in the stage.

## Primary Tests

- [`src/lib/presentation/stage-hit-test.test.ts`](../../../src/lib/presentation/stage-hit-test.test.ts)
- [`src/lib/presentation/stage-interaction.test.ts`](../../../src/lib/presentation/stage-interaction.test.ts)
- [`src/lib/presentation/canvas-a11y.test.ts`](../../../src/lib/presentation/canvas-a11y.test.ts)
