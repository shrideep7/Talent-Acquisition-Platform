-- CreateEnum
CREATE TYPE "ScreeningConversationStatus" AS ENUM ('INVITED', 'IN_PROGRESS', 'COMPLETED', 'DECLINED', 'OPTED_OUT', 'NEEDS_HUMAN', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "screening_conversations" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jdId" TEXT NOT NULL,
    "status" "ScreeningConversationStatus" NOT NULL DEFAULT 'INVITED',
    "phone" TEXT NOT NULL,
    "phoneHash" TEXT NOT NULL,
    "currentStepKey" TEXT,
    "steps" JSONB NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '[]',
    "transcript" JSONB NOT NULL DEFAULT '[]',
    "meta" JSONB NOT NULL DEFAULT '{}',
    "brief" JSONB,
    "consentCaptured" BOOLEAN NOT NULL DEFAULT false,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastInboundAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "screening_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "screening_conversations_candidateId_idx" ON "screening_conversations"("candidateId");

-- CreateIndex
CREATE INDEX "screening_conversations_phoneHash_status_idx" ON "screening_conversations"("phoneHash", "status");

-- AddForeignKey
ALTER TABLE "screening_conversations" ADD CONSTRAINT "screening_conversations_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screening_conversations" ADD CONSTRAINT "screening_conversations_jdId_fkey" FOREIGN KEY ("jdId") REFERENCES "jds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screening_conversations" ADD CONSTRAINT "screening_conversations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
