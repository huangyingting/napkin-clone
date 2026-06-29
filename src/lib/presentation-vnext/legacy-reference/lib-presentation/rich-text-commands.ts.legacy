/**
 * Selection/Range-based rich-text editing commands for `contentEditable`
 * surfaces.
 *
 * Replaces every `document.execCommand` call that was previously used by both
 * `InlineTextEditor` and `RichTextBox`.  Both surfaces share these helpers so
 * formatting logic lives in one place.
 *
 * No `document.execCommand` is used here. All DOM mutations use the W3C
 * Selection / Range API.
 */

// ---------------------------------------------------------------------------
// insertTextAtCursor
// ---------------------------------------------------------------------------

/**
 * Inserts plain text at the current cursor position, replacing any selection.
 * Newlines in the text become `<br>` elements to match the existing run model.
 *
 * Replaces: `document.execCommand("insertText", false, text)`
 */
export function insertTextAtCursor(text: string): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  const range = sel.getRangeAt(0);
  range.deleteContents();

  if (!text) return;

  const lines = text.split("\n");
  const frag = document.createDocumentFragment();
  let lastNode: Node | null = null;

  lines.forEach((line, i) => {
    if (line.length > 0) {
      const t = document.createTextNode(line);
      frag.appendChild(t);
      lastNode = t;
    }
    if (i < lines.length - 1) {
      const br = document.createElement("br");
      frag.appendChild(br);
      lastNode = br;
    }
  });

  if (!lastNode) return;

  range.insertNode(frag);

  // Place cursor after the last inserted node.
  const endRange = document.createRange();
  endRange.setStartAfter(lastNode);
  endRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(endRange);
}

// ---------------------------------------------------------------------------
// applyBoldOrItalic
// ---------------------------------------------------------------------------

/**
 * Toggles bold or italic on the current selection within `container`.
 *
 * Replaces: `document.execCommand("bold")` / `document.execCommand("italic")`
 *
 * Behaviour mirrors `execCommand`:
 *  - If the **entire** selection is already formatted → remove the format.
 *  - Otherwise → apply the format to the whole selection.
 * Collapsed selections (cursor only) are ignored.
 */
export function applyBoldOrItalic(
  format: "bold" | "italic",
  container: HTMLElement,
): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return;

  if (isFullyFormatted(range, format)) {
    removeFormatFromRange(range, format, container);
  } else {
    applyFormatToRange(range, format);
  }

  container.normalize();
}

// ---------------------------------------------------------------------------
// applyForeColor
// ---------------------------------------------------------------------------

/**
 * Applies a foreground colour to the current selection.
 *
 * Replaces: `document.execCommand("foreColor", false, color)`
 *
 * Wraps the selected content in `<span style="color:…">` so
 * {@link serializeRichText} picks it up as a coloured run.
 */
export function applyForeColor(color: string, container: HTMLElement): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return;

  const span = document.createElement("span");
  span.style.color = color;

  try {
    range.surroundContents(span);
  } catch {
    // Cross-element boundary: extract, wrap, re-insert.
    const contents = range.extractContents();
    span.appendChild(contents);
    range.insertNode(span);
  }

  container.normalize();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Returns true when the element carries the requested inline format. */
function isFormatEl(node: Node, format: "bold" | "italic"): boolean {
  if (!(node instanceof HTMLElement)) return false;
  if (format === "bold") {
    return (
      parseInt(node.style.fontWeight, 10) >= 600 ||
      node.tagName === "B" ||
      node.tagName === "STRONG"
    );
  }
  return (
    node.style.fontStyle === "italic" ||
    node.tagName === "I" ||
    node.tagName === "EM"
  );
}

/**
 * Returns true only when every text node inside `range` is rendered with the
 * requested format (checked via computed style).  Mirrors the heuristic used
 * by `document.queryCommandState("bold")`.
 */
function isFullyFormatted(range: Range, format: "bold" | "italic"): boolean {
  if (range.collapsed) return false;

  const ancestor = range.commonAncestorContainer;
  const root =
    ancestor.nodeType === Node.TEXT_NODE
      ? ancestor.parentElement
      : (ancestor as HTMLElement);
  if (!root) return false;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let hasText = false;
  let node: Node | null = walker.nextNode();

  while (node) {
    if (range.intersectsNode(node)) {
      const parent = (node as Text).parentElement;
      if (!parent) return false;
      const cs = window.getComputedStyle(parent);
      const formatted =
        format === "bold"
          ? parseInt(cs.fontWeight, 10) >= 600
          : cs.fontStyle === "italic";
      if (!formatted) return false;
      hasText = true;
    }
    node = walker.nextNode();
  }

  return hasText;
}

/** Replaces a format element with its own children (unwrap). */
function unwrapElement(el: HTMLElement): void {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

/** Wraps `range` content in a bold / italic span. */
function applyFormatToRange(range: Range, format: "bold" | "italic"): void {
  const span = document.createElement("span");
  if (format === "bold") span.style.fontWeight = "700";
  else span.style.fontStyle = "italic";

  try {
    range.surroundContents(span);
  } catch {
    // Selection crosses element boundaries.
    const contents = range.extractContents();
    span.appendChild(contents);
    range.insertNode(span);
  }
}

/**
 * Finds all format-bearing elements within `container` that overlap with
 * `range`.  Does not recurse into matching elements (they are the leaves we
 * operate on).
 */
function findFormatElementsOverlapping(
  range: Range,
  format: "bold" | "italic",
  container: HTMLElement,
): HTMLElement[] {
  const result: HTMLElement[] = [];

  function walk(node: Node): void {
    if (!(node instanceof HTMLElement)) return;
    if (isFormatEl(node, format) && range.intersectsNode(node)) {
      result.push(node);
      return; // don't recurse into the matched element
    }
    for (const child of node.childNodes) walk(child);
  }

  for (const child of container.childNodes) walk(child);
  return result;
}

/**
 * Removes the inline format from the portion of `formatEl` that overlaps
 * with `selRange`.
 *
 * Uses `cloneContents()` to build the replacement DOM without touching the
 * live tree until the final atomic `replaceChild`, so live `Range` objects
 * that reference other elements are not disturbed.
 */
function splitFormatElementClone(
  formatEl: HTMLElement,
  selRange: Range,
  fmtRange: Range,
): void {
  const parent = formatEl.parentNode;
  if (!parent) return;

  // Does the selection start after the format element's start?
  const selStartAfterFmt =
    selRange.compareBoundaryPoints(Range.START_TO_START, fmtRange) > 0;
  // Does the selection end before the format element's end?
  const selEndBeforeFmt =
    selRange.compareBoundaryPoints(Range.END_TO_END, fmtRange) < 0;

  // "Before" part: [fmtStart .. selStart]  (kept formatted)
  const beforeRange = document.createRange();
  beforeRange.setStart(fmtRange.startContainer, fmtRange.startOffset);
  if (selStartAfterFmt) {
    beforeRange.setEnd(selRange.startContainer, selRange.startOffset);
  } else {
    beforeRange.collapse(true);
  }

  // "Middle" part: [selStart ∩ fmtStart .. selEnd ∩ fmtEnd]  (un-formatted)
  const middleRange = document.createRange();
  if (selStartAfterFmt) {
    middleRange.setStart(selRange.startContainer, selRange.startOffset);
  } else {
    middleRange.setStart(fmtRange.startContainer, fmtRange.startOffset);
  }
  if (selEndBeforeFmt) {
    middleRange.setEnd(selRange.endContainer, selRange.endOffset);
  } else {
    middleRange.setEnd(fmtRange.endContainer, fmtRange.endOffset);
  }

  // "After" part: [selEnd .. fmtEnd]  (kept formatted)
  const afterRange = document.createRange();
  if (selEndBeforeFmt) {
    afterRange.setStart(selRange.endContainer, selRange.endOffset);
    afterRange.setEnd(fmtRange.endContainer, fmtRange.endOffset);
  } else {
    afterRange.collapse(false);
  }

  // Build the replacement fragment using cloneContents — no live mutations yet.
  const replacement = document.createDocumentFragment();

  if (!beforeRange.collapsed) {
    const beforeEl = formatEl.cloneNode(false) as HTMLElement;
    beforeEl.appendChild(beforeRange.cloneContents());
    if (beforeEl.textContent) replacement.appendChild(beforeEl);
  }

  if (!middleRange.collapsed) {
    const middleContent = middleRange.cloneContents();
    if (middleContent.textContent) replacement.appendChild(middleContent);
  }

  if (!afterRange.collapsed) {
    const afterEl = formatEl.cloneNode(false) as HTMLElement;
    afterEl.appendChild(afterRange.cloneContents());
    if (afterEl.textContent) replacement.appendChild(afterEl);
  }

  // Single atomic swap — other live ranges are unaffected until this point.
  parent.replaceChild(replacement, formatEl);
}

/**
 * Removes `format` from every overlapping format element inside `container`
 * that the `range` touches.  For elements fully covered by the selection the
 * element is simply unwrapped; for partial overlaps the element is split so
 * only the selected portion loses its format.
 */
function removeFormatFromRange(
  range: Range,
  format: "bold" | "italic",
  container: HTMLElement,
): void {
  const fmtEls = findFormatElementsOverlapping(range, format, container);

  for (const el of fmtEls) {
    if (!el.parentNode) continue;

    const fmtRange = document.createRange();
    fmtRange.selectNodeContents(el);

    const fullyCovered =
      range.compareBoundaryPoints(Range.START_TO_START, fmtRange) <= 0 &&
      range.compareBoundaryPoints(Range.END_TO_END, fmtRange) >= 0;

    if (fullyCovered) {
      unwrapElement(el);
    } else {
      splitFormatElementClone(el, range, fmtRange);
    }
  }
}
