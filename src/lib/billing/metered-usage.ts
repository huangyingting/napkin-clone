import {
  computeCreditCost,
  deductCredits,
  hasSufficientCredits,
  InsufficientCreditsError,
} from "@/lib/billing/credits";
import { isUnlimitedCreditsEnabled } from "@/lib/billing/config";
import { getBillingState } from "@/lib/billing/service";
import {
  captureUsage,
  refundUsage,
  reserveUsage,
} from "@/lib/billing/usage-ledger";
import {
  logMeteredUsageEvent,
  logMeteredUsageFailure,
} from "@/lib/diagnostics/domain-events";

export interface MeteredUsageReservation {
  idempotencyKey: string;
  userId: string;
  operation: string;
  creditCost: number;
  ledgerReserved: boolean;
}

export type ReserveMeteredUsageResult =
  | { ok: true; reservation: MeteredUsageReservation }
  | {
      ok: false;
      reason: "insufficient-credits";
      creditCost: number;
      balance: number;
      periodEnd: Date;
      message: string;
    };

export type CaptureMeteredUsageResult =
  | { ok: true }
  | { ok: false; error: unknown; insufficientCredits: boolean };

export interface ReserveMeteredUsageOptions {
  idempotencyKey: string;
  userId: string;
  operation: string;
  creditText: string;
}

export async function reserveMeteredUsage(
  opts: ReserveMeteredUsageOptions,
): Promise<ReserveMeteredUsageResult> {
  const { idempotencyKey, userId, operation, creditText } = opts;
  if (isUnlimitedCreditsEnabled()) {
    return {
      ok: true,
      reservation: {
        idempotencyKey,
        userId,
        operation,
        creditCost: 0,
        ledgerReserved: false,
      },
    };
  }

  const creditCost = computeCreditCost(creditText);
  const billingState = await getBillingState(userId);
  if (!hasSufficientCredits(billingState.creditBalance, creditCost)) {
    const message =
      `Insufficient credits: you need ${creditCost} but have ${billingState.creditBalance}. ` +
      `Your credits reset on ${billingState.periodEnd.toLocaleDateString()}. ` +
      "Upgrade your plan or wait for your credits to reset.";
    logMeteredUsageEvent("reserve", "insufficient credits", {
      idempotencyKey,
      operation,
      creditCost,
      userId,
      status: "denied",
    });
    return {
      ok: false,
      reason: "insufficient-credits",
      creditCost,
      balance: billingState.creditBalance,
      periodEnd: billingState.periodEnd,
      message,
    };
  }

  let ledgerReserved = false;
  if (creditCost > 0) {
    try {
      await reserveUsage({ idempotencyKey, userId, operation, creditCost });
      ledgerReserved = true;
    } catch (error) {
      logMeteredUsageFailure("reserve", error, {
        idempotencyKey,
        operation,
        creditCost,
        userId,
      });
    }
  }

  return {
    ok: true,
    reservation: {
      idempotencyKey,
      userId,
      operation,
      creditCost,
      ledgerReserved,
    },
  };
}

export async function captureMeteredUsage(
  reservation: MeteredUsageReservation,
): Promise<CaptureMeteredUsageResult> {
  if (reservation.creditCost <= 0) {
    return { ok: true };
  }

  try {
    if (reservation.ledgerReserved) {
      await captureUsage({
        idempotencyKey: reservation.idempotencyKey,
        userId: reservation.userId,
        creditCost: reservation.creditCost,
      });
    } else {
      await deductCredits(reservation.userId, reservation.creditCost);
    }
    logMeteredUsageEvent("capture", "captured", {
      idempotencyKey: reservation.idempotencyKey,
      operation: reservation.operation,
      creditCost: reservation.creditCost,
      userId: reservation.userId,
      status: "captured",
    });
    return { ok: true };
  } catch (error) {
    logMeteredUsageFailure("capture", error, {
      idempotencyKey: reservation.idempotencyKey,
      operation: reservation.operation,
      creditCost: reservation.creditCost,
      userId: reservation.userId,
    });
    return {
      ok: false,
      error,
      insufficientCredits: error instanceof InsufficientCreditsError,
    };
  }
}

export async function refundMeteredUsage(
  reservation: MeteredUsageReservation,
): Promise<void> {
  if (!reservation.ledgerReserved) {
    return;
  }
  await refundUsage({ idempotencyKey: reservation.idempotencyKey });
  logMeteredUsageEvent("refund", "refunded", {
    idempotencyKey: reservation.idempotencyKey,
    operation: reservation.operation,
    creditCost: reservation.creditCost,
    userId: reservation.userId,
    status: "refunded",
  });
}
