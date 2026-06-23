-- Add durable generation usage ledger with reserve/capture/refund lifecycle
-- (Epic #478, issue #481). Idempotent by idempotencyKey.

CREATE TABLE "UsageLedgerEntry" (
    "id"             TEXT         NOT NULL,
    "idempotencyKey" TEXT         NOT NULL,
    "userId"         TEXT         NOT NULL,
    "operation"      TEXT         NOT NULL,
    "creditCost"     INTEGER      NOT NULL,
    "status"         TEXT         NOT NULL DEFAULT 'reserved',
    "reservedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedAt"     TIMESTAMP(3),
    "refundedAt"     TIMESTAMP(3),

    CONSTRAINT "UsageLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UsageLedgerEntry_idempotencyKey_key"
    ON "UsageLedgerEntry"("idempotencyKey");

CREATE INDEX "UsageLedgerEntry_userId_idx"
    ON "UsageLedgerEntry"("userId");

CREATE INDEX "UsageLedgerEntry_status_idx"
    ON "UsageLedgerEntry"("status");
