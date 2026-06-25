import { notFound as nextNotFound } from "next/navigation";
import { NextResponse } from "next/server";

import {
  forbidden,
  notFound as apiNotFound,
  unauthorized,
} from "@/lib/api/errors";
import type {
  AccessAllowedDecision,
  AccessDecision,
  AccessDeniedDecision,
} from "@/lib/access-policy/taxonomy";

type ServerActionErrorFactory<TError extends Error> = (
  decision: AccessDeniedDecision,
) => TError;

export type AccessDiagnostic = {
  outcome: "allow" | "deny";
  resource: AccessDecision["resource"]["kind"];
  capability: AccessDecision["capability"];
  reason?: AccessDeniedDecision["reason"];
  status?: AccessDeniedDecision["status"];
  concealResource?: boolean;
};

export function accessDecisionToServerActionError<TError extends Error = Error>(
  decision: AccessDecision,
  createError?: ServerActionErrorFactory<TError>,
): TError | null {
  if (decision.allow) {
    return null;
  }
  return createError?.(decision) ?? (new Error(decision.safeMessage) as TError);
}

export function assertAccessDecisionForServerAction<
  TError extends Error = Error,
>(
  decision: AccessDecision,
  createError?: ServerActionErrorFactory<TError>,
): asserts decision is AccessAllowedDecision {
  const error = accessDecisionToServerActionError(decision, createError);
  if (error) {
    throw error;
  }
}

export function assertAccessDecisionOrNotFound(
  decision: AccessDecision,
  notFound: () => never = nextNotFound,
): asserts decision is AccessAllowedDecision {
  if (!decision.allow) {
    notFound();
  }
}

export function accessDecisionToApiResponse(
  decision: AccessDecision,
): NextResponse | null {
  if (decision.allow) {
    return null;
  }
  if (decision.status === 401) {
    return unauthorized(decision.safeMessage);
  }
  if (decision.status === 404) {
    return apiNotFound(decision.safeMessage);
  }
  return forbidden(decision.safeMessage);
}

export function accessDecisionToPlainTextApiResponse(
  decision: AccessDecision,
): NextResponse | null {
  if (decision.allow) {
    return null;
  }
  const body = decision.status === 404 ? "Not found" : decision.safeMessage;
  return new NextResponse(body, { status: decision.status });
}

export function accessDecisionToDiagnostic(
  decision: AccessDecision,
): AccessDiagnostic {
  if (decision.allow) {
    return {
      outcome: "allow",
      resource: decision.resource.kind,
      capability: decision.capability,
    };
  }

  return {
    outcome: "deny",
    resource: decision.resource.kind,
    capability: decision.capability,
    reason: decision.reason,
    status: decision.status,
    concealResource: decision.concealResource,
  };
}
