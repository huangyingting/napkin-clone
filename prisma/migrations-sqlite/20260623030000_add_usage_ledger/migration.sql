-- Add durable generation usage ledger with reserve/capture/refund lifecycle
-- (Epic #478, issue #481). Idempotent by idempotencyKey.

CREATE TABLE "UsageLedgerEntry" (
    "id"             TEXT     NOT NULL PRIMARY KEY,
    "idempotencyKey" TEXT     NOT NULL,
    "userId"         TEXT     NOT NULL,
    "operation"      TEXT     NOT NULL,
    "creditCost"     INTEGER  NOT NULL DEFAULT 0,
    "status"         TEXT     NOT NULL DEFAULT 'reserved',
    "reservedAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedAt"     DATETIME,
    "refundedAt"     DATETIME
);

CREATE UNIQUE INDEX "UsageLedgerEntry_idempotencyKey_key"
    ON "UsageLedgerEntry"("idempotencyKey");

CREATE INDEX "UsageLedgerEntry_userId_idx"
    ON "UsageLedgerEntry"("userId");

CREATE INDEX "UsageLedgerEntry_status_idx"
    ON "UsageLedgerEntry"("status");
