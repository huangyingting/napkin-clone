import type {
  CommandResult as SlideCommandResult,
  DeckPatch,
  SlideCommand,
} from "@/lib/presentation/slide-commands";
import {
  ASPECT_RATIO_PRESETS,
  isVisualKind,
  safeParseVisual,
} from "@/lib/visual/schema";
import { STYLE_THEMES } from "@/lib/visual/themes";
import { VISUAL_DISPLAY_STYLES } from "@/lib/visual/display-styles";

export const CURRENT_COMMAND_SCHEMA_VERSION = 1 as const;

const COMMAND_SOURCES = ["user", "ai", "sync", "replay"] as const;
const COMMAND_SURFACES = [
  "document",
  "visual",
  "deck",
  "asset",
  "comment",
  "source-ref",
] as const;
const NODE_STYLE_FIELDS = ["color", "stroke", "textColor"] as const;
const FILL_STYLES = ["solid", "gradient"] as const;
const LINE_STYLES = ["solid", "dashed", "dotted"] as const;
const TEXT_ALIGNS = ["left", "center", "right"] as const;
const CANVAS_STYLES = ["blank", "ruled", "dot-grid"] as const;
const ARROW_STYLES = ["filled", "open", "circle", "diamond"] as const;
const EFFECT_KINDS = ["shadow", "sketch"] as const;
const SLIDE_COMMAND_TYPES = [
  "ADD_SLIDE",
  "REMOVE_SLIDE",
  "DUPLICATE_SLIDE",
  "REORDER_SLIDE",
  "UPDATE_SLIDE",
  "ADD_ELEMENT",
  "UPDATE_ELEMENT",
  "REMOVE_ELEMENT",
  "MOVE_SLIDE",
  "INSERT_TEMPLATE_SLIDE",
  "UPDATE_SLIDE_TITLE",
  "UPDATE_SLIDE_BODY",
  "UPDATE_SLIDE_NOTES",
  "UPDATE_SLIDE_LAYOUT_HINT",
  "APPLY_SLIDE_LAYOUT",
  "RESET_SLIDE_LAYOUT",
  "REMOVE_ELEMENTS",
  "DUPLICATE_ELEMENT",
  "DUPLICATE_ELEMENTS",
  "NUDGE_ELEMENTS",
  "GROUP_ELEMENTS",
  "UNGROUP_ELEMENTS",
  "ALIGN_ELEMENTS",
  "DISTRIBUTE_ELEMENTS",
  "MATCH_SIZE_ELEMENTS",
  "ARRANGE_ELEMENTS",
  "BRING_ELEMENT_TO_FRONT",
  "SEND_ELEMENT_TO_BACK",
  "SET_ELEMENT_BOXES",
  "SET_ELEMENT_PATCHES",
  "SET_ELEMENT_HIDDEN",
  "SET_ELEMENT_LOCKED",
  "MOVE_ELEMENT_ZORDER",
  "RENAME_ELEMENT",
  "SET_DECK_THEME",
  "SET_DECK_FORMAT",
  "SET_SLIDE_BACKGROUND",
  "SET_SLIDE_BACKGROUND_GRADIENT",
  "SET_SLIDE_BACKGROUND_IMAGE",
  "SET_SLIDE_BACKGROUND_ASSET",
  "SET_SLIDE_ACCENT",
  "REFRESH_ELEMENT_FROM_SOURCE",
  "UNLINK_ELEMENT_SOURCE",
  "RELINK_ELEMENT_SOURCE",
  "REMOVE_SOURCE_ELEMENT",
] as const;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VISUAL_THEME_IDS = new Set(STYLE_THEMES.map((theme) => theme.id));
const VISUAL_DISPLAY_STYLE_IDS = new Set(
  VISUAL_DISPLAY_STYLES.map((style) => style.id),
);

export type CommandSource = (typeof COMMAND_SOURCES)[number];
export type CommandTargetSurface = (typeof COMMAND_SURFACES)[number];

export interface CommandActor {
  id: string;
  sessionId?: string;
}

export interface CommandTarget {
  surface: CommandTargetSurface;
  documentId?: string;
  visualId?: string;
  slideId?: string;
  elementId?: string;
  assetId?: string;
  commentId?: string;
  sourceRefId?: string;
  expectedRevision?: string;
  expectedSourceHash?: string;
}

export interface CommandEnvelope<P = unknown> {
  id: string;
  schemaVersion: number;
  type: string;
  timestamp: string;
  actor: CommandActor;
  target: CommandTarget;
  payload: P;
  coalesceKey?: string;
  source?: CommandSource;
}

export type SlideCommandEnvelope = CommandEnvelope<SlideCommand>;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface CommandAffectedIds {
  documentIds: string[];
  visualIds: string[];
  slideIds: string[];
  elementIds: string[];
  assetIds: string[];
  commentIds: string[];
  sourceRefIds: string[];
  nodeIds: string[];
  edgeIds: string[];
}

export interface CrossSurfaceCommandResult<
  Patch = unknown,
  SideEffect = never,
> {
  ok: boolean;
  error?: string;
  affectedIds: CommandAffectedIds;
  coalesceKey?: string;
  patches: Patch[];
  sideEffects: SideEffect[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isInteger(value: unknown): value is number {
  return Number.isInteger(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isOneOf<T extends readonly string[]>(
  value: unknown,
  options: T,
): value is T[number] {
  return typeof value === "string" && options.includes(value as T[number]);
}

function uniqueStrings(values: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values ?? []) {
    if (!isNonEmptyString(value) || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function validateElementBox(
  value: unknown,
  context: string,
  errors: string[],
): void {
  if (!isPlainObject(value)) {
    errors.push(`${context} must be an object.`);
    return;
  }
  for (const key of ["x", "y", "w", "h"] as const) {
    if (!isFiniteNumber(value[key])) {
      errors.push(`${context}.${key} must be a finite number.`);
    }
  }
}

function validateGradient(
  value: unknown,
  context: string,
  errors: string[],
): void {
  if (value === undefined) {
    return;
  }
  if (!isPlainObject(value)) {
    errors.push(`${context} must be an object or undefined.`);
    return;
  }
  if (!isNonEmptyString(value.from)) {
    errors.push(`${context}.from must be a non-empty string.`);
  }
  if (!isNonEmptyString(value.to)) {
    errors.push(`${context}.to must be a non-empty string.`);
  }
  if (value.angle !== undefined && !isFiniteNumber(value.angle)) {
    errors.push(`${context}.angle must be a finite number when provided.`);
  }
}

function validateAssetOptions(
  value: unknown,
  context: string,
  errors: string[],
): void {
  if (value === undefined) {
    return;
  }
  if (!isPlainObject(value)) {
    errors.push(`${context} must be an object or undefined.`);
    return;
  }
  if (!isNonEmptyString(value.url)) {
    errors.push(`${context}.url must be a non-empty string.`);
  }
  if (!isNonEmptyString(value.assetId)) {
    errors.push(`${context}.assetId must be a non-empty string.`);
  }
}

function pushUnknownKeyErrors(
  input: Record<string, unknown>,
  allowed: readonly string[],
  context: string,
  errors: string[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(input)) {
    if (!allowedSet.has(key)) {
      errors.push(`${context}.${key} is not supported.`);
    }
  }
}

function validateVisualStylePatch(
  value: unknown,
  context: string,
  errors: string[],
): void {
  if (!isPlainObject(value)) {
    errors.push(`${context} must be an object.`);
    return;
  }
  pushUnknownKeyErrors(
    value,
    [
      "palette",
      "background",
      "nodeFill",
      "nodeStroke",
      "nodeText",
      "edgeColor",
      "fontFamily",
      "fontSize",
      "fontWeight",
    ],
    context,
    errors,
  );

  if (
    value.palette !== undefined &&
    (!Array.isArray(value.palette) ||
      value.palette.length === 0 ||
      !value.palette.every((entry) => typeof entry === "string"))
  ) {
    errors.push(`${context}.palette must be a non-empty array of strings.`);
  }

  for (const key of [
    "background",
    "nodeFill",
    "nodeStroke",
    "nodeText",
    "edgeColor",
    "fontFamily",
  ] as const) {
    const field = value[key];
    if (field !== undefined && typeof field !== "string") {
      errors.push(`${context}.${key} must be a string.`);
    }
  }

  if (value.fontSize !== undefined && !isPositiveNumber(value.fontSize)) {
    errors.push(`${context}.fontSize must be a positive number.`);
  }
  if (value.fontWeight !== undefined && !isPositiveNumber(value.fontWeight)) {
    errors.push(`${context}.fontWeight must be a positive number.`);
  }
}

function validateNodeExtStylePatch(
  value: unknown,
  context: string,
  errors: string[],
): void {
  if (!isPlainObject(value)) {
    errors.push(`${context} must be an object.`);
    return;
  }
  pushUnknownKeyErrors(
    value,
    ["fillStyle", "borderStyle", "borderWidth", "textAlign", "fontFamily"],
    context,
    errors,
  );
  if (value.fillStyle !== undefined && !isOneOf(value.fillStyle, FILL_STYLES)) {
    errors.push(
      `${context}.fillStyle must be one of: ${FILL_STYLES.join(", ")}.`,
    );
  }
  if (
    value.borderStyle !== undefined &&
    !isOneOf(value.borderStyle, LINE_STYLES)
  ) {
    errors.push(
      `${context}.borderStyle must be one of: ${LINE_STYLES.join(", ")}.`,
    );
  }
  if (value.borderWidth !== undefined && !isPositiveNumber(value.borderWidth)) {
    errors.push(`${context}.borderWidth must be a positive number.`);
  }
  if (value.textAlign !== undefined && !isOneOf(value.textAlign, TEXT_ALIGNS)) {
    errors.push(
      `${context}.textAlign must be one of: ${TEXT_ALIGNS.join(", ")}.`,
    );
  }
  if (value.fontFamily !== undefined && typeof value.fontFamily !== "string") {
    errors.push(`${context}.fontFamily must be a string.`);
  }
}

function validateEdgeStylePatch(
  value: unknown,
  context: string,
  errors: string[],
): void {
  if (!isPlainObject(value)) {
    errors.push(`${context} must be an object.`);
    return;
  }
  pushUnknownKeyErrors(
    value,
    ["arrowStyle", "lineStyle", "lineWidth"],
    context,
    errors,
  );
  if (
    value.arrowStyle !== undefined &&
    !isOneOf(value.arrowStyle, ARROW_STYLES)
  ) {
    errors.push(
      `${context}.arrowStyle must be one of: ${ARROW_STYLES.join(", ")}.`,
    );
  }
  if (value.lineStyle !== undefined && !isOneOf(value.lineStyle, LINE_STYLES)) {
    errors.push(
      `${context}.lineStyle must be one of: ${LINE_STYLES.join(", ")}.`,
    );
  }
  if (value.lineWidth !== undefined && !isPositiveNumber(value.lineWidth)) {
    errors.push(`${context}.lineWidth must be a positive number.`);
  }
}

function validateVisualEffect(
  value: unknown,
  context: string,
  errors: string[],
): void {
  if (!isPlainObject(value)) {
    errors.push(`${context} must be an object.`);
    return;
  }
  if (!isOneOf(value.kind, EFFECT_KINDS)) {
    errors.push(`${context}.kind must be one of: ${EFFECT_KINDS.join(", ")}.`);
    return;
  }

  if (value.kind === "shadow") {
    pushUnknownKeyErrors(
      value,
      ["kind", "dx", "dy", "blur", "color"],
      context,
      errors,
    );
    if (value.dx !== undefined && !isFiniteNumber(value.dx)) {
      errors.push(`${context}.dx must be a finite number.`);
    }
    if (value.dy !== undefined && !isFiniteNumber(value.dy)) {
      errors.push(`${context}.dy must be a finite number.`);
    }
    if (value.blur !== undefined && !isNonNegativeNumber(value.blur)) {
      errors.push(`${context}.blur must be a non-negative number.`);
    }
    if (value.color !== undefined && typeof value.color !== "string") {
      errors.push(`${context}.color must be a string.`);
    }
    return;
  }

  pushUnknownKeyErrors(value, ["kind", "frequency", "scale"], context, errors);
  if (value.frequency !== undefined && !isPositiveNumber(value.frequency)) {
    errors.push(`${context}.frequency must be a positive number.`);
  }
  if (value.scale !== undefined && !isNonNegativeNumber(value.scale)) {
    errors.push(`${context}.scale must be a non-negative number.`);
  }
}

function validateVisualPayload(
  envelopeType: string,
  payload: unknown,
  errors: string[],
): void {
  if (!isPlainObject(payload)) {
    errors.push("payload must be an object for visual commands.");
    return;
  }

  if (payload.op !== envelopeType) {
    errors.push("payload.op must match envelope.type.");
    return;
  }

  switch (payload.op) {
    case "visual.apply_theme":
      pushUnknownKeyErrors(payload, ["op", "themeId"], "payload", errors);
      if (!isNonEmptyString(payload.themeId)) {
        errors.push("payload.themeId must be a non-empty string.");
      } else if (!VISUAL_THEME_IDS.has(payload.themeId)) {
        errors.push(`payload.themeId is unknown: ${payload.themeId}.`);
      }
      return;
    case "visual.set_style":
      pushUnknownKeyErrors(payload, ["op", "patch"], "payload", errors);
      validateVisualStylePatch(payload.patch, "payload.patch", errors);
      return;
    case "visual.apply_display_style":
      pushUnknownKeyErrors(payload, ["op", "styleId"], "payload", errors);
      if (!isNonEmptyString(payload.styleId)) {
        errors.push("payload.styleId must be a non-empty string.");
      } else if (!VISUAL_DISPLAY_STYLE_IDS.has(payload.styleId)) {
        errors.push(`payload.styleId is unknown: ${payload.styleId}.`);
      }
      return;
    case "visual.set_kind":
      pushUnknownKeyErrors(payload, ["op", "kind"], "payload", errors);
      if (!isVisualKind(payload.kind)) {
        errors.push("payload.kind must be a supported visual kind.");
      }
      return;
    case "visual.set_canvas_style":
      pushUnknownKeyErrors(payload, ["op", "canvasStyle"], "payload", errors);
      if (!isOneOf(payload.canvasStyle, CANVAS_STYLES)) {
        errors.push(
          `payload.canvasStyle must be one of: ${CANVAS_STYLES.join(", ")}.`,
        );
      }
      return;
    case "visual.set_aspect_ratio":
      pushUnknownKeyErrors(payload, ["op", "preset"], "payload", errors);
      if (!isOneOf(payload.preset, ASPECT_RATIO_PRESETS)) {
        errors.push(
          `payload.preset must be one of: ${ASPECT_RATIO_PRESETS.join(", ")}.`,
        );
      }
      return;
    case "visual.set_auto_layout":
      pushUnknownKeyErrors(payload, ["op", "enabled"], "payload", errors);
      if (typeof payload.enabled !== "boolean") {
        errors.push("payload.enabled must be a boolean.");
      }
      return;
    case "visual.set_node_style":
      pushUnknownKeyErrors(
        payload,
        ["op", "nodeId", "field", "value"],
        "payload",
        errors,
      );
      if (!isNonEmptyString(payload.nodeId)) {
        errors.push("payload.nodeId must be a non-empty string.");
      }
      if (!isOneOf(payload.field, NODE_STYLE_FIELDS)) {
        errors.push(
          `payload.field must be one of: ${NODE_STYLE_FIELDS.join(", ")}.`,
        );
      }
      if (typeof payload.value !== "string") {
        errors.push("payload.value must be a string.");
      }
      return;
    case "visual.reset_node_style":
      pushUnknownKeyErrors(payload, ["op", "nodeId"], "payload", errors);
      if (!isNonEmptyString(payload.nodeId)) {
        errors.push("payload.nodeId must be a non-empty string.");
      }
      return;
    case "visual.set_node_ext_style":
      pushUnknownKeyErrors(
        payload,
        ["op", "nodeId", "patch"],
        "payload",
        errors,
      );
      if (!isNonEmptyString(payload.nodeId)) {
        errors.push("payload.nodeId must be a non-empty string.");
      }
      validateNodeExtStylePatch(payload.patch, "payload.patch", errors);
      return;
    case "visual.reset_node_ext_style":
      pushUnknownKeyErrors(payload, ["op", "nodeId"], "payload", errors);
      if (!isNonEmptyString(payload.nodeId)) {
        errors.push("payload.nodeId must be a non-empty string.");
      }
      return;
    case "visual.set_node_icon":
      pushUnknownKeyErrors(
        payload,
        ["op", "nodeId", "icon"],
        "payload",
        errors,
      );
      if (!isNonEmptyString(payload.nodeId)) {
        errors.push("payload.nodeId must be a non-empty string.");
      }
      if (!isNonEmptyString(payload.icon)) {
        errors.push("payload.icon must be a non-empty string.");
      }
      return;
    case "visual.clear_node_icon":
      pushUnknownKeyErrors(payload, ["op", "nodeId"], "payload", errors);
      if (!isNonEmptyString(payload.nodeId)) {
        errors.push("payload.nodeId must be a non-empty string.");
      }
      return;
    case "visual.set_node_label":
      pushUnknownKeyErrors(
        payload,
        ["op", "nodeId", "label"],
        "payload",
        errors,
      );
      if (!isNonEmptyString(payload.nodeId)) {
        errors.push("payload.nodeId must be a non-empty string.");
      }
      if (typeof payload.label !== "string") {
        errors.push("payload.label must be a string.");
      }
      return;
    case "visual.set_edge_style":
      pushUnknownKeyErrors(
        payload,
        ["op", "edgeId", "patch"],
        "payload",
        errors,
      );
      if (!isNonEmptyString(payload.edgeId)) {
        errors.push("payload.edgeId must be a non-empty string.");
      }
      validateEdgeStylePatch(payload.patch, "payload.patch", errors);
      return;
    case "visual.set_all_edges_style":
      pushUnknownKeyErrors(payload, ["op", "patch"], "payload", errors);
      validateEdgeStylePatch(payload.patch, "payload.patch", errors);
      return;
    case "visual.set_effect":
      pushUnknownKeyErrors(payload, ["op", "effect"], "payload", errors);
      validateVisualEffect(payload.effect, "payload.effect", errors);
      return;
    case "visual.clear_effect":
      pushUnknownKeyErrors(payload, ["op", "kind"], "payload", errors);
      if (!isOneOf(payload.kind, EFFECT_KINDS)) {
        errors.push(`payload.kind must be one of: ${EFFECT_KINDS.join(", ")}.`);
      }
      return;
    case "visual.merge_content":
      pushUnknownKeyErrors(payload, ["op", "newVisual"], "payload", errors);
      if (!safeParseVisual(payload.newVisual).success) {
        errors.push("payload.newVisual must be a schema-valid visual.");
      }
      return;
    // --- lifecycle operations (#446) ---
    case "visual.add_node":
      pushUnknownKeyErrors(payload, ["op", "node"], "payload", errors);
      if (!isPlainObject(payload.node)) {
        errors.push("payload.node must be an object.");
      }
      return;
    case "visual.delete_node":
      pushUnknownKeyErrors(payload, ["op", "nodeId"], "payload", errors);
      if (!isNonEmptyString(payload.nodeId)) {
        errors.push("payload.nodeId must be a non-empty string.");
      }
      return;
    case "visual.add_edge":
      pushUnknownKeyErrors(payload, ["op", "edge"], "payload", errors);
      if (!isPlainObject(payload.edge)) {
        errors.push("payload.edge must be an object.");
      }
      return;
    case "visual.delete_edge":
      pushUnknownKeyErrors(payload, ["op", "edgeId"], "payload", errors);
      if (!isNonEmptyString(payload.edgeId)) {
        errors.push("payload.edgeId must be a non-empty string.");
      }
      return;
    case "visual.reconnect_edge":
      pushUnknownKeyErrors(
        payload,
        ["op", "edgeId", "fromNodeId", "toNodeId"],
        "payload",
        errors,
      );
      if (!isNonEmptyString(payload.edgeId)) {
        errors.push("payload.edgeId must be a non-empty string.");
      }
      return;
    case "visual.duplicate_node":
      pushUnknownKeyErrors(
        payload,
        ["op", "nodeId", "newNodeId"],
        "payload",
        errors,
      );
      if (!isNonEmptyString(payload.nodeId)) {
        errors.push("payload.nodeId must be a non-empty string.");
      }
      return;
    case "visual.relayout_graph":
      pushUnknownKeyErrors(payload, ["op"], "payload", errors);
      return;
    default:
      errors.push(`Unsupported visual payload op: ${String(payload.op)}.`);
  }
}

function validateSourceRef(value: unknown, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push("payload.sourceRef must be an object.");
    return;
  }
  pushUnknownKeyErrors(
    value,
    [
      "documentId",
      "blockId",
      "contentHash",
      "linkedAt",
      "unlinked",
      "blockKind",
    ],
    "payload.sourceRef",
    errors,
  );
  if (!isNonEmptyString(value.documentId)) {
    errors.push("payload.sourceRef.documentId must be a non-empty string.");
  }
  if (!isNonEmptyString(value.blockId)) {
    errors.push("payload.sourceRef.blockId must be a non-empty string.");
  }
  if (!isNonEmptyString(value.linkedAt)) {
    errors.push("payload.sourceRef.linkedAt must be a non-empty string.");
  }
  if (value.contentHash !== undefined && !isNonEmptyString(value.contentHash)) {
    errors.push(
      "payload.sourceRef.contentHash must be a non-empty string when provided.",
    );
  }
  if (value.unlinked !== undefined && typeof value.unlinked !== "boolean") {
    errors.push("payload.sourceRef.unlinked must be a boolean when provided.");
  }
  if (!isOneOf(value.blockKind, ["text", "visual"] as const)) {
    errors.push('payload.sourceRef.blockKind must be "text" or "visual".');
  }
}

function validateSlideCommandPayload(
  payload: unknown,
  target: CommandTarget,
  errors: string[],
): void {
  if (!isPlainObject(payload)) {
    errors.push("Deck command payloads must be objects.");
    return;
  }

  if (!isOneOf(payload.type, SLIDE_COMMAND_TYPES)) {
    errors.push(
      `payload.type must be a supported SlideCommand (${SLIDE_COMMAND_TYPES.join(", ")}).`,
    );
    return;
  }

  if (payload.commandId !== undefined && !isNonEmptyString(payload.commandId)) {
    errors.push("payload.commandId must be a non-empty string when provided.");
  }
  if (
    payload.coalesceKey !== undefined &&
    !isNonEmptyString(payload.coalesceKey)
  ) {
    errors.push(
      "payload.coalesceKey must be a non-empty string when provided.",
    );
  }

  switch (payload.type) {
    case "ADD_SLIDE":
      if (
        payload.afterSlideId !== undefined &&
        payload.afterSlideId !== null &&
        !isNonEmptyString(payload.afterSlideId)
      ) {
        errors.push("payload.afterSlideId must be a non-empty string or null.");
      }
      break;
    case "REMOVE_SLIDE":
    case "DUPLICATE_SLIDE":
    case "UPDATE_SLIDE_TITLE":
    case "UPDATE_SLIDE_BODY":
    case "UPDATE_SLIDE_NOTES":
    case "UPDATE_SLIDE_LAYOUT_HINT":
    case "SET_SLIDE_BACKGROUND":
    case "SET_SLIDE_BACKGROUND_GRADIENT":
    case "SET_SLIDE_BACKGROUND_IMAGE":
    case "SET_SLIDE_BACKGROUND_ASSET":
    case "SET_SLIDE_ACCENT":
      if (!isNonEmptyString(payload.slideId)) {
        errors.push("payload.slideId must be a non-empty string.");
      }
      break;
  }

  switch (payload.type) {
    case "REORDER_SLIDE":
      if (!isNonEmptyString(payload.slideId)) {
        errors.push("payload.slideId must be a non-empty string.");
      }
      if (!isInteger(payload.toIndex)) {
        errors.push("payload.toIndex must be an integer.");
      }
      break;
    case "UPDATE_SLIDE":
      if (!isNonEmptyString(payload.slideId)) {
        errors.push("payload.slideId must be a non-empty string.");
      }
      if (!isPlainObject(payload.patch)) {
        errors.push("payload.patch must be an object.");
      }
      break;
    case "ADD_ELEMENT":
      if (!isNonEmptyString(payload.slideId)) {
        errors.push("payload.slideId must be a non-empty string.");
      }
      if (!isPlainObject(payload.element)) {
        errors.push("payload.element must be an object.");
      }
      break;
    case "UPDATE_ELEMENT":
      if (!isNonEmptyString(payload.slideId)) {
        errors.push("payload.slideId must be a non-empty string.");
      }
      if (!isNonEmptyString(payload.elementId)) {
        errors.push("payload.elementId must be a non-empty string.");
      }
      if (!isPlainObject(payload.patch)) {
        errors.push("payload.patch must be an object.");
      }
      break;
    case "REMOVE_ELEMENT":
    case "DUPLICATE_ELEMENT":
    case "BRING_ELEMENT_TO_FRONT":
    case "SEND_ELEMENT_TO_BACK":
    case "SET_ELEMENT_HIDDEN":
    case "SET_ELEMENT_LOCKED":
    case "MOVE_ELEMENT_ZORDER":
    case "RENAME_ELEMENT":
    case "UNLINK_ELEMENT_SOURCE":
    case "REMOVE_SOURCE_ELEMENT":
      if (!isNonEmptyString(payload.slideId)) {
        errors.push("payload.slideId must be a non-empty string.");
      }
      if (!isNonEmptyString(payload.elementId)) {
        errors.push("payload.elementId must be a non-empty string.");
      }
      break;
    case "REFRESH_ELEMENT_FROM_SOURCE":
    case "RELINK_ELEMENT_SOURCE":
      if (!isNonEmptyString(payload.slideId)) {
        errors.push("payload.slideId must be a non-empty string.");
      }
      if (!isNonEmptyString(payload.elementId)) {
        errors.push("payload.elementId must be a non-empty string.");
      }
      validateSourceRef(payload.sourceRef, errors);
      break;
    case "MOVE_SLIDE":
      if (!isInteger(payload.slideIndex)) {
        errors.push("payload.slideIndex must be an integer.");
      }
      if (!isFiniteNumber(payload.direction)) {
        errors.push("payload.direction must be a finite number.");
      }
      break;
    case "INSERT_TEMPLATE_SLIDE":
      if (!isPlainObject(payload.slide)) {
        errors.push("payload.slide must be an object.");
      }
      if (payload.afterIndex !== undefined && !isInteger(payload.afterIndex)) {
        errors.push("payload.afterIndex must be an integer when provided.");
      }
      break;
    case "UPDATE_SLIDE_TITLE":
      if (typeof payload.title !== "string") {
        errors.push("payload.title must be a string.");
      }
      break;
    case "UPDATE_SLIDE_BODY":
      if (!isStringArray(payload.bullets)) {
        errors.push("payload.bullets must be an array of strings.");
      }
      break;
    case "UPDATE_SLIDE_NOTES":
      if (typeof payload.notes !== "string") {
        errors.push("payload.notes must be a string.");
      }
      break;
    case "UPDATE_SLIDE_LAYOUT_HINT":
      if (!isNonEmptyString(payload.layout)) {
        errors.push("payload.layout must be a non-empty string.");
      }
      break;
    case "APPLY_SLIDE_LAYOUT":
    case "RESET_SLIDE_LAYOUT":
      if (!isInteger(payload.slideIndex)) {
        errors.push("payload.slideIndex must be an integer.");
      }
      if (!isPlainObject(payload.layout)) {
        errors.push("payload.layout must be an object.");
      }
      break;
    case "REMOVE_ELEMENTS":
    case "DUPLICATE_ELEMENTS":
    case "GROUP_ELEMENTS":
    case "ALIGN_ELEMENTS":
    case "DISTRIBUTE_ELEMENTS":
    case "MATCH_SIZE_ELEMENTS":
    case "ARRANGE_ELEMENTS":
    case "NUDGE_ELEMENTS":
      if (!isNonEmptyString(payload.slideId)) {
        errors.push("payload.slideId must be a non-empty string.");
      }
      if (!isStringArray(payload.elementIds)) {
        errors.push("payload.elementIds must be an array of strings.");
      }
      break;
    case "UNGROUP_ELEMENTS":
      if (!isNonEmptyString(payload.slideId)) {
        errors.push("payload.slideId must be a non-empty string.");
      }
      if (!isNonEmptyString(payload.groupId)) {
        errors.push("payload.groupId must be a non-empty string.");
      }
      break;
    case "ALIGN_ELEMENTS":
    case "DISTRIBUTE_ELEMENTS":
    case "MATCH_SIZE_ELEMENTS":
    case "ARRANGE_ELEMENTS":
      if (!isNonEmptyString(payload.mode)) {
        errors.push("payload.mode must be a non-empty string.");
      }
      break;
    case "NUDGE_ELEMENTS":
      if (!isFiniteNumber(payload.dx)) {
        errors.push("payload.dx must be a finite number.");
      }
      if (!isFiniteNumber(payload.dy)) {
        errors.push("payload.dy must be a finite number.");
      }
      break;
    case "SET_ELEMENT_BOXES":
      if (!isNonEmptyString(payload.slideId)) {
        errors.push("payload.slideId must be a non-empty string.");
      }
      if (!isPlainObject(payload.boxesById)) {
        errors.push("payload.boxesById must be an object.");
      } else {
        for (const [key, value] of Object.entries(payload.boxesById)) {
          if (!isNonEmptyString(key)) {
            errors.push("payload.boxesById keys must be non-empty strings.");
          }
          validateElementBox(value, `payload.boxesById.${key}`, errors);
        }
      }
      break;
    case "SET_ELEMENT_PATCHES":
      if (!isNonEmptyString(payload.slideId)) {
        errors.push("payload.slideId must be a non-empty string.");
      }
      if (!isPlainObject(payload.patchesById)) {
        errors.push("payload.patchesById must be an object.");
      }
      break;
    case "SET_ELEMENT_HIDDEN":
      if (typeof payload.hidden !== "boolean") {
        errors.push("payload.hidden must be a boolean.");
      }
      break;
    case "SET_ELEMENT_LOCKED":
      if (typeof payload.locked !== "boolean") {
        errors.push("payload.locked must be a boolean.");
      }
      break;
    case "MOVE_ELEMENT_ZORDER":
      if (payload.direction !== "up" && payload.direction !== "down") {
        errors.push('payload.direction must be "up" or "down".');
      }
      break;
    case "RENAME_ELEMENT":
      if (typeof payload.name !== "string") {
        errors.push("payload.name must be a string.");
      }
      break;
    case "SET_DECK_THEME":
      if (!isNonEmptyString(payload.theme)) {
        errors.push("payload.theme must be a non-empty string.");
      }
      break;
    case "SET_DECK_FORMAT":
      if (!isNonEmptyString(payload.slideFormat)) {
        errors.push("payload.slideFormat must be a non-empty string.");
      }
      break;
    case "SET_SLIDE_BACKGROUND":
      if (
        payload.background !== undefined &&
        typeof payload.background !== "string"
      ) {
        errors.push("payload.background must be a string or undefined.");
      }
      break;
    case "SET_SLIDE_BACKGROUND_GRADIENT":
      validateGradient(payload.gradient, "payload.gradient", errors);
      break;
    case "SET_SLIDE_BACKGROUND_IMAGE":
      if (payload.image !== undefined && typeof payload.image !== "string") {
        errors.push("payload.image must be a string or undefined.");
      }
      break;
    case "SET_SLIDE_BACKGROUND_ASSET":
      validateAssetOptions(payload.opts, "payload.opts", errors);
      break;
    case "SET_SLIDE_ACCENT":
      if (payload.accent !== undefined && typeof payload.accent !== "string") {
        errors.push("payload.accent must be a string or undefined.");
      }
      break;
  }

  const payloadSlideId =
    typeof payload.slideId === "string" ? payload.slideId : undefined;
  const payloadElementId =
    typeof payload.elementId === "string" ? payload.elementId : undefined;
  if (
    target.slideId !== undefined &&
    payloadSlideId !== undefined &&
    target.slideId !== payloadSlideId
  ) {
    errors.push("target.slideId must match payload.slideId.");
  }
  if (
    target.elementId !== undefined &&
    payloadElementId !== undefined &&
    target.elementId !== payloadElementId
  ) {
    errors.push("target.elementId must match payload.elementId.");
  }
}

function validateTarget(target: unknown): {
  surface?: CommandTargetSurface;
  errors: string[];
} {
  const errors: string[] = [];
  if (!isPlainObject(target)) {
    return { errors: ["target must be an object."] };
  }

  pushUnknownKeyErrors(
    target,
    [
      "surface",
      "documentId",
      "visualId",
      "slideId",
      "elementId",
      "assetId",
      "commentId",
      "sourceRefId",
      "expectedRevision",
      "expectedSourceHash",
    ],
    "target",
    errors,
  );

  if (!isOneOf(target.surface, COMMAND_SURFACES)) {
    errors.push(
      `target.surface must be one of: ${COMMAND_SURFACES.join(", ")}.`,
    );
    return { errors };
  }

  for (const key of [
    "documentId",
    "visualId",
    "slideId",
    "elementId",
    "assetId",
    "commentId",
    "sourceRefId",
    "expectedRevision",
    "expectedSourceHash",
  ] as const) {
    const value = target[key];
    if (value !== undefined && !isNonEmptyString(value)) {
      errors.push(`target.${key} must be a non-empty string when provided.`);
    }
  }

  switch (target.surface) {
    case "document":
      if (!isNonEmptyString(target.documentId)) {
        errors.push("target.documentId is required for document commands.");
      }
      break;
    case "visual":
      if (!isNonEmptyString(target.visualId)) {
        errors.push("target.visualId is required for visual commands.");
      }
      break;
    case "deck":
      if (!isNonEmptyString(target.documentId)) {
        errors.push("target.documentId is required for deck commands.");
      }
      break;
    case "asset":
      if (!isNonEmptyString(target.assetId)) {
        errors.push("target.assetId is required for asset commands.");
      }
      break;
    case "comment":
      if (!isNonEmptyString(target.commentId)) {
        errors.push("target.commentId is required for comment commands.");
      }
      break;
    case "source-ref":
      if (!isNonEmptyString(target.sourceRefId)) {
        errors.push("target.sourceRefId is required for source-ref commands.");
      }
      break;
  }

  return { surface: target.surface, errors };
}

export function makeAffectedIds(
  partial: Partial<CommandAffectedIds> = {},
): CommandAffectedIds {
  return {
    documentIds: uniqueStrings(partial.documentIds),
    visualIds: uniqueStrings(partial.visualIds),
    slideIds: uniqueStrings(partial.slideIds),
    elementIds: uniqueStrings(partial.elementIds),
    assetIds: uniqueStrings(partial.assetIds),
    commentIds: uniqueStrings(partial.commentIds),
    sourceRefIds: uniqueStrings(partial.sourceRefIds),
    nodeIds: uniqueStrings(partial.nodeIds),
    edgeIds: uniqueStrings(partial.edgeIds),
  };
}

export function makeSideEffects<T extends { kind: string }>(
  ...effects: Array<T | false | null | undefined>
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const effect of effects) {
    if (!effect) {
      continue;
    }
    const key = JSON.stringify(effect);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(effect);
  }
  return result;
}

export function validateCommandEnvelope(
  env: CommandEnvelope<unknown>,
): ValidationResult {
  const errors: string[] = [];
  if (!isPlainObject(env)) {
    return { valid: false, errors: ["Command envelope must be an object."] };
  }

  if (typeof env.id !== "string" || !UUID_V4_PATTERN.test(env.id)) {
    errors.push("id must be a UUID v4 string.");
  }
  if (!Number.isInteger(env.schemaVersion) || env.schemaVersion <= 0) {
    errors.push("schemaVersion must be a positive integer.");
  }
  if (!isNonEmptyString(env.type)) {
    errors.push("type must be a non-empty string.");
  }
  if (
    typeof env.timestamp !== "string" ||
    Number.isNaN(Date.parse(env.timestamp))
  ) {
    errors.push("timestamp must be a valid ISO-8601 string.");
  }

  if (!isPlainObject(env.actor)) {
    errors.push("actor must be an object.");
  } else {
    if (!isNonEmptyString(env.actor.id)) {
      errors.push("actor.id must be a non-empty string.");
    }
    if (
      env.actor.sessionId !== undefined &&
      !isNonEmptyString(env.actor.sessionId)
    ) {
      errors.push("actor.sessionId must be a non-empty string when provided.");
    }
  }

  const targetValidation = validateTarget(env.target);
  errors.push(...targetValidation.errors);

  if (env.payload === undefined) {
    errors.push("payload must be present.");
  }

  if (env.coalesceKey !== undefined && !isNonEmptyString(env.coalesceKey)) {
    errors.push("coalesceKey must be a non-empty string when provided.");
  }
  if (env.source !== undefined && !isOneOf(env.source, COMMAND_SOURCES)) {
    errors.push(`source must be one of: ${COMMAND_SOURCES.join(", ")}.`);
  }

  const envelopeType = typeof env.type === "string" ? env.type : "";
  const looksVisual =
    envelopeType.startsWith("visual.") || targetValidation.surface === "visual";
  if (looksVisual) {
    if (targetValidation.surface !== "visual") {
      errors.push("Visual command envelopes must target the visual surface.");
    }
    validateVisualPayload(envelopeType, env.payload, errors);
  } else if (targetValidation.surface === "deck") {
    validateSlideCommandPayload(env.payload, env.target, errors);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Structured rejection codes for {@link acceptDeckCommandEnvelope}. Stable so
 * the server action layer can log and branch on them.
 */
export type EnvelopeRejectionCode =
  | "malformed"
  | "unsupported_schema_version"
  | "wrong_target"
  | "wrong_document";

export interface EnvelopeAcceptance {
  ok: boolean;
  errors: string[];
  /** Present only when `ok` is `false`. */
  code?: EnvelopeRejectionCode;
}

/**
 * Server-side acceptance check for a deck-command envelope, layered on top of
 * the pure structural {@link validateCommandEnvelope}.
 *
 * Rejects — with a stable {@link EnvelopeRejectionCode} — before any
 * persistence:
 *  - malformed envelopes (structural validation failure),
 *  - unsupported / future command schema versions,
 *  - envelopes addressed to the wrong target surface (must be `deck`),
 *  - envelopes addressed to a different document than the request.
 *
 * It intentionally does **not** perform optimistic-revision (CAS) checks: those
 * stay in the persistence layer (`persistDeck` / `patchDeck`) keyed on the
 * deck revision token. `target.expectedRevision`, when present, is forwarded by
 * the caller as the CAS `clientToken`.
 */
export function acceptDeckCommandEnvelope(
  env: CommandEnvelope<unknown>,
  context: { documentId: string },
): EnvelopeAcceptance {
  const structural = validateCommandEnvelope(env);
  if (!structural.valid) {
    return { ok: false, code: "malformed", errors: structural.errors };
  }
  if (env.schemaVersion > CURRENT_COMMAND_SCHEMA_VERSION) {
    return {
      ok: false,
      code: "unsupported_schema_version",
      errors: [
        `schemaVersion ${env.schemaVersion} exceeds supported ${CURRENT_COMMAND_SCHEMA_VERSION}.`,
      ],
    };
  }
  if (env.target.surface !== "deck") {
    return {
      ok: false,
      code: "wrong_target",
      errors: [
        `Deck command entry point requires target.surface "deck", got "${env.target.surface}".`,
      ],
    };
  }
  if (env.target.documentId !== context.documentId) {
    return {
      ok: false,
      code: "wrong_document",
      errors: [
        `Command targets document "${env.target.documentId ?? "(none)"}" but was submitted to "${context.documentId}".`,
      ],
    };
  }
  return { ok: true, errors: [] };
}

export function adaptSlideCommandResult(
  result: SlideCommandResult,
  target: Pick<CommandTarget, "documentId"> = {},
): CrossSurfaceCommandResult<DeckPatch> {
  return {
    ok: result.ok,
    ...(result.error ? { error: result.error } : {}),
    affectedIds: makeAffectedIds({
      ...(target.documentId ? { documentIds: [target.documentId] } : {}),
      slideIds: result.affectedSlideIds,
      elementIds: result.affectedElementIds,
    }),
    ...(result.historyKey ? { coalesceKey: result.historyKey } : {}),
    patches: result.patches,
    sideEffects: [],
  };
}
