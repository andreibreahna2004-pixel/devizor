/**
 * Cateva materiale cu istoric de pret, ca sa se poata umbla prin pagina fara
 * import real. Determinist: doua rulari dau aceleasi grafice.
 *
 * Ruleaza cu: npx tsx scripts/seed-materiale.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const MATERIALE: [string, string, number, number[]][] = [
  // denumire, um, pret de pornire, variatii lunare in procente
  ["Ciment Portland CEM II 42,5R 40 kg", "sac", 23.9, [0, 1.5, 2, 0, 3.5, 1, 0, 2.5, 1.5, 0, 1, 2]],
  ["Adeziv gresie si faianta 25 kg", "sac", 31.5, [0, 0, 1, 2.5, 0, 0, 1.5, 0, 2, 0, 0.5, 1]],
  ["Polistiren expandat EPS80 10 cm", "mp", 28.4, [0, 2, 3, 1, 0, -1, 0, 2, 4, 1, 0, 1.5]],
  ["Caramida BCA 30 cm", "buc", 12.75, [0, 1, 0, 2, 1, 0, 0, 1.5, 0, 2, 1, 0]],
  ["Sapa autonivelanta 25 kg", "sac", 42.0, [0, 0, 2, 0, 1.5, 0, 3, 0, 0, 1, 0, 2]],
  ["Vopsea lavabila interior 15 l", "bidon", 148.0, [0, 1, 0, 0, 2, 0, 1, 0, 3, 0, 0, 1]],
];

const JUDETE = ["RO-B", "RO-CJ", "RO-BT"];
// Bucurestiul e mai scump, Botosaniul mai ieftin. Raporturi fixe, ca sa se vada
// diferenta pe zona fara sa pretinda ca sunt masuratori reale.
const FACTOR: Record<string, number> = { "RO-B": 1.06, "RO-CJ": 1.0, "RO-BT": 0.92 };

async function main() {
  await prisma.materialPrice.deleteMany({});
  await prisma.material.deleteMany({});

  const acum = new Date();
  let observatii = 0;

  for (const [name, unit, pornire, variatii] of MATERIALE) {
    const material = await prisma.material.create({ data: { name, unit } });

    let pret = pornire;
    for (let i = 0; i < variatii.length; i++) {
      pret = pret * (1 + variatii[i] / 100);
      const cand = new Date(acum.getFullYear(), acum.getMonth() - (variatii.length - 1 - i), 12);

      for (const judet of JUDETE) {
        await prisma.materialPrice.create({
          data: {
            materialId: material.id,
            countyCode: judet,
            price: Math.round(pret * FACTOR[judet] * 100) / 100,
            source: "LISTA",
            supplier: "Lista demo",
            observedAt: cand,
          },
        });
        observatii++;
      }
    }
  }

  console.log(`MATERIALE=${MATERIALE.length}`);
  console.log(`OBSERVATII=${observatii}`);
}

main().finally(() => prisma.$disconnect());
