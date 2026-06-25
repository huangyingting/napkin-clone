import {
  CURRENT_COMMAND_SCHEMA_VERSION,
  type CommandEnvelope,
} from "./envelope-core";
import { validateCommandEnvelope } from "./command-envelope-validation";

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

export function acceptDeckCommandEnvelope(
  env: CommandEnvelope<unknown>,
  context: { documentId: string },
): EnvelopeAcceptance {
  if (env.schemaVersion !== CURRENT_COMMAND_SCHEMA_VERSION) {
    return {
      ok: false,
      code: "unsupported_schema_version",
      errors: [`schemaVersion must equal ${CURRENT_COMMAND_SCHEMA_VERSION}.`],
    };
  }

  const structural = validateCommandEnvelope(env);
  if (!structural.valid) {
    return { ok: false, code: "malformed", errors: structural.errors };
  }
  if (env.target.surface !== "deck") {
    return {
      ok: false,
      code: "wrong_target",
      errors: ["Deck command entry point requires target.surface deck."],
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
