-- Split the conflated Stripe `externalId` into separate customer and
-- subscription ids. A Stripe customer can outlive any single subscription, so
-- they must be tracked independently.

-- DropIndex
DROP INDEX "Subscription_externalId_key";

-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "externalId",
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeCustomerId_key" ON "Subscription"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");
