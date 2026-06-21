-- De-duplicate any existing (documentId, anchorBlockId) rows BEFORE adding the
-- unique index, so the index creation can't fail on legacy duplicates produced
-- by the previous non-transactional N+1 mirror. For each duplicate group we keep
-- the most recently created row (tie-break: lowest id) and delete the rest.
-- NULL anchors (the legacy document-level visual) are excluded — SQLite treats
-- NULLs as distinct in a unique index, so they never collide.
DELETE FROM "Visual"
WHERE "anchorBlockId" IS NOT NULL
  AND "id" NOT IN (
    SELECT keep."id" FROM (
      SELECT "id",
             ROW_NUMBER() OVER (
               PARTITION BY "documentId", "anchorBlockId"
               ORDER BY "createdAt" DESC, "id" ASC
             ) AS rn
      FROM "Visual"
      WHERE "anchorBlockId" IS NOT NULL
    ) keep
    WHERE keep."rn" = 1
  );

-- CreateIndex
CREATE UNIQUE INDEX "Visual_documentId_anchorBlockId_key" ON "Visual"("documentId", "anchorBlockId");
