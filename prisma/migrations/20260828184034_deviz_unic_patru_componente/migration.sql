/*
  Devizul nu mai are mod. Fiecare linie poarta patru preturi unitare — material,
  manopera, utilaj, transport — iar recapitulatia le totalizeaza pe toate patru.

  Nu se face backfill si nu se atinge niciun ban existent:

  - Liniile din devizele care erau SEPARAT au deja materialul si manopera pe
    coloanele lor; utilajul si transportul intra cu 0.
  - Liniile din devizele care erau COMBINAT poarta pretul intreg pe
    `materialUnitPrice` (asa era conventia) si raman acolo. Totalul lor nu se
    schimba, dar in recapitulatie apar integral pe coloana Material. Defalcarea
    reala o scrie omul, editand devizul — nicio impartire automata nu ar fi
    altceva decat o cifra inventata.

  `Invoice.scope` si enum-ul `InvoiceScope` raman: facturile deja emise pe
  materiale sau pe manopera nu se modifica. De acum incolo se scrie doar TOT.

  Warnings:

  - You are about to drop the column `mode` on the `Estimate` table. All the data in the column will be lost.
  - You are about to drop the column `defaultMode` on the `Organization` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Estimate" DROP COLUMN "mode",
ADD COLUMN     "totalEquipment" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalTransport" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "EstimateLine" ADD COLUMN     "equipmentUnitPrice" DECIMAL(12,4) NOT NULL DEFAULT 0,
ADD COLUMN     "transportUnitPrice" DECIMAL(12,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Organization" DROP COLUMN "defaultMode";

-- AlterTable
ALTER TABLE "ProgressLine" ADD COLUMN     "equipmentUnitPrice" DECIMAL(12,4) NOT NULL DEFAULT 0,
ADD COLUMN     "transportUnitPrice" DECIMAL(12,4) NOT NULL DEFAULT 0;

-- DropEnum
DROP TYPE "EstimateMode";
