-- AlterTable: invite-link hardening — expiry & usage cap (issue #103)
ALTER TABLE "InviteLink" ADD COLUMN "expiresAt" DATETIME;
ALTER TABLE "InviteLink" ADD COLUMN "maxUses" INTEGER;
ALTER TABLE "InviteLink" ADD COLUMN "useCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: per-join audit trail (issue #103)
CREATE TABLE "InviteLinkUse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inviteLinkId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "usedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InviteLinkUse_inviteLinkId_fkey" FOREIGN KEY ("inviteLinkId") REFERENCES "InviteLink" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "InviteLinkUse_inviteLinkId_idx" ON "InviteLinkUse"("inviteLinkId");

-- CreateIndex
CREATE INDEX "InviteLinkUse_userId_idx" ON "InviteLinkUse"("userId");
