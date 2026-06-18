-- CreateTable
CREATE TABLE "RateLimitHit" (
    "subject" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitHit_pkey" PRIMARY KEY ("subject")
);
