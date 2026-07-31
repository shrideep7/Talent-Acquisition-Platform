-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'RECRUITER', 'VIEWER');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('SOURCED', 'CONTACTED', 'INTERESTED', 'INTERNAL_INTERVIEW_DONE', 'SENT_TO_CLIENT', 'REJECTED');

-- CreateEnum
CREATE TYPE "CandidateSource" AS ENUM ('MANUAL', 'BULK_UPLOAD', 'NAUKRI');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('PENDING', 'GRANTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CvVersionStatus" AS ENUM ('DRAFT', 'EDITED', 'EXPORTED');

-- CreateEnum
CREATE TYPE "SkillMatchTier" AS ENUM ('EXPLICIT', 'TERMINOLOGY', 'INFERRED', 'UNVERIFIED_POSSIBLE', 'ABSENT');

-- CreateEnum
CREATE TYPE "VerifiedSkillStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "SourcingJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SourcingItemStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'RECRUITER',
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jds" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "clientName" TEXT NOT NULL DEFAULT 'NTT DATA',
    "rawText" TEXT NOT NULL,
    "parsedCriteria" JSONB,
    "fileKey" TEXT,
    "fileName" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "jds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "emailHash" TEXT,
    "phone" TEXT,
    "currentLocation" TEXT,
    "currentTitle" TEXT,
    "noticePeriod" TEXT,
    "totalYearsExperience" DOUBLE PRECISION,
    "source" "CandidateSource" NOT NULL DEFAULT 'MANUAL',
    "consentStatus" "ConsentStatus" NOT NULL DEFAULT 'PENDING',
    "consentAt" TIMESTAMP(3),
    "consentNote" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cv_documents" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "parsedText" TEXT NOT NULL,
    "parsedCv" JSONB,
    "parseMeta" JSONB,
    "ocrUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cv_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_analyses" (
    "id" TEXT NOT NULL,
    "jdId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "cvDocumentId" TEXT,
    "cvVersionId" TEXT,
    "totalScore" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "promptVersions" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cv_versions" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jdId" TEXT NOT NULL,
    "parentVersionId" TEXT,
    "versionNumber" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "changeLog" JSONB NOT NULL,
    "integrityNotes" JSONB,
    "targetScore" INTEGER,
    "achievedScore" INTEGER,
    "status" "CvVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cv_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_preps" (
    "id" TEXT NOT NULL,
    "jdId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "prep" JSONB NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_preps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verified_skills" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jdId" TEXT,
    "skill" TEXT NOT NULL,
    "tier" "SkillMatchTier" NOT NULL,
    "status" "VerifiedSkillStatus" NOT NULL DEFAULT 'PROPOSED',
    "evidence" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verified_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_entries" (
    "id" TEXT NOT NULL,
    "jdId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "stage" "PipelineStage" NOT NULL DEFAULT 'SOURCED',
    "notes" TEXT,
    "latestScore" INTEGER,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sourcing_jobs" (
    "id" TEXT NOT NULL,
    "jdId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'bulk_upload',
    "status" "SourcingJobStatus" NOT NULL DEFAULT 'PENDING',
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "processedItems" INTEGER NOT NULL DEFAULT 0,
    "failedItems" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sourcing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sourcing_job_items" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileKey" TEXT,
    "status" "SourcingItemStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "candidateId" TEXT,
    "analysisId" TEXT,
    "totalScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sourcing_job_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sourcing_credentials" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedPayload" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sourcing_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "detail" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_cache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "promptName" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "candidates_emailHash_idx" ON "candidates"("emailHash");

-- CreateIndex
CREATE INDEX "match_analyses_jdId_candidateId_idx" ON "match_analyses"("jdId", "candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "cv_versions_candidateId_jdId_versionNumber_key" ON "cv_versions"("candidateId", "jdId", "versionNumber");

-- CreateIndex
CREATE INDEX "verified_skills_candidateId_jdId_idx" ON "verified_skills"("candidateId", "jdId");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_entries_jdId_candidateId_key" ON "pipeline_entries"("jdId", "candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "sourcing_credentials_provider_key" ON "sourcing_credentials"("provider");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "llm_cache_cacheKey_key" ON "llm_cache"("cacheKey");

-- AddForeignKey
ALTER TABLE "jds" ADD CONSTRAINT "jds_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_documents" ADD CONSTRAINT "cv_documents_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_analyses" ADD CONSTRAINT "match_analyses_jdId_fkey" FOREIGN KEY ("jdId") REFERENCES "jds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_analyses" ADD CONSTRAINT "match_analyses_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_analyses" ADD CONSTRAINT "match_analyses_cvDocumentId_fkey" FOREIGN KEY ("cvDocumentId") REFERENCES "cv_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_analyses" ADD CONSTRAINT "match_analyses_cvVersionId_fkey" FOREIGN KEY ("cvVersionId") REFERENCES "cv_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_analyses" ADD CONSTRAINT "match_analyses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_versions" ADD CONSTRAINT "cv_versions_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_versions" ADD CONSTRAINT "cv_versions_jdId_fkey" FOREIGN KEY ("jdId") REFERENCES "jds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_versions" ADD CONSTRAINT "cv_versions_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "cv_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_versions" ADD CONSTRAINT "cv_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_preps" ADD CONSTRAINT "interview_preps_jdId_fkey" FOREIGN KEY ("jdId") REFERENCES "jds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_preps" ADD CONSTRAINT "interview_preps_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verified_skills" ADD CONSTRAINT "verified_skills_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verified_skills" ADD CONSTRAINT "verified_skills_jdId_fkey" FOREIGN KEY ("jdId") REFERENCES "jds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verified_skills" ADD CONSTRAINT "verified_skills_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_entries" ADD CONSTRAINT "pipeline_entries_jdId_fkey" FOREIGN KEY ("jdId") REFERENCES "jds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_entries" ADD CONSTRAINT "pipeline_entries_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sourcing_jobs" ADD CONSTRAINT "sourcing_jobs_jdId_fkey" FOREIGN KEY ("jdId") REFERENCES "jds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sourcing_job_items" ADD CONSTRAINT "sourcing_job_items_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "sourcing_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

