-- Add optimistic revision token for deck save conflict detection (#376).
-- Nullable so existing documents are unaffected; the token is set on the
-- first successful save and rotated on every subsequent save.
ALTER TABLE "Document" ADD COLUMN "deckRevisionToken" TEXT;
