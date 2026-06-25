import { logError } from "@/lib/log";

import {
  CURRENT_COMMAND_SCHEMA_VERSION,
  validateCommandEnvelope,
  type CommandEnvelope,
} from "@/lib/commands/command-envelope";
import type { VisualCommand } from "@/lib/commands/visual-commands";
import { buildCommandValidationContext } from "@/lib/diagnostics/domain-events";
import {
  commandDiagnosticUnsupported,
  logDiagnostic,
} from "@/lib/diagnostics/error-codes";

export interface VisualCommandContext {
  documentId: string;
  visualId: string;
  visualExists: boolean;
  actorDocumentId?: string;
  currentRevision?: string | null;
}

export interface DeckCommandContext {
  documentId: string;
  deckExists: boolean;
  actorDocumentId?: string;
  currentRevision?: string | null;
}

export interface CommandValidationResult {
  valid: boolean;
  errorCode?:
    | "unauthorized"
    | "stale_revision"
    | "invalid_command"
    | "unsupported_command"
    | "missing_target"
    | "schema_mismatch";
  errorMessage?: string;
}

function ok(): CommandValidationResult {
  return { valid: true };
}

function invalid(
  errorCode: NonNullable<CommandValidationResult["errorCode"]>,
  errorMessage: string,
): CommandValidationResult {
  return { valid: false, errorCode, errorMessage };
}

export function validateVisualCommand(
  cmd: VisualCommand,
  ctx: VisualCommandContext,
): CommandValidationResult {
  if (cmd.schemaVersion > CURRENT_COMMAND_SCHEMA_VERSION) {
    return invalid(
      "unsupported_command",
      `Unsupported command schema version ${cmd.schemaVersion}.`,
    );
  }

  const envelope = validateCommandEnvelope(cmd);
  if (!envelope.valid) {
    return invalid("invalid_command", envelope.errors.join(" "));
  }

  if (cmd.target.surface !== "visual") {
    return invalid(
      "invalid_command",
      "Visual commands must target the visual surface.",
    );
  }

  if (ctx.actorDocumentId && ctx.actorDocumentId !== ctx.documentId) {
    return invalid(
      "unauthorized",
      "Actor authorization does not match the requested document.",
    );
  }

  if (
    cmd.target.documentId !== undefined &&
    cmd.target.documentId !== ctx.documentId
  ) {
    return invalid(
      "unauthorized",
      "Command target document does not match the requested document.",
    );
  }

  if (!ctx.visualExists) {
    return invalid("missing_target", `Visual ${ctx.visualId} was not found.`);
  }

  if (cmd.target.visualId !== ctx.visualId) {
    return invalid(
      "unauthorized",
      "Command target visual does not match the requested visual.",
    );
  }

  if (
    cmd.target.expectedRevision &&
    ctx.currentRevision &&
    cmd.target.expectedRevision !== ctx.currentRevision
  ) {
    return invalid(
      "stale_revision",
      "Command revision does not match the current revision.",
    );
  }

  return ok();
}

export function validateDeckCommand(
  cmd: CommandEnvelope<unknown>,
  ctx: DeckCommandContext,
): CommandValidationResult {
  if (cmd.schemaVersion > CURRENT_COMMAND_SCHEMA_VERSION) {
    return invalid(
      "unsupported_command",
      `Unsupported command schema version ${cmd.schemaVersion}.`,
    );
  }

  const envelope = validateCommandEnvelope(cmd);
  if (!envelope.valid) {
    return invalid("invalid_command", envelope.errors.join(" "));
  }

  if (cmd.target.surface !== "deck") {
    return invalid(
      "invalid_command",
      "Deck commands must target the deck surface.",
    );
  }

  if (ctx.actorDocumentId && ctx.actorDocumentId !== ctx.documentId) {
    return invalid(
      "unauthorized",
      "Actor authorization does not match the requested document.",
    );
  }

  if (
    cmd.target.documentId !== undefined &&
    cmd.target.documentId !== ctx.documentId
  ) {
    return invalid(
      "unauthorized",
      "Command target document does not match the requested document.",
    );
  }

  if (!ctx.deckExists) {
    return invalid(
      "missing_target",
      `Deck for document ${ctx.documentId} was not found.`,
    );
  }

  if (
    cmd.target.expectedRevision &&
    ctx.currentRevision &&
    cmd.target.expectedRevision !== ctx.currentRevision
  ) {
    return invalid(
      "stale_revision",
      "Command revision does not match the current revision.",
    );
  }

  return ok();
}

export function logCommandValidationFailure(
  scope: string,
  result: CommandValidationResult,
  cmd: CommandEnvelope<unknown>,
  context: Record<string, unknown> = {},
): void {
  if (result.valid) {
    return;
  }

  const error = new Error(result.errorMessage ?? "Command validation failed.");
  const telemetry = buildCommandValidationContext({
    ...context,
    commandId: cmd.id,
    commandType: cmd.type,
    commandSurface: cmd.target.surface,
    schemaVersion: cmd.schemaVersion,
    documentId: cmd.target.documentId,
    visualId: cmd.target.visualId,
    slideId: cmd.target.slideId,
    elementId: cmd.target.elementId,
    errorCode: result.errorCode,
  });

  if (result.errorCode === "unsupported_command") {
    logDiagnostic(commandDiagnosticUnsupported(cmd.type, telemetry), error);
    return;
  }

  logError(scope, error, telemetry);
}
