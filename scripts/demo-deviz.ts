/**
 * Creeaza un deviz demonstrativ, scris de mana.
 *
 * Util pentru a umbla prin aplicatie fara a consuma o generare AI, si pentru
 * a verifica PDF-ul si exportul e-Factura pe date realiste. Devizul e in modul
 * SEPARAT, ca sa se poata incerca si cele doua PDF-uri, si cele doua facturi.
 * Ruleaza dupa `npm run db:seed`, cu: npm run demo:deviz
 */
import { PrismaClient } from "@prisma/client";
import { getNorma } from "../lib/norme";
import { allocateDocumentNumber } from "../lib/numbering/series";
import { computeEstimateLine, computeEstimateTotals } from "../lib/pricing/calculator";

const prisma = new PrismaClient();

/**
 * O linie demo: cod de norma (sau null pentru lucrarile care nu au norma in
 * indicatorul C), denumire de rezerva, U.M., cantitate si cele doua preturi.
 *
 * Cand exista cod, denumirea si unitatea vin din indicator — exact ca in
 * aplicatie, unde linia cu cod oficial spune ce spune norma.
 */
type Pick = [string | null, string, string, number, number, number];

const SECTIONS: { name: string; lines: Pick[] }[] = [
  {
    name: "Infrastructura",
    lines: [
      [null, "Sapatura mecanizata in teren mijlociu", "mc", 42, 0, 28],
      ["CA01J1", "Beton de egalizare sub fundatii", "mc", 4.2, 380, 95],
      ["CA02C1", "Beton armat in fundatii continue", "mc", 18.5, 460, 180],
      ["CC01A1", "Armatura din otel beton, fasonata si montata", "kg", 1450, 4.9, 1.8],
      ["CB11E1", "Cofraje din panouri in elevatie", "mp", 96, 22, 38],
    ],
  },
  {
    name: "Suprastructura",
    lines: [
      ["CD07C1", "Zidarie din blocuri BCA", "mc", 34.5, 463, 164],
      [null, "Stalpisori si centuri din beton armat C20/25", "mc", 8.2, 470, 210],
      ["CA07H1", "Planseu din beton armat de 15 cm", "mc", 14.4, 480, 195],
    ],
  },
  {
    name: "Invelitoare",
    lines: [
      ["CE17C1", "Sarpanta din lemn ecarisat, cu astereala", "mp", 155, 118, 62],
      ["CE01A1", "Invelitoare din tigla ceramica, inclusiv accesorii", "mp", 155, 96, 44],
    ],
  },
  {
    name: "Termoizolatii si fatade",
    lines: [
      [null, "Termosistem 10 cm polistiren expandat pe fatada", "mp", 186, 58, 42],
      [null, "Tencuiala decorativa siliconica, strat final", "mp", 186, 24, 26],
    ],
  },
  {
    name: "Finisaje interioare",
    lines: [
      [null, "Tencuiala mecanizata cu gips la interior", "mp", 420, 14.4, 15.4],
      ["CF10C1", "Glet de finisaj in doua straturi", "mp", 420, 6.2, 11.5],
      [null, "Zugraveli lavabile in doua straturi", "mp", 420, 4.1, 8.4],
      [null, "Parchet laminat cu folie si plinta", "mp", 120, 78, 32],
      ["CG11A1", "Gresie montata cu adeziv", "mp", 38, 92, 58],
      [null, "Tamplarie PVC cu geam tripan, montata", "mp", 26, 620, 85],
    ],
  },
  {
    name: "Instalatii",
    lines: [
      [null, "Instalatie sanitara completa, pe obiect sanitar", "buc", 85, 210, 145],
      [null, "Instalatie electrica completa, pe punct de consum", "buc", 240, 74, 52],
      [null, "Centrala termica murala si racorduri", "buc", 9, 4200, 480],
    ],
  },
];

async function main() {
  const org = await prisma.organization.findFirstOrThrow({
    where: { slug: "construct-expert" },
  });
  const client = await prisma.client.findFirstOrThrow({ where: { orgId: org.id } });
  const project = await prisma.project.findFirstOrThrow({ where: { orgId: org.id } });

  const existing = await prisma.estimate.findFirst({ where: { orgId: org.id } });
  if (existing) {
    console.log("ESTIMATE_ID=" + existing.id);
    return;
  }

  // Numarul se ia din serie, nu se scrie de mina: altfel contorul firmei ramine
  // la 1 si primul document emis din aplicatie s-ar ciocni cu devizul demo.
  const nr = await prisma.$transaction((tx) =>
    allocateDocumentNumber(tx, org.id, "DEVIZ"),
  );

  const estimate = await prisma.estimate.create({
    data: {
      orgId: org.id,
      series: nr.series,
      number: nr.number,
      fullNumber: nr.fullNumber,
      title: "Casa P+1 Floresti — structura si finisaje",
      mode: "SEPARAT",
      clientId: client.id,
      projectId: project.id,
      vatRate: org.defaultVatRate,
      aiBrief:
        "Casa P+1, amprenta 120 mp, zidarie BCA 30, sarpanta lemn cu tigla ceramica, termosistem 10 cm, finisaje medii.",
      sections: {
        create: SECTIONS.map((section, i) => ({ name: section.name, sortOrder: i })),
      },
    },
    include: { sections: { orderBy: { sortOrder: "asc" } } },
  });

  let order = 0;
  for (const [index, section] of SECTIONS.entries()) {
    const sectionId = estimate.sections[index].id;

    for (const [cod, fallbackName, fallbackUnit, quantity, material, labor] of section.lines) {
      const totals = computeEstimateLine({
        quantity,
        materialUnitPrice: material,
        laborUnitPrice: labor,
      });

      const norma = cod ? getNorma(cod) : null;
      if (cod && !norma) throw new Error(`Codul demo ${cod} nu exista in indicator`);

      await prisma.estimateLine.create({
        data: {
          estimateId: estimate.id,
          sectionId,
          code: norma?.cod ?? null,
          name: norma?.denumire ?? fallbackName,
          unit: norma?.um ?? fallbackUnit,
          quantity,
          materialUnitPrice: material,
          laborUnitPrice: labor,
          unitPrice: totals.unitPrice,
          total: totals.total,
          sortOrder: order++,
          aiGenerated: true,
          aiJustification: `Cantitate din antemasuratoare: ${quantity} ${norma?.um ?? fallbackUnit}. Verificat pe plan.`,
          aiConfidence: order % 3 === 0 ? "MICA" : order % 2 === 0 ? "MEDIE" : "MARE",
        },
      });
    }
  }

  const lines = await prisma.estimateLine.findMany({
    where: { estimateId: estimate.id },
  });
  const totals = computeEstimateTotals(
    lines.map((l) => ({
      quantity: Number(l.quantity),
      materialUnitPrice: Number(l.materialUnitPrice),
      laborUnitPrice: Number(l.laborUnitPrice),
    })),
    Number(org.defaultVatRate),
  );

  await prisma.estimate.update({
    where: { id: estimate.id },
    data: {
      totalMaterial: totals.totalMaterial,
      totalLabor: totals.totalLabor,
      netTotal: totals.netTotal,
      vatAmount: totals.vatAmount,
      grandTotal: totals.grandTotal,
    },
  });

  console.log("ESTIMATE_ID=" + estimate.id);
  console.log("MATERIALE=" + totals.totalMaterial);
  console.log("MANOPERA=" + totals.totalLabor);
  console.log("TOTAL=" + totals.grandTotal);
}

main().finally(() => prisma.$disconnect());
