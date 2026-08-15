/*
  Warnings:

  - You are about to drop the column `indirectAmount` on the `Estimate` table. All the data in the column will be lost.
  - You are about to drop the column `indirectCostPct` on the `Estimate` table. All the data in the column will be lost.
  - You are about to drop the column `profitAmount` on the `Estimate` table. All the data in the column will be lost.
  - You are about to drop the column `profitPct` on the `Estimate` table. All the data in the column will be lost.
  - You are about to drop the column `subtotal` on the `Estimate` table. All the data in the column will be lost.
  - You are about to drop the column `totalEquipment` on the `Estimate` table. All the data in the column will be lost.
  - You are about to drop the column `totalTransport` on the `Estimate` table. All the data in the column will be lost.
  - You are about to drop the column `catalogItemId` on the `EstimateLine` table. All the data in the column will be lost.
  - You are about to drop the column `equipmentUnitPrice` on the `EstimateLine` table. All the data in the column will be lost.
  - You are about to drop the column `isNewItem` on the `EstimateLine` table. All the data in the column will be lost.
  - You are about to drop the column `transportUnitPrice` on the `EstimateLine` table. All the data in the column will be lost.
  - You are about to drop the column `indirectCostPct` on the `Organization` table. All the data in the column will be lost.
  - You are about to drop the column `laborRatePerHour` on the `Organization` table. All the data in the column will be lost.
  - You are about to drop the column `pricingConfigured` on the `Organization` table. All the data in the column will be lost.
  - You are about to drop the column `profitPct` on the `Organization` table. All the data in the column will be lost.
  - You are about to drop the `CatalogItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CatalogItemMaterial` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `LaborRate` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Material` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "EstimateMode" AS ENUM ('COMBINAT', 'SEPARAT');

-- CreateEnum
CREATE TYPE "InvoiceScope" AS ENUM ('TOT', 'MATERIALE', 'MANOPERA');

-- DropForeignKey
ALTER TABLE "CatalogItem" DROP CONSTRAINT "CatalogItem_laborRateId_fkey";

-- DropForeignKey
ALTER TABLE "CatalogItem" DROP CONSTRAINT "CatalogItem_orgId_fkey";

-- DropForeignKey
ALTER TABLE "CatalogItemMaterial" DROP CONSTRAINT "CatalogItemMaterial_catalogItemId_fkey";

-- DropForeignKey
ALTER TABLE "CatalogItemMaterial" DROP CONSTRAINT "CatalogItemMaterial_materialId_fkey";

-- DropForeignKey
ALTER TABLE "EstimateLine" DROP CONSTRAINT "EstimateLine_catalogItemId_fkey";

-- DropForeignKey
ALTER TABLE "LaborRate" DROP CONSTRAINT "LaborRate_orgId_fkey";

-- DropForeignKey
ALTER TABLE "Material" DROP CONSTRAINT "Material_orgId_fkey";

-- AlterTable
ALTER TABLE "Estimate" DROP COLUMN "indirectAmount",
DROP COLUMN "indirectCostPct",
DROP COLUMN "profitAmount",
DROP COLUMN "profitPct",
DROP COLUMN "subtotal",
DROP COLUMN "totalEquipment",
DROP COLUMN "totalTransport",
ADD COLUMN     "mode" "EstimateMode" NOT NULL DEFAULT 'COMBINAT';

-- AlterTable
ALTER TABLE "EstimateLine" DROP COLUMN "catalogItemId",
DROP COLUMN "equipmentUnitPrice",
DROP COLUMN "isNewItem",
DROP COLUMN "transportUnitPrice";

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "scope" "InvoiceScope" NOT NULL DEFAULT 'TOT';

-- AlterTable
ALTER TABLE "Organization" DROP COLUMN "indirectCostPct",
DROP COLUMN "laborRatePerHour",
DROP COLUMN "pricingConfigured",
DROP COLUMN "profitPct",
ADD COLUMN     "defaultMode" "EstimateMode" NOT NULL DEFAULT 'COMBINAT';

-- AlterTable
ALTER TABLE "ProgressLine" ADD COLUMN     "laborUnitPrice" DECIMAL(12,4) NOT NULL DEFAULT 0,
ADD COLUMN     "materialUnitPrice" DECIMAL(12,4) NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "CatalogItem";

-- DropTable
DROP TABLE "CatalogItemMaterial";

-- DropTable
DROP TABLE "LaborRate";

-- DropTable
DROP TABLE "Material";
