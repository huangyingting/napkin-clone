import { NextResponse } from "next/server";

export interface JsonObjectRequest {
  json(): Promise<unknown>;
  headers?: Headers;
}

export interface FormDataRequest {
  formData(): Promise<FormData>;
  headers?: Headers;
}

export function legacyErrorResponse(
  status: number,
  message: string,
  headers?: HeadersInit,
): NextResponse {
  return NextResponse.json({ error: message }, { status, headers });
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requestContentLength(request: {
  headers?: Headers;
}): number | null {
  const raw = request.headers?.get("content-length")?.trim();
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function rejectOversizedBody(
  request: { headers?: Headers },
  maxBytes: number,
  message = "Request body is too large.",
): NextResponse | null {
  const contentLength = requestContentLength(request);
  if (contentLength !== null && contentLength > maxBytes) {
    return legacyErrorResponse(413, message);
  }
  return null;
}

export async function readJsonObject(
  request: JsonObjectRequest,
  options: { maxBytes?: number; tooLargeMessage?: string } = {},
): Promise<
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: NextResponse }
> {
  if (options.maxBytes !== undefined) {
    const tooLarge = rejectOversizedBody(
      request,
      options.maxBytes,
      options.tooLargeMessage,
    );
    if (tooLarge) return { ok: false, response: tooLarge };
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      response: legacyErrorResponse(400, "Request body must be valid JSON."),
    };
  }
  if (!isPlainObject(body)) {
    return {
      ok: false,
      response: legacyErrorResponse(400, "Request body must be a JSON object."),
    };
  }
  return { ok: true, body };
}

export async function readJsonValue(
  request: JsonObjectRequest,
  invalidMessage = "Request body must be valid JSON.",
  options: { maxBytes?: number; tooLargeMessage?: string } = {},
): Promise<
  { ok: true; body: unknown } | { ok: false; response: NextResponse }
> {
  if (options.maxBytes !== undefined) {
    const tooLarge = rejectOversizedBody(
      request,
      options.maxBytes,
      options.tooLargeMessage,
    );
    if (tooLarge) return { ok: false, response: tooLarge };
  }
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false, response: legacyErrorResponse(400, invalidMessage) };
  }
}

export async function readFormData(
  request: FormDataRequest,
  invalidMessage = "Request must be multipart/form-data.",
  createErrorResponse: (message: string) => NextResponse = (message) =>
    legacyErrorResponse(400, message),
  options: { maxBytes?: number; tooLargeMessage?: string } = {},
): Promise<
  { ok: true; formData: FormData } | { ok: false; response: NextResponse }
> {
  if (options.maxBytes !== undefined) {
    const tooLarge = rejectOversizedBody(
      request,
      options.maxBytes,
      options.tooLargeMessage,
    );
    if (tooLarge) return { ok: false, response: tooLarge };
  }
  try {
    return { ok: true, formData: await request.formData() };
  } catch {
    return { ok: false, response: createErrorResponse(invalidMessage) };
  }
}

export function requiredSearchParam(
  url: string | URL,
  name: string,
): string | null {
  const value = new URL(url).searchParams.get(name)?.trim();
  return value ? value : null;
}

export function retryAfterHeader(retryAfterSeconds: number): HeadersInit {
  return { "Retry-After": String(retryAfterSeconds) };
}

export function privateImmutableCacheHeaders(
  contentType: string,
): Record<string, string> {
  return {
    "Content-Type": contentType,
    "Cache-Control": "private, max-age=31536000, immutable",
  };
}

export function plainTextResponse(body: string, status: number): NextResponse {
  return new NextResponse(body, { status });
}
