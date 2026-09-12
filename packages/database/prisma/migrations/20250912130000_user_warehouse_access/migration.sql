-- CreateTable
CREATE TABLE "user_warehouse_access" (
    "userId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,

    CONSTRAINT "user_warehouse_access_pkey" PRIMARY KEY ("userId","warehouseId")
);

-- CreateIndex
CREATE INDEX "user_warehouse_access_warehouseId_idx" ON "user_warehouse_access"("warehouseId");

-- AddForeignKey
ALTER TABLE "user_warehouse_access" ADD CONSTRAINT "user_warehouse_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_warehouse_access" ADD CONSTRAINT "user_warehouse_access_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
