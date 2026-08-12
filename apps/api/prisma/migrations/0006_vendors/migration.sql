-- CreateEnum
CREATE TYPE "VendorStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "JdShareStatus" AS ENUM ('SENT', 'FAILED');

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "phone" TEXT,
    "status" "VendorStatus" NOT NULL DEFAULT 'ACTIVE',
    "specializations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jd_shares" (
    "id" TEXT NOT NULL,
    "jdId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" "JdShareStatus" NOT NULL DEFAULT 'SENT',
    "subject" TEXT NOT NULL,
    "attached" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "sentById" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jd_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendors_emailHash_key" ON "vendors"("emailHash");

-- CreateIndex
CREATE INDEX "vendors_status_idx" ON "vendors"("status");

-- CreateIndex
CREATE INDEX "jd_shares_jdId_idx" ON "jd_shares"("jdId");

-- CreateIndex
CREATE INDEX "jd_shares_vendorId_idx" ON "jd_shares"("vendorId");

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jd_shares" ADD CONSTRAINT "jd_shares_jdId_fkey" FOREIGN KEY ("jdId") REFERENCES "jds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jd_shares" ADD CONSTRAINT "jd_shares_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

