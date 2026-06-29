import {
  Align,
  Direction,
  Edge,
  FlexDirection,
  Gutter,
  Justify,
  loadYoga,
  type Node,
  type Yoga,
} from "yoga-layout/load";

import { type Box } from "./theme-kit";
import {
  DEFAULT_LAYOUT_CANVAS,
  type CssLength,
  type SlideCanvasSize,
  parseCssLengthUnit,
  parseSpacingValues,
  resolveLayoutLength,
} from "./style-dsl";

export type FlexDirectionKeyword = "row" | "column";
export type FlexAlignKeyword = "start" | "center" | "end" | "stretch";
export type FlexJustifyKeyword =
  | "start"
  | "center"
  | "end"
  | "space-between"
  | "space-around"
  | "space-evenly";

export interface FlexNodeInput {
  key?: string;
  width?: CssLength;
  height?: CssLength;
  basis?: CssLength;
  grow?: number;
  shrink?: number;
  flex?: number;
  direction?: FlexDirectionKeyword;
  gap?: CssLength;
  padding?: CssLength;
  align?: FlexAlignKeyword;
  justify?: FlexJustifyKeyword;
  children?: FlexNodeInput[];
}

export interface FlexLayoutInput extends FlexNodeInput {
  box: Box;
  canvas?: SlideCanvasSize;
  children: FlexNodeInput[];
}

export interface FlexLayoutNode {
  key?: string;
  box: Box;
  children: FlexLayoutNode[];
}

let yogaRuntime: Yoga | null = null;

export async function initializeLayoutEngine(): Promise<void> {
  yogaRuntime ??= await loadYoga();
}

function yoga(): Yoga {
  if (!yogaRuntime) {
    throw new Error(
      "layout engine is not initialized; call initializeLayoutEngine() first",
    );
  }
  return yogaRuntime;
}

function boxToPx(box: Box, canvas: SlideCanvasSize): Box {
  return {
    x: (box.x / 100) * canvas.width,
    y: (box.y / 100) * canvas.height,
    w: (box.w / 100) * canvas.width,
    h: (box.h / 100) * canvas.height,
  };
}

function pxToBox(box: Box, canvas: SlideCanvasSize): Box {
  return {
    x: (box.x / canvas.width) * 100,
    y: (box.y / canvas.height) * 100,
    w: (box.w / canvas.width) * 100,
    h: (box.h / canvas.height) * 100,
  };
}

function applyDirection(
  node: Node,
  direction: FlexDirectionKeyword | undefined,
): void {
  node.setFlexDirection(
    direction === "column" ? FlexDirection.Column : FlexDirection.Row,
  );
}

function applyAlign(node: Node, align: FlexAlignKeyword | undefined): void {
  if (!align) return;
  const value =
    align === "center"
      ? Align.Center
      : align === "end"
        ? Align.FlexEnd
        : align === "stretch"
          ? Align.Stretch
          : Align.FlexStart;
  node.setAlignItems(value);
}

function applyJustify(
  node: Node,
  justify: FlexJustifyKeyword | undefined,
): void {
  if (!justify) return;
  const value =
    justify === "center"
      ? Justify.Center
      : justify === "end"
        ? Justify.FlexEnd
        : justify === "space-between"
          ? Justify.SpaceBetween
          : justify === "space-around"
            ? Justify.SpaceAround
            : justify === "space-evenly"
              ? Justify.SpaceEvenly
              : Justify.FlexStart;
  node.setJustifyContent(value);
}

function applySpacing(
  node: Node,
  input: FlexNodeInput,
  parent: { width: number; height: number },
  canvas: SlideCanvasSize,
): void {
  const padding = parseSpacingValues(input.padding, "padding");
  setPadding(node, Edge.Top, padding.top, "y", parent, canvas, "padding.top");
  setPadding(
    node,
    Edge.Right,
    padding.right,
    "x",
    parent,
    canvas,
    "padding.right",
  );
  setPadding(
    node,
    Edge.Bottom,
    padding.bottom,
    "y",
    parent,
    canvas,
    "padding.bottom",
  );
  setPadding(
    node,
    Edge.Left,
    padding.left,
    "x",
    parent,
    canvas,
    "padding.left",
  );
  if (input.gap !== undefined) {
    const axis = input.direction === "column" ? "y" : "x";
    const parsed = parseCssLengthUnit(input.gap, "gap");
    if (parsed.unit === "%") {
      node.setGapPercent(Gutter.All, parsed.value);
    } else {
      node.setGap(
        Gutter.All,
        resolveLayoutLength(input.gap, axis, parent, canvas, "gap"),
      );
    }
  }
}

function setPadding(
  node: Node,
  edge: Edge,
  input: CssLength,
  axis: "x" | "y",
  parent: { width: number; height: number },
  canvas: SlideCanvasSize,
  context: string,
): void {
  const parsed = parseCssLengthUnit(input, context);
  if (parsed.unit === "%") {
    node.setPaddingPercent(edge, parsed.value);
    return;
  }
  node.setPadding(
    edge,
    resolveLayoutLength(input, axis, parent, canvas, context),
  );
}

function setWidth(
  node: Node,
  input: CssLength,
  parent: { width: number; height: number },
  canvas: SlideCanvasSize,
): void {
  const parsed = parseCssLengthUnit(input, "width");
  if (parsed.unit === "%") node.setWidthPercent(parsed.value);
  else node.setWidth(resolveLayoutLength(input, "x", parent, canvas, "width"));
}

function setHeight(
  node: Node,
  input: CssLength,
  parent: { width: number; height: number },
  canvas: SlideCanvasSize,
): void {
  const parsed = parseCssLengthUnit(input, "height");
  if (parsed.unit === "%") node.setHeightPercent(parsed.value);
  else
    node.setHeight(resolveLayoutLength(input, "y", parent, canvas, "height"));
}

function setBasis(
  node: Node,
  input: CssLength,
  parentDirection: FlexDirectionKeyword,
  parent: { width: number; height: number },
  canvas: SlideCanvasSize,
): void {
  const parsed = parseCssLengthUnit(input, "basis");
  if (parsed.unit === "%") {
    node.setFlexBasisPercent(parsed.value);
    return;
  }
  const axis = parentDirection === "column" ? "y" : "x";
  node.setFlexBasis(resolveLayoutLength(input, axis, parent, canvas, "basis"));
}

function applyNodeStyle(
  node: Node,
  input: FlexNodeInput,
  parent: { width: number; height: number },
  canvas: SlideCanvasSize,
  parentDirection: FlexDirectionKeyword = "row",
): void {
  applyDirection(node, input.direction);
  applyAlign(node, input.align);
  applyJustify(node, input.justify);
  applySpacing(node, input, parent, canvas);
  if (input.width !== undefined) {
    setWidth(node, input.width, parent, canvas);
  }
  if (input.height !== undefined) {
    setHeight(node, input.height, parent, canvas);
  }
  if (input.basis !== undefined) {
    setBasis(node, input.basis, parentDirection, parent, canvas);
  }
  if (input.flex !== undefined) node.setFlex(input.flex);
  if (input.grow !== undefined) node.setFlexGrow(input.grow);
  if (input.shrink !== undefined) node.setFlexShrink(input.shrink);
}

function createYogaTree(
  input: FlexNodeInput,
  parent: { width: number; height: number },
  canvas: SlideCanvasSize,
  parentDirection: FlexDirectionKeyword,
): Node {
  const node = yoga().Node.create();
  applyNodeStyle(node, input, parent, canvas, parentDirection);
  for (const child of input.children ?? []) {
    const childNode = createYogaTree(
      child,
      parent,
      canvas,
      input.direction ?? "row",
    );
    node.insertChild(childNode, node.getChildCount());
  }
  return node;
}

function collectLayout(
  input: FlexNodeInput,
  node: Node,
  origin: { x: number; y: number },
  canvas: SlideCanvasSize,
): FlexLayoutNode {
  const layout = node.getComputedLayout();
  const absolute = {
    x: origin.x + layout.left,
    y: origin.y + layout.top,
    w: layout.width,
    h: layout.height,
  };
  return {
    ...(input.key ? { key: input.key } : {}),
    box: pxToBox(absolute, canvas),
    children: (input.children ?? []).map((child, index) =>
      collectLayout(
        child,
        node.getChild(index),
        { x: absolute.x, y: absolute.y },
        canvas,
      ),
    ),
  };
}

export function layoutFlex(input: FlexLayoutInput): FlexLayoutNode {
  const canvas = input.canvas ?? DEFAULT_LAYOUT_CANVAS;
  const rootPx = boxToPx(input.box, canvas);
  const root = yoga().Node.create();
  root.setWidth(rootPx.w);
  root.setHeight(rootPx.h);
  applyNodeStyle(root, input, { width: rootPx.w, height: rootPx.h }, canvas);
  for (const child of input.children) {
    const childNode = createYogaTree(
      child,
      { width: rootPx.w, height: rootPx.h },
      canvas,
      input.direction ?? "row",
    );
    root.insertChild(childNode, root.getChildCount());
  }
  root.calculateLayout(rootPx.w, rootPx.h, Direction.LTR);
  const layout = collectLayout(
    input,
    root,
    { x: rootPx.x, y: rootPx.y },
    canvas,
  );
  root.freeRecursive();
  return layout;
}

export function flex(input: FlexLayoutInput): Box[] {
  return layoutFlex(input).children.map((child) => child.box);
}
