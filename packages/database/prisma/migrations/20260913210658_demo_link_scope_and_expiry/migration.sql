-- AlterTable
ALTER TABLE "demo_environments" ADD COLUMN     "linkExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "demoModules" JSONB;
