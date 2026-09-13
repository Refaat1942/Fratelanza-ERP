-- AlterTable
ALTER TABLE "demo_environments" ADD COLUMN     "issuedTo" TEXT,
ADD COLUMN     "lastAccessedAt" TIMESTAMP(3),
ADD COLUMN     "visitCount" INTEGER NOT NULL DEFAULT 0;
