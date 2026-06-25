/**
 * Durable generation usage ledger with reserve / capture / refund lifecycle
 * (Epic #478, issue #481).
 *
 * ## Lifecycle
 *
 *   1. **reserve** — Before calling the AI model, record intent in the ledger
 *      with status `"reserved"`. Credits are NOT deducted at this point.
 *      Returns the existing entry unchanged if the idempotency key is already
 *      present (safe to retry).
 *
 *   2. **capture** — On AI success, atomically deduct credits (via the
 *      existing atomic conditional decrement in `credits.ts`) and mark the
 *      entry `"captured"`. Idempotent: returns without deducting again if the
 *      entry is already `"captured"`.
 *
 *   3. **refund** — On AI failure, mark the entry `"refunded"`. Because no
 *      credits were deducted in `reserve`, this is a pure tombstone with no
 *      balance change. Idempotent.
 *
 * ## Double-charge safety
 *
 * The idempotency key (typically the request UUID) ensures a single
 * request — even when retried — produces exactly one `"captured"` row and
 * exactly one credit deduction. The credit deduction itself uses
 * `deductCredits` which is an atomic conditional DB write (`creditBalance >=
 * cost`), so concurrent captures for the SAME user on DIFFERENT requests
 * cannot both succeed when the balance is borderline.
 *
 * ## Usage in a route
 *
 * ```ts
 * const ledgerKey = requestId;  // stable UUID, same across retries
 * let reserved = false;
 * try {
 *   await reserveUsage({ idempotencyKey: ledgerKey, userId, operation: "generate", creditCost });
 *   reserved = true;
 *   // ... call AI model ...
 *   await captureUsage({ idempotencyKey: ledgerKey, userId, creditCost });
 * } catch (err) {
 *   if (reserved) await refundUsage({ idempotencyKey: ledgerKey });
 *   throw err;
 * }
 * ```
 */

import { prisma } from "@/lib/prisma";
import { deductCredits } from "@/lib/billing/credits";
import {
  logUsageLedgerEvent,
  logUsageLedgerFailure,
} from "@/lib/diagnostics/domain-events";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LedgerStatus = "reserved" | "captured" | "refunded";

export interface UsageLedgerEntry {
  id: string;
  idempotencyKey: string;
  userId: string;
  operation: string;
  creditCost: number;
  status: LedgerStatus;
  reservedAt: Date;
  capturedAt: Date | null;
  refundedAt: Date | null;
}

export interface ReserveOptions {
  idempotencyKey: string;
  userId: string;
  /** Logical operation name, e.g. "generate" or "generate-deck". */
  operation: string;
  creditCost: number;
  client?: typeof prisma;
}

export interface CaptureOptions {
  idempotencyKey: string;
  userId: string;
  creditCost: number;
  client?: typeof prisma;
}

export interface RefundOptions {
  idempotencyKey: string;
  client?: typeof prisma;
}

// ---------------------------------------------------------------------------
// reserve
// ---------------------------------------------------------------------------

/**
 * Records generation intent in the ledger (status = `"reserved"`).
 *
 * Idempotent: if the key already exists the existing entry is returned without
 * any write — callers can safely retry on transient failures.
 *
 * Throws only on unexpected DB errors.
 */
export async function reserveUsage(
  opts: ReserveOptions,
): Promise<UsageLedgerEntry> {
  const {
    idempotencyKey,
    userId,
    operation,
    creditCost,
    client = prisma,
  } = opts;

  // Idempotency: return existing entry if key is already present.
  const existing = await client.usageLedgerEntry.findUnique({
    where: { idempotencyKey },
  });
  if (existing) {
    logUsageLedgerEvent("reserve", "idempotent reserve", {
      idempotencyKey,
      status: existing.status,
    });
    return existing as UsageLedgerEntry;
  }

  const entry = await client.usageLedgerEntry.create({
    data: {
      idempotencyKey,
      userId,
      operation,
      creditCost,
      status: "reserved",
    },
  });

  logUsageLedgerEvent("reserve", "reserved", {
    idempotencyKey,
    operation,
    creditCost,
  });

  return entry as UsageLedgerEntry;
}

// ---------------------------------------------------------------------------
// capture
// ---------------------------------------------------------------------------

/**
 * Captures usage on successful generation: atomically deducts `creditCost`
 * from the user's balance via `deductCredits` and marks the ledger entry
 * `"captured"`.
 *
 * Idempotent: if the entry is already `"captured"`, returns it without
 * deducting again. If `creditCost <= 0`, marks captured without a deduction.
 *
 * Throws {@link InsufficientCreditsError} when the balance cannot cover the
 * cost (concurrent depletion between reserve and capture).
 */
export async function captureUsage(
  opts: CaptureOptions,
): Promise<UsageLedgerEntry> {
  const { idempotencyKey, userId, creditCost, client = prisma } = opts;

  const entry = await client.usageLedgerEntry.findUnique({
    where: { idempotencyKey },
  });

  if (!entry) {
    throw new Error(
      `[usage-ledger] captureUsage: no ledger entry found for key "${idempotencyKey}". ` +
        "Call reserveUsage first.",
    );
  }

  if (entry.status === "captured") {
    logUsageLedgerEvent("capture", "idempotent capture", {
      idempotencyKey,
    });
    return entry as UsageLedgerEntry;
  }

  // Deduct credits (atomic conditional write — cannot double-charge).
  if (creditCost > 0) {
    await deductCredits(userId, creditCost, client);
  }

  const updated = await client.usageLedgerEntry.update({
    where: { idempotencyKey },
    data: { status: "captured", capturedAt: new Date() },
  });

  logUsageLedgerEvent("capture", "captured", {
    idempotencyKey,
    creditCost,
  });

  return updated as UsageLedgerEntry;
}

// ---------------------------------------------------------------------------
// refund
// ---------------------------------------------------------------------------

/**
 * Marks the ledger entry `"refunded"` when generation fails.
 *
 * Because no credits were deducted during `reserve`, this is purely a
 * tombstone operation — no balance change is needed. Idempotent: if the entry
 * is already `"refunded"` or the key is not found (defensive), this is a
 * no-op.
 */
export async function refundUsage(
  opts: RefundOptions,
): Promise<UsageLedgerEntry | null> {
  const { idempotencyKey, client = prisma } = opts;

  try {
    const updated = await client.usageLedgerEntry.update({
      where: { idempotencyKey },
      data: { status: "refunded", refundedAt: new Date() },
    });

    logUsageLedgerEvent("refund", "refunded", { idempotencyKey });
    return updated as UsageLedgerEntry;
  } catch (err) {
    // Entry may not exist (reserveUsage failed before creating it) — log and
    // return null rather than masking the original error.
    logUsageLedgerFailure("refund", err, { idempotencyKey });
    return null;
  }
}
