-- AlterTable
ALTER TABLE "users" ADD COLUMN     "disabledModules" JSONB NOT NULL DEFAULT '[]';
