import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  AzureConfigError,
  azureChatComplete,
  getAzureConfig,
  type AzureCompleteOptions,
  type AzureConfig,
} from "@/lib/ai/azure";
import {
  GENERATE_TIMEOUT_MS,
  GenerateTimeoutError,
  withAbortDeadline,
} from "@/lib/ai/deadline";
import {
  ANON_COOKIE_NAME,
  anonTrialLimit,
  checkRateLimitWithStore,
  newAnonState,
  parseAnonCookie,
  signAnonState,
  userRateLimit,
  userRateWindowMs,
  type AnonState,
  type RateLimitStore,
} from "@/lib/ai/quota";
import type { ChatMessage } from "@/lib/ai/prompt";
import { InsufficientCreditsError } from "@/lib/billing/credits";
import {
  captureMeteredUsage,
  refundMeteredUsage,
  reserveMeteredUsage,
  type CaptureMeteredUsageResult,
  type MeteredUsageReservation,
  type ReserveMeteredUsageResult,
} from "@/lib/billing/metered-usage";
import { ABUSE_CATEGORIES, logRouteDenial } from "@/lib/diagnostics/api-abuse";
import { auth as authEnv } from "@/lib/env";
import { logError } from "@/lib/log";
import {
  anonIpRateLimit,
  anonIpRateWindowMs,
  getClientIp,
  hashIdentifier,
  prismaRateLimitStore,
  rateLimitSubject,
  retryAfterSeconds,
} from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/session";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export type CompleteFn = (messages: ChatMessage[]) => Promise<string>;

export interface GenerationRouteRequest {
  json(): Promise<unknown>;
  headers: Headers;
  cookies: {
    get(name: string): { value: string } | undefined;
  };
}

export interface GenerationRouteUser {
  id: string;
}

export type PayloadParseResult<TPayload> =
  | { ok: true; payload: TPayload }
  | { ok: false; status: number; message: string; headers?: HeadersInit };

export interface GenerationRouteErrorMapping {
  status: number;
  message: string;
  log?: {
    reason: string;
    status: number;
  };
}

export interface GenerationRouteContext<TPayload> {
  payload: TPayload;
  requestId: string;
  user: GenerationRouteUser | null;
  complete: CompleteFn;
}

export interface GenerationRouteSuccessContext<TPayload> {
  payload: TPayload;
  requestId: string;
  user: GenerationRouteUser | null;
  latencyMs: number;
}

export interface GenerationRouteConfig<TPayload, TResult> {
  logScope: string;
  operation: string;
  rateLimitSubjects: {
    user: string;
    anonymousIp: string;
  };
  anonymousQuotaExceededMessage: string;
  unexpectedErrorMessage: string;
  azureMaxOutputTokens?: number;
  parsePayload(body: Record<string, unknown>): PayloadParseResult<TPayload>;
  creditText(payload: TPayload): string;
  generate(context: GenerationRouteContext<TPayload>): Promise<TResult>;
  successResponse(
    result: TResult,
    context: GenerationRouteSuccessContext<TPayload>,
  ): NextResponse;
  mapGenerationError(
    error: unknown,
    context: { payload: TPayload; requestId: string },
  ): GenerationRouteErrorMapping | null;
  onSuccess?(
    result: TResult,
    context: GenerationRouteSuccessContext<TPayload>,
  ): void | Promise<void>;
}

interface CookieWriter {
  commit(): void;
  readonly value: string | null;
}

export interface GenerationRouteDeps {
  requestId(): string;
  now(): number;
  getSecret(): string | undefined;
  getAzureConfig(): AzureConfig;
  azureChatComplete(
    messages: ChatMessage[],
    options: AzureCompleteOptions,
  ): Promise<string>;
  withAbortDeadline<T>(
    factory: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
  ): Promise<T>;
  timeoutMs: number;
  getCurrentUser(): Promise<GenerationRouteUser | null>;
  rateLimitStore: RateLimitStore;
  checkRateLimitWithStore: typeof checkRateLimitWithStore;
  rateLimitSubject(scope: string, identifier: string): string;
  userRateLimit(): number;
  userRateWindowMs(): number;
  anonIpRateLimit(): number;
  anonIpRateWindowMs(): number;
  retryAfterSeconds(resetAt: number, now: number): number;
  getClientIp(headers: Headers): string | null;
  hashIdentifier(identifier: string, secret: string): string;
  anonTrialLimit(): number;
  parseAnonCookie(
    value: string | undefined | null,
    secret: string,
  ): AnonState | null;
  newAnonState(): AnonState;
  signAnonState(state: AnonState, secret: string): string;
  reserveMeteredUsage(opts: {
    idempotencyKey: string;
    userId: string;
    operation: string;
    creditText: string;
  }): Promise<ReserveMeteredUsageResult>;
  captureMeteredUsage(
    reservation: MeteredUsageReservation,
  ): Promise<CaptureMeteredUsageResult>;
  refundMeteredUsage(reservation: MeteredUsageReservation): Promise<void>;
  isAzureConfigError(error: unknown): boolean;
  isTimeoutError(error: unknown): boolean;
  isInsufficientCreditsError(error: unknown): boolean;
  logError(
    scope: string,
    error: unknown,
    fields?: Record<string, unknown>,
  ): void;
  logRouteDenial(opts: Parameters<typeof logRouteDenial>[0]): void;
}

const defaultDeps: GenerationRouteDeps = {
  requestId: randomUUID,
  now: Date.now,
  getSecret: authEnv.secret,
  getAzureConfig,
  azureChatComplete,
  withAbortDeadline,
  timeoutMs: GENERATE_TIMEOUT_MS,
  getCurrentUser,
  rateLimitStore: prismaRateLimitStore,
  checkRateLimitWithStore,
  rateLimitSubject,
  userRateLimit,
  userRateWindowMs,
  anonIpRateLimit,
  anonIpRateWindowMs,
  retryAfterSeconds,
  getClientIp,
  hashIdentifier,
  anonTrialLimit,
  parseAnonCookie,
  newAnonState,
  signAnonState,
  reserveMeteredUsage,
  captureMeteredUsage,
  refundMeteredUsage,
  isAzureConfigError: (error) => error instanceof AzureConfigError,
  isTimeoutError: (error) => error instanceof GenerateTimeoutError,
  isInsufficientCreditsError: (error) =>
    error instanceof InsufficientCreditsError,
  logError,
  logRouteDenial,
};

export function errorResponse(
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

export async function readJsonObject(
  request: GenerationRouteRequest,
): Promise<
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: NextResponse }
> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      response: errorResponse(400, "Request body must be valid JSON."),
    };
  }
  if (!isPlainObject(body)) {
    return {
      ok: false,
      response: errorResponse(400, "Request body must be a JSON object."),
    };
  }
  return { ok: true, body };
}

export function createAzureComplete(
  deps: Pick<
    GenerationRouteDeps,
    "azureChatComplete" | "getAzureConfig" | "timeoutMs" | "withAbortDeadline"
  >,
  maxOutputTokens?: number,
): CompleteFn {
  const config = deps.getAzureConfig();
  return (messages) =>
    deps.withAbortDeadline(
      (signal) =>
        deps.azureChatComplete(messages, {
          config,
          signal,
          maxOutputTokens,
        }),
      deps.timeoutMs,
    );
}

export function createGenerationRouteHandler<TPayload, TResult>(
  config: GenerationRouteConfig<TPayload, TResult>,
  overrides: Partial<GenerationRouteDeps> = {},
): (request: GenerationRouteRequest) => Promise<NextResponse> {
  const deps: GenerationRouteDeps = { ...defaultDeps, ...overrides };

  return async function handleGenerationRoute(
    request: GenerationRouteRequest,
  ): Promise<NextResponse> {
    const requestId = deps.requestId();

    const json = await readJsonObject(request);
    if (!json.ok) {
      return json.response;
    }

    const parsed = config.parsePayload(json.body);
    if (!parsed.ok) {
      return errorResponse(parsed.status, parsed.message, parsed.headers);
    }
    const { payload } = parsed;

    const secret = deps.getSecret();
    if (!secret) {
      deps.logError(config.logScope, new Error("Missing AUTH_SECRET"), {
        requestId,
        reason: "missing-auth-secret",
        status: 500,
      });
      return errorResponse(
        500,
        "Server is misconfigured (missing AUTH_SECRET).",
      );
    }

    let complete: CompleteFn;
    try {
      complete = createAzureComplete(deps, config.azureMaxOutputTokens);
    } catch (error) {
      if (deps.isAzureConfigError(error)) {
        deps.logError(config.logScope, error, {
          requestId,
          reason: "azure-config",
          status: 503,
        });
        return errorResponse(503, "AI generation is not configured.");
      }
      deps.logError(config.logScope, error, {
        requestId,
        reason: "azure-config-unexpected",
        status: 500,
      });
      throw error;
    }

    const user = await deps.getCurrentUser();
    let commitAnonUsage: CookieWriter | null = null;
    let meteredUsage: MeteredUsageReservation | null = null;

    if (user) {
      const rateLimit = await checkUserRateLimit(config, deps, user);
      if (rateLimit) {
        return rateLimit;
      }

      const credit = await checkAndReserveCredits(
        config,
        deps,
        payload,
        user,
        requestId,
      );
      if ("response" in credit) {
        return credit.response;
      }
      meteredUsage = credit.reservation;
    } else {
      const anon = await checkAnonymousAccess(config, deps, request, secret);
      if ("response" in anon) {
        return anon.response;
      }
      commitAnonUsage = anon.cookieWriter;
    }

    try {
      const generationStartedAt = deps.now();
      const result = await config.generate({
        payload,
        requestId,
        user,
        complete,
      });
      const successContext: GenerationRouteSuccessContext<TPayload> = {
        payload,
        requestId,
        user,
        latencyMs: deps.now() - generationStartedAt,
      };

      commitAnonUsage?.commit();

      const capture = await captureCredits(config, deps, meteredUsage);
      if (capture) {
        return capture;
      }

      const response = config.successResponse(result, successContext);
      if (commitAnonUsage?.value) {
        response.cookies.set(ANON_COOKIE_NAME, commitAnonUsage.value, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: ONE_YEAR_SECONDS,
        });
      }

      await config.onSuccess?.(result, successContext);

      return response;
    } catch (error) {
      if (meteredUsage?.ledgerReserved) {
        await deps.refundMeteredUsage(meteredUsage).catch((refundErr) => {
          deps.logError(config.logScope, refundErr, {
            requestId,
            reason: "ledger-refund-failed",
          });
        });
      }

      if (deps.isTimeoutError(error)) {
        deps.logError(config.logScope, error, {
          requestId,
          reason: "timeout",
          status: 504,
        });
        deps.logRouteDenial({
          route: config.logScope,
          reason: ABUSE_CATEGORIES.AI_TIMEOUT,
          status: 504,
          userId: user?.id,
        });
        return errorResponse(
          504,
          "The AI took too long to respond. Please try again.",
        );
      }

      const mapped = config.mapGenerationError(error, { payload, requestId });
      if (mapped) {
        if (mapped.log) {
          deps.logError(config.logScope, error, {
            requestId,
            reason: mapped.log.reason,
            status: mapped.log.status,
          });
        }
        return errorResponse(mapped.status, mapped.message);
      }

      deps.logError(config.logScope, error, {
        requestId,
        reason: "unexpected",
        status: 500,
      });
      return errorResponse(500, config.unexpectedErrorMessage);
    }
  };
}

async function checkUserRateLimit<TPayload, TResult>(
  config: GenerationRouteConfig<TPayload, TResult>,
  deps: GenerationRouteDeps,
  user: GenerationRouteUser,
): Promise<NextResponse | null> {
  const result = await deps.checkRateLimitWithStore(
    deps.rateLimitStore,
    deps.rateLimitSubject(config.rateLimitSubjects.user, user.id),
    {
      limit: deps.userRateLimit(),
      windowMs: deps.userRateWindowMs(),
      now: deps.now(),
    },
  );
  if (result.allowed) {
    return null;
  }

  const retryAfter = Math.max(
    1,
    Math.ceil((result.resetAt - deps.now()) / 1000),
  );
  deps.logRouteDenial({
    route: config.logScope,
    reason: ABUSE_CATEGORIES.RATE_LIMIT_HIT,
    status: 429,
    userId: user.id,
    retryAfterSeconds: retryAfter,
  });
  return errorResponse(
    429,
    "Rate limit exceeded. Please wait a moment and try again.",
    { "Retry-After": String(retryAfter) },
  );
}

async function checkAndReserveCredits<TPayload, TResult>(
  config: GenerationRouteConfig<TPayload, TResult>,
  deps: GenerationRouteDeps,
  payload: TPayload,
  user: GenerationRouteUser,
  requestId: string,
): Promise<
  { reservation: MeteredUsageReservation } | { response: NextResponse }
> {
  const result = await deps.reserveMeteredUsage({
    idempotencyKey: requestId,
    userId: user.id,
    operation: config.operation,
    creditText: config.creditText(payload),
  });
  if (!result.ok) {
    deps.logRouteDenial({
      route: config.logScope,
      reason: ABUSE_CATEGORIES.CREDIT_DENIED,
      status: 402,
      userId: user.id,
    });
    return {
      response: errorResponse(402, result.message),
    };
  }

  return { reservation: result.reservation };
}

async function checkAnonymousAccess<TPayload, TResult>(
  config: GenerationRouteConfig<TPayload, TResult>,
  deps: GenerationRouteDeps,
  request: GenerationRouteRequest,
  secret: string,
): Promise<{ cookieWriter: CookieWriter } | { response: NextResponse }> {
  const clientIp = deps.getClientIp(request.headers) ?? "unknown";
  const clientHash = deps.hashIdentifier(clientIp, secret);
  const ipKey = deps.rateLimitSubject(
    config.rateLimitSubjects.anonymousIp,
    clientHash,
  );
  const now = deps.now();
  const ipResult = await deps.checkRateLimitWithStore(
    deps.rateLimitStore,
    ipKey,
    {
      limit: deps.anonIpRateLimit(),
      windowMs: deps.anonIpRateWindowMs(),
      now,
    },
  );

  if (!ipResult.allowed) {
    const retryAfter = deps.retryAfterSeconds(ipResult.resetAt, now);
    deps.logRouteDenial({
      route: config.logScope,
      reason: ABUSE_CATEGORIES.RATE_LIMIT_HIT,
      status: 429,
      subjectHash: clientHash,
      retryAfterSeconds: retryAfter,
    });
    return {
      response: errorResponse(
        429,
        "Too many anonymous generations from your network. Please wait and try again, or sign in.",
        { "Retry-After": String(retryAfter) },
      ),
    };
  }

  const state =
    deps.parseAnonCookie(
      request.cookies.get(ANON_COOKIE_NAME)?.value,
      secret,
    ) ?? deps.newAnonState();
  if (state.count >= deps.anonTrialLimit()) {
    deps.logRouteDenial({
      route: config.logScope,
      reason: ABUSE_CATEGORIES.ANON_QUOTA_DENIED,
      status: 429,
      subjectHash: clientHash,
    });
    return {
      response: errorResponse(429, config.anonymousQuotaExceededMessage),
    };
  }

  let setAnonCookie: string | null = null;
  return {
    cookieWriter: {
      commit() {
        const next = { id: state.id, count: state.count + 1 };
        setAnonCookie = deps.signAnonState(next, secret);
      },
      get value() {
        return setAnonCookie;
      },
    },
  };
}

async function captureCredits<TPayload, TResult>(
  config: GenerationRouteConfig<TPayload, TResult>,
  deps: GenerationRouteDeps,
  meteredUsage: MeteredUsageReservation | null,
): Promise<NextResponse | null> {
  if (!meteredUsage || meteredUsage.creditCost <= 0) {
    return null;
  }

  const result = await deps.captureMeteredUsage(meteredUsage);
  if (result.ok) {
    return null;
  }
  if (
    result.insufficientCredits ||
    deps.isInsufficientCreditsError(result.error)
  ) {
    deps.logRouteDenial({
      route: config.logScope,
      reason: ABUSE_CATEGORIES.CREDIT_DENIED,
      status: 402,
      userId: meteredUsage.userId,
    });
    return errorResponse(
      402,
      result.error instanceof Error
        ? result.error.message
        : "Insufficient credits.",
    );
  }
  deps.logError(config.logScope, result.error, {
    requestId: meteredUsage.idempotencyKey,
    reason: "credit-capture-failed",
  });
  return null;
}
