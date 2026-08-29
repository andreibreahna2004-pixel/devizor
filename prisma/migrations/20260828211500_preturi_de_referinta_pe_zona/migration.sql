/*
  Preturi de referinta pe zona: catalog de materiale, observatii de pret si
  indicele de manopera pe judet.

  MIGRARE DOAR DE ADAUGARE, ca si precedenta. Nu sterge nimic si nu atinge
  niciun rand existent. `Estimate.mode` si `Organization.defaultMode` raman in
  baza, nefolosite de cod, pana la migrarea de contractie amanata — vezi
  CLAUDE.md. Daca ar fi sterse aici, ar cadea codul vechi in fereastra dintre
  migrare si promovarea noii versiuni.

  `Estimate.countyCode` intra nullable: devizele de pana acum n-au avut unde sa-l
  pastreze, iar o valoare implicita ar fi o minciuna despre unde s-a lucrat.

  `MaterialPrice` creste, nu se rescrie: un import nou insereaza randuri, nu le
  suprascrie pe cele vechi. Fara asta n-ar exista evolutie in timp.
*/

-- CreateEnum
CREATE TYPE "MaterialPriceSource" AS ENUM ('FURNIZOR', 'LISTA', 'MANUAL');

-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "countyCode" TEXT;

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialPrice" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "countyCode" TEXT,
    "price" DECIMAL(12,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RON',
    "source" "MaterialPriceSource" NOT NULL,
    "supplier" TEXT,
    "sourceUrl" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaborIndex" (
    "id" TEXT NOT NULL,
    "countyCode" TEXT NOT NULL,
    "value" DECIMAL(6,4) NOT NULL,
    "period" TIMESTAMP(3) NOT NULL,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaborIndex_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Material_name_idx" ON "Material"("name");

-- CreateIndex
CREATE INDEX "MaterialPrice_materialId_countyCode_observedAt_idx" ON "MaterialPrice"("materialId", "countyCode", "observedAt");

-- CreateIndex
CREATE INDEX "MaterialPrice_observedAt_idx" ON "MaterialPrice"("observedAt");

-- CreateIndex
CREATE INDEX "LaborIndex_countyCode_period_idx" ON "LaborIndex"("countyCode", "period");

-- CreateIndex
CREATE UNIQUE INDEX "LaborIndex_countyCode_period_key" ON "LaborIndex"("countyCode", "period");

-- AddForeignKey
ALTER TABLE "MaterialPrice" ADD CONSTRAINT "MaterialPrice_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;
