-- Add slide comment anchor fields to Comment (Epic #380).
-- All columns are nullable so existing comment rows are unaffected.
ALTER TABLE "Comment" ADD COLUMN "slideId"        TEXT;
ALTER TABLE "Comment" ADD COLUMN "elementId"      TEXT;
ALTER TABLE "Comment" ADD COLUMN "anchorGeometry" JSONB;

-- Index slideId for efficient per-slide comment queries.
CREATE INDEX "Comment_slideId_idx" ON "Comment"("slideId");
