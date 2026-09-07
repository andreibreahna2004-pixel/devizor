/*
  Selectoarele invatate pe magazin, si tipul de rulare AI pentru citirea paginilor.

  MIGRARE DOAR DE ADAUGARE, ca precedentele: un tabel nou si o valoare noua de
  enum. Nu sterge nimic si nu atinge niciun rand existent, deci se poate aplica la
  build, inainte ca noul cod sa fie live peste tot. `Estimate.mode` si
  `Organization.defaultMode` raman in baza pana la migrarea de contractie amanata
  — vezi CLAUDE.md.

  `MagazinSelector` tine selectoarele CSS prin care se citeste lista de produse a
  unui magazin. Nu sunt scrise de mana: le gaseste modelul, uitandu-se la pagina
  reala, si se salveaza doar dupa ce s-au verificat pe aceeasi pagina. De aici vine
  faptul ca modelul e chemat o data per magazin per redesign, nu la fiecare
  cautare. Tabelul e national, fara `orgId`: e o observatie despre un site public,
  ca normele si cotele de TVA.

  `magazin` e unic: un magazin are un singur set de selectoare valabil la un moment
  dat. Cand nu mai prind, randul se sterge si se reinvata.
*/

-- AlterEnum
ALTER TYPE "AiRunKind" ADD VALUE 'MATERIALE';

-- CreateTable
CREATE TABLE "MagazinSelector" (
    "id" TEXT NOT NULL,
    "magazin" TEXT NOT NULL,
    "selectoare" JSONB NOT NULL,
    "invatatLa" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reusite" INTEGER NOT NULL DEFAULT 0,
    "esecuri" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MagazinSelector_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MagazinSelector_magazin_key" ON "MagazinSelector"("magazin");
