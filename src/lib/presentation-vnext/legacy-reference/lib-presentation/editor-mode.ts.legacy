/**
 * Simple / Advanced progressive-disclosure mode for the slide editor.
 *
 * VISIBILITY MATRIX — single source of truth.
 *
 * | Tool / Control                    | Simple | Advanced | Primary home        |
 * |-----------------------------------|--------|----------|---------------------|
 * | Add element (Insert button)       |   ✓    |    ✓     | Top bar             |
 * | Text style (bold/italic/color)    |   ✓    |    ✓     | Floating toolbar    |
 * | Shape color                       |   ✓    |    ✓     | Floating toolbar    |
 * | Duplicate                         |   ✓    |    ✓     | Floating toolbar    |
 * | Delete                            |   ✓    |    ✓     | Floating toolbar    |
 * | Edit text (context menu)          |   ✓    |    ✓     | Context menu        |
 * | Copy / Cut / Paste                |   ✓    |    ✓     | Context menu        |
 * | Reorder (element list)            |   ✓    |    ✓     | Inspector           |
 * | Background / Accent color         |   ✓    |    ✓     | Inspector Style tab |
 * | --------------------------------- | ------ | -------- | ------------------- |
 * | Rotate handle (canvas)            |   ✗    |    ✓     | Canvas              |
 * | Bring to front (toolbar)          |   ✗    |    ✓     | Inspector Arrange   |
 * | Send to back (toolbar)            |   ✗    |    ✓     | Inspector Arrange   |
 * | Bring to front (context menu)     |   ✗    |    ✓     | Inspector Arrange   |
 * | Send to back (context menu)       |   ✗    |    ✓     | Inspector Arrange   |
 * | Bring to front / back (insp. list)|   ✗    |    ✓     | Inspector Arrange   |
 * | Lock / Unlock (context menu)      |   ✗    |    ✓     | Context menu        |
 * | Group (context menu)              |   ✗    |    ✓     | Context menu        |
 * | Ungroup (context menu)            |   ✗    |    ✓     | Context menu        |
 * | Snap-to-grid toggle               |   ✗    |    ✓     | Top bar             |
 * | Arrange section (pos/size/rotate) |   ✗    |    ✓     | Inspector (§, coll.)|
 * | Opacity control                   |   ✗    |    ✓     | Inspector (§, coll.)|
 * | Effects (shadow / lock)           |   ✗    |    ✓     | Inspector (§, coll.)|
 * | Corner radius (shape & image)     |   ✗    |    ✓     | Inspector (§, coll.)|
 * | Gradient + gradient angle         |   ✗    |    ✓     | Inspector Style tab |
 *
 * "§, coll." = collapsible section, collapsed by default in Advanced mode.
 * Primary home notes where the control lives authoritatively; duplicates on
 * other surfaces are removed in Simple mode to reduce noise.
 */

export type EditorMode = "simple" | "advanced";

export type EditorTool =
  // Canvas
  | "rotate-handle" // rotate handle below selected element     – canvas
  // Floating toolbar (advanced element actions)
  | "toolbar-bring-to-front" // ↑ z-order button in toolbar      – inspector Arrange
  | "toolbar-send-to-back" // ↓ z-order button in toolbar        – inspector Arrange
  // Context-menu advanced items
  | "context-bring-to-front" // Bring to front in right-click     – inspector Arrange
  | "context-send-to-back" // Send to back in right-click         – inspector Arrange
  | "context-lock" // Lock / Unlock element                       – context menu
  | "context-group" // Group elements                             – context menu
  | "context-ungroup" // Ungroup elements                         – context menu
  // Top bar
  | "snap-to-grid" // Snap-to-grid toggle                         – top bar
  // Inspector – per-element collapsible sections
  | "inspector-arrange" // Position / size / rotation / z-order   – inspector
  | "inspector-opacity" // Opacity slider                          – inspector
  | "inspector-effects" // Shadow / lock effects checkboxes        – inspector
  | "inspector-corner-radius" // Corner radius (shape & image)     – inspector
  // Inspector – slide Style tab
  | "inspector-gradient"; // Gradient toggle + colors + angle      – inspector Style

/** All controls that are hidden in Simple and revealed in Advanced. */
const ADVANCED_TOOLS = new Set<EditorTool>([
  "rotate-handle",
  "toolbar-bring-to-front",
  "toolbar-send-to-back",
  "context-bring-to-front",
  "context-send-to-back",
  "context-lock",
  "context-group",
  "context-ungroup",
  "snap-to-grid",
  "inspector-arrange",
  "inspector-opacity",
  "inspector-effects",
  "inspector-corner-radius",
  "inspector-gradient",
]);

/**
 * Returns `true` when `tool` should be visible for the given `mode`.
 * Advanced mode reveals all controls; Simple mode hides the advanced set.
 */
export function isToolVisible(tool: EditorTool, mode: EditorMode): boolean {
  if (mode === "advanced") return true;
  return !ADVANCED_TOOLS.has(tool);
}
