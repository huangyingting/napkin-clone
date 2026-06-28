import type { PayloadParseResult } from "@/lib/ai/generation-route";

export interface CollabFlushPayload {
  documentId: string;
  update: string;
}

export function isValidBase64(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  const buf = Buffer.from(value, "base64");
  return buf.length > 0 && buf.toString("base64") === value;
}

export function parseCollabFlushPayload(
  body: unknown,
): PayloadParseResult<CollabFlushPayload> {
  const payload = body as {
    documentId?: unknown;
    update?: unknown;
  };
  const documentId =
    typeof payload.documentId === "string" && payload.documentId.trim()
      ? payload.documentId.trim()
      : null;

  if (!documentId) {
    return { ok: false, status: 400, message: "Missing documentId." };
  }

  if (!isValidBase64(payload.update)) {
    return { ok: false, status: 400, message: "Missing or invalid update." };
  }

  return { ok: true, payload: { documentId, update: payload.update } };
}
