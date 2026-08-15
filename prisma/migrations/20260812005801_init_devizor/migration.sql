-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "SeriesKind" AS ENUM ('DEVIZ', 'FACTURA', 'PROFORMA', 'SITUATIE');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('PERSOANA_FIZICA', 'PERSOANA_JURIDICA');

-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('CIORNA', 'TRIMIS', 'ACCEPTAT', 'RESPINS', 'ANULAT');

-- CreateEnum
CREATE TYPE "AiConfidence" AS ENUM ('MARE', 'MEDIE', 'MICA');

-- CreateEnum
CREATE TYPE "ProgressStatus" AS ENUM ('CIORNA', 'APROBATA', 'FACTURATA');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('CIORNA', 'EMISA', 'TRIMISA', 'PLATITA', 'STORNATA', 'ANULATA');

-- CreateEnum
CREATE TYPE "EfacturaStatus" AS ENUM ('NEGENERATA', 'GENERATA', 'DESCARCATA');

-- CreateEnum
CREATE TYPE "AiRunKind" AS ENUM ('DEVIZ', 'FACTURA');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "cui" TEXT NOT NULL,
    "vatPayer" BOOLEAN NOT NULL DEFAULT true,
    "regCom" TEXT,
    "capital" DECIMAL(14,2),
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "countyCode" TEXT NOT NULL,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'RO',
    "email" TEXT,
    "phone" TEXT,
    "iban" TEXT,
    "bank" TEXT,
    "logoUrl" TEXT,
    "defaultVatRate" DECIMAL(5,2) NOT NULL DEFAULT 21,
    "laborRatePerHour" DECIMAL(10,2) NOT NULL DEFAULT 50,
    "indirectCostPct" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "profitPct" DECIMAL(5,2) NOT NULL DEFAULT 8,
    "pricingConfigured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSeries" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "kind" "SeriesKind" NOT NULL,
    "series" TEXT NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VatRate" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "VatRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" "ClientType" NOT NULL DEFAULT 'PERSOANA_JURIDICA',
    "name" TEXT NOT NULL,
    "cui" TEXT,
    "vatPayer" BOOLEAN NOT NULL DEFAULT false,
    "regCom" TEXT,
    "cnp" TEXT,
    "address" TEXT,
    "city" TEXT,
    "countyCode" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'RO',
    "email" TEXT,
    "phone" TEXT,
    "iban" TEXT,
    "bank" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT,
    "city" TEXT,
    "countyCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "price" DECIMAL(12,4) NOT NULL,
    "category" TEXT,
    "supplier" TEXT,
    "isSeedPrice" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaborRate" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "trade" TEXT NOT NULL,
    "ratePerHour" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaborRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "chapterCode" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "laborHours" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "laborRateId" TEXT,
    "equipmentCost" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "transportCost" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "keywords" TEXT,
    "notes" TEXT,
    "officialCode" TEXT,
    "sourceIndicator" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogItemMaterial" (
    "id" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "consumption" DECIMAL(12,5) NOT NULL,

    CONSTRAINT "CatalogItemMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estimate" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "fullNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "clientId" TEXT,
    "projectId" TEXT,
    "status" "EstimateStatus" NOT NULL DEFAULT 'CIORNA',
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "indirectCostPct" DECIMAL(5,2) NOT NULL,
    "profitPct" DECIMAL(5,2) NOT NULL,
    "vatRate" DECIMAL(5,2) NOT NULL,
    "totalMaterial" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalLabor" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalEquipment" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalTransport" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "indirectAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "profitAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "aiBrief" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateSection" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EstimateSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateLine" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "sectionId" TEXT,
    "catalogItemId" TEXT,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "materialUnitPrice" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "laborUnitPrice" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "equipmentUnitPrice" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "transportUnitPrice" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "aiJustification" TEXT,
    "aiConfidence" "AiConfidence",
    "isNewItem" BOOLEAN NOT NULL DEFAULT false,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EstimateLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressReport" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "fullNumber" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "ProgressStatus" NOT NULL DEFAULT 'CIORNA',
    "notes" TEXT,
    "netTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgressReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressLine" (
    "id" TEXT NOT NULL,
    "progressReportId" TEXT NOT NULL,
    "estimateLineId" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unitPrice" DECIMAL(12,4) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "ProgressLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "fullNumber" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "estimateId" TEXT,
    "progressReportId" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'CIORNA',
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "supplyDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'RON',
    "exchangeRate" DECIMAL(12,6),
    "supplierSnapshot" JSONB NOT NULL,
    "clientSnapshot" JSONB NOT NULL,
    "netTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "efacturaStatus" "EfacturaStatus" NOT NULL DEFAULT 'NEGENERATA',
    "efacturaXml" TEXT,
    "efacturaGeneratedAt" TIMESTAMP(3),
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unitPrice" DECIMAL(12,4) NOT NULL,
    "vatRate" DECIMAL(5,2) NOT NULL,
    "netAmount" DECIMAL(14,2) NOT NULL,
    "vatAmount" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRun" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT,
    "kind" "AiRunKind" NOT NULL,
    "model" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "rawOutput" JSONB,
    "error" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "linesProposed" INTEGER NOT NULL DEFAULT 0,
    "estimateId" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_slug_idx" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Membership_orgId_idx" ON "Membership"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_orgId_key" ON "Membership"("userId", "orgId");

-- CreateIndex
CREATE INDEX "DocumentSeries_orgId_kind_idx" ON "DocumentSeries"("orgId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSeries_orgId_kind_series_key" ON "DocumentSeries"("orgId", "kind", "series");

-- CreateIndex
CREATE INDEX "VatRate_validFrom_validTo_idx" ON "VatRate"("validFrom", "validTo");

-- CreateIndex
CREATE INDEX "Client_orgId_name_idx" ON "Client"("orgId", "name");

-- CreateIndex
CREATE INDEX "Project_orgId_name_idx" ON "Project"("orgId", "name");

-- CreateIndex
CREATE INDEX "Material_orgId_name_idx" ON "Material"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Material_orgId_code_key" ON "Material"("orgId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "LaborRate_orgId_trade_key" ON "LaborRate"("orgId", "trade");

-- CreateIndex
CREATE INDEX "CatalogItem_orgId_category_idx" ON "CatalogItem"("orgId", "category");

-- CreateIndex
CREATE INDEX "CatalogItem_orgId_chapterCode_idx" ON "CatalogItem"("orgId", "chapterCode");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItem_orgId_code_key" ON "CatalogItem"("orgId", "code");

-- CreateIndex
CREATE INDEX "CatalogItemMaterial_materialId_idx" ON "CatalogItemMaterial"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItemMaterial_catalogItemId_materialId_key" ON "CatalogItemMaterial"("catalogItemId", "materialId");

-- CreateIndex
CREATE INDEX "Estimate_orgId_status_idx" ON "Estimate"("orgId", "status");

-- CreateIndex
CREATE INDEX "Estimate_orgId_createdAt_idx" ON "Estimate"("orgId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_orgId_series_number_key" ON "Estimate"("orgId", "series", "number");

-- CreateIndex
CREATE INDEX "EstimateSection_estimateId_sortOrder_idx" ON "EstimateSection"("estimateId", "sortOrder");

-- CreateIndex
CREATE INDEX "EstimateLine_estimateId_sortOrder_idx" ON "EstimateLine"("estimateId", "sortOrder");

-- CreateIndex
CREATE INDEX "EstimateLine_sectionId_idx" ON "EstimateLine"("sectionId");

-- CreateIndex
CREATE INDEX "ProgressReport_estimateId_idx" ON "ProgressReport"("estimateId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressReport_orgId_series_number_key" ON "ProgressReport"("orgId", "series", "number");

-- CreateIndex
CREATE INDEX "ProgressLine_estimateLineId_idx" ON "ProgressLine"("estimateLineId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressLine_progressReportId_estimateLineId_key" ON "ProgressLine"("progressReportId", "estimateLineId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_reversalOfId_key" ON "Invoice"("reversalOfId");

-- CreateIndex
CREATE INDEX "Invoice_orgId_status_idx" ON "Invoice"("orgId", "status");

-- CreateIndex
CREATE INDEX "Invoice_orgId_issueDate_idx" ON "Invoice"("orgId", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_orgId_series_number_key" ON "Invoice"("orgId", "series", "number");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_sortOrder_idx" ON "InvoiceLine"("invoiceId", "sortOrder");

-- CreateIndex
CREATE INDEX "AiRun_orgId_createdAt_idx" ON "AiRun"("orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSeries" ADD CONSTRAINT "DocumentSeries_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborRate" ADD CONSTRAINT "LaborRate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_laborRateId_fkey" FOREIGN KEY ("laborRateId") REFERENCES "LaborRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItemMaterial" ADD CONSTRAINT "CatalogItemMaterial_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItemMaterial" ADD CONSTRAINT "CatalogItemMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateSection" ADD CONSTRAINT "EstimateSection_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLine" ADD CONSTRAINT "EstimateLine_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLine" ADD CONSTRAINT "EstimateLine_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "EstimateSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLine" ADD CONSTRAINT "EstimateLine_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressReport" ADD CONSTRAINT "ProgressReport_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressReport" ADD CONSTRAINT "ProgressReport_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressLine" ADD CONSTRAINT "ProgressLine_progressReportId_fkey" FOREIGN KEY ("progressReportId") REFERENCES "ProgressReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressLine" ADD CONSTRAINT "ProgressLine_estimateLineId_fkey" FOREIGN KEY ("estimateLineId") REFERENCES "EstimateLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_progressReportId_fkey" FOREIGN KEY ("progressReportId") REFERENCES "ProgressReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
