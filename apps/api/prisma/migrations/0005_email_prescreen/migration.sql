-- CreateEnum
CREATE TYPE "PrescreenChannel" AS ENUM ('WHATSAPP', 'EMAIL');

-- AlterTable
ALTER TABLE "screening_conversations" ADD COLUMN     "channel" "PrescreenChannel" NOT NULL DEFAULT 'WHATSAPP',
ADD COLUMN     "email" TEXT,
ADD COLUMN     "formToken" TEXT,
ALTER COLUMN "phone" DROP NOT NULL,
ALTER COLUMN "phoneHash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "screening_conversations_formToken_key" ON "screening_conversations"("formToken");

