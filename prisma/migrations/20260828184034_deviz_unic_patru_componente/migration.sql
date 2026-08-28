/*
  Devizul nu mai are mod. Fiecare linie poarta patru preturi unitare — material,
  manopera, utilaj, transport — iar recapitulatia le totalizeaza pe toate patru.

  MIGRARE DOAR DE EXPANDARE. Nu sterge nimic, si asta e intentionat.

  `Estimate.mode` si `Organization.defaultMode` raman in baza desi codul nu le mai
  foloseste, iar `DROP`-ul lor vine intr-o migrare separata, dupa ce codul nou e
  live peste tot. Motivul e ordinea de deploy: intre momentul in care migrarea
  ruleaza si cel in care noua versiune incepe sa serveasca, codul vechi e inca in
  aer si citeste amindoua coloanele. Daca ar disparea aici, ar cadea in fereastra
  aceea. Un `ADD COLUMN` in schimb e inofensiv in ambele sensuri: codul vechi
  ignora coloanele noi, codul nou le gaseste la locul lor.

  Ce ramine functioneaza pentru ca ambele coloane au `NOT NULL DEFAULT 'COMBINAT'`
  (vezi `20260812164813_fara_catalog`). Codul nou insereaza fara sa le pomeneasca,
  iar Postgres pune singur valoarea implicita.

  Nu se face backfill si nu se atinge niciun ban existent:

  - Liniile din devizele care erau SEPARAT au deja materialul si manopera pe
    coloanele lor; utilajul si transportul intra cu 0.
  - Liniile din devizele care erau COMBINAT poarta pretul intreg pe
    `materialUnitPrice` (asa era conventia) si raman acolo. Totalul lor nu se
    schimba, dar in recapitulatie apar integral pe coloana Material. Defalcarea
    reala o scrie omul, editand devizul — nicio impartire automata nu ar fi
    altceva decat o cifra inventata.

  `Invoice.scope` si enum-ul `InvoiceScope` raman din alt motiv, permanent:
  facturile deja emise pe materiale sau pe manopera nu se modifica. De acum
  incolo se scrie doar TOT.
*/
-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "totalEquipment" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalTransport" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "EstimateLine" ADD COLUMN     "equipmentUnitPrice" DECIMAL(12,4) NOT NULL DEFAULT 0,
ADD COLUMN     "transportUnitPrice" DECIMAL(12,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ProgressLine" ADD COLUMN     "equipmentUnitPrice" DECIMAL(12,4) NOT NULL DEFAULT 0,
ADD COLUMN     "transportUnitPrice" DECIMAL(12,4) NOT NULL DEFAULT 0;
