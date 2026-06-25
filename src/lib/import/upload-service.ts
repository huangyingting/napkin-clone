import "server-only";

import { uploadValidationStatus } from "@/lib/api/errors";
import { ABUSE_CATEGORIES, logRouteDenial } from "@/lib/diagnostics/api-abuse";
import { logError } from "@/lib/log";

import { parseImportedFile } from "./index";
import { ParseTimeoutError, withTimeout } from "./timeout";
import {
  formatValidationError,
  validateImportFile,
  type AcceptedMimeType,
  type ValidationResult,
} from "./validate";

const LOG_SCOPE = "api.import";

type ImportUploadStatus = 400 | 413 | 415 | 422;

export type ImportUploadResult =
  | { ok: true; markdown: string }
  | { ok: false; status: ImportUploadStatus; error: string };

type ParseImportedFile = (
  mime: AcceptedMimeType,
  buffer: Buffer,
) => Promise<string>;

interface ImportUploadDeps {
  validateImportFile(
    mimeType: string,
    filename: string,
    byteSize: number,
  ): ValidationResult;
  readFile(file: File): Promise<Buffer>;
  parseImportedFile: ParseImportedFile;
  withTimeout<T>(factory: () => Promise<T>): Promise<T>;
  logError(
    scope: string,
    error: unknown,
    context?: Record<string, unknown>,
  ): void;
  logRouteDenial: typeof logRouteDenial;
}

const defaultDeps: ImportUploadDeps = {
  validateImportFile,
  readFile: async (file) => Buffer.from(await file.arrayBuffer()),
  parseImportedFile,
  withTimeout,
  logError,
  logRouteDenial,
};

export async function processImportUpload(
  file: File,
  options: {
    subjectHash: string;
    deps?: Partial<ImportUploadDeps>;
  },
): Promise<ImportUploadResult> {
  const deps = { ...defaultDeps, ...options.deps };
  const validation = deps.validateImportFile(file.type, file.name, file.size);
  if (!validation.ok) {
    return {
      ok: false,
      error: formatValidationError(validation.error),
      status: uploadValidationStatus(validation.error),
    };
  }

  let buffer: Buffer;
  try {
    buffer = await deps.readFile(file);
  } catch (error) {
    deps.logError(LOG_SCOPE, error, { reason: "read-file", status: 400 });
    return {
      ok: false,
      error: "Failed to read the uploaded file.",
      status: 400,
    };
  }

  try {
    const markdown = await deps.withTimeout(() =>
      deps.parseImportedFile(validation.mime, buffer),
    );

    if (!markdown.trim()) {
      return {
        ok: false,
        error: "No readable text was found in the uploaded file.",
        status: 422,
      };
    }

    return { ok: true, markdown };
  } catch (error) {
    if (error instanceof ParseTimeoutError) {
      deps.logError(LOG_SCOPE, error, { reason: "parse-timeout", status: 422 });
      deps.logRouteDenial({
        route: LOG_SCOPE,
        reason: ABUSE_CATEGORIES.PARSER_TIMEOUT,
        status: 422,
        subjectHash: options.subjectHash,
      });
      return {
        ok: false,
        error:
          "The file took too long to parse. Try a smaller or simpler document.",
        status: 422,
      };
    }

    deps.logError(LOG_SCOPE, error, { reason: "parse-failed", status: 422 });
    return {
      ok: false,
      error:
        "Could not parse the file. Make sure it is a valid, uncorrupted document.",
      status: 422,
    };
  }
}
