-- CvVersion: record the exact source document a version was generated from
ALTER TABLE "cv_versions" ADD COLUMN "sourceCvDocumentId" TEXT;

-- LlmCache: link candidate-derived cache entries for DPDP erasure purge
ALTER TABLE "llm_cache" ADD COLUMN "candidateId" TEXT;
CREATE INDEX "llm_cache_candidateId_idx" ON "llm_cache"("candidateId");
