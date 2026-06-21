-- CreateTable StripeWebhookEvent (idempotency ledger for processed webhook events)
CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
