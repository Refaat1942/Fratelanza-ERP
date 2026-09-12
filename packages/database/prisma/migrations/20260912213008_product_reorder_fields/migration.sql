-- AlterTable
ALTER TABLE "products" ADD COLUMN     "preferredSupplierId" UUID,
ADD COLUMN     "reorderPoint" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "reorderQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0;
