-- AlterTable: track whether the user has dismissed first-run onboarding (issue #106)
ALTER TABLE "User" ADD COLUMN "onboardingDismissed" BOOLEAN NOT NULL DEFAULT false;
