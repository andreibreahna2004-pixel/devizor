-- CreateTable
CREATE TABLE "EstimateSuggestion" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(14,4),
    "reason" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstimateSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EstimateSuggestion_estimateId_sortOrder_idx" ON "EstimateSuggestion"("estimateId", "sortOrder");

-- AddForeignKey
ALTER TABLE "EstimateSuggestion" ADD CONSTRAINT "EstimateSuggestion_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
