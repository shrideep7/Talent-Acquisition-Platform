-- Enforce candidate dedupe at the database level (NULL emailHash exempt)
DROP INDEX IF EXISTS "candidates_emailHash_idx";
CREATE UNIQUE INDEX "candidates_emailHash_key" ON "candidates"("emailHash");
