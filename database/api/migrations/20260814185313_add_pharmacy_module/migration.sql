-- CreateEnum
CREATE TYPE "MedicineCategory" AS ENUM ('ANALGESIC', 'ANTIBIOTIC', 'ANTIVIRAL', 'CARDIOVASCULAR', 'GASTROINTESTINAL', 'RESPIRATORY', 'VITAMINS_SUPPLEMENTS');

-- CreateTable
CREATE TABLE "Medicine" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "MedicineCategory" NOT NULL,
    "stock" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Medicine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Medicine_category_idx" ON "Medicine"("category");
