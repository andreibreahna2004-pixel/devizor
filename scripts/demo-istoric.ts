/**
 * Umple firma demo cu un an de documente, ca graficele de pe panou sa aiba ce
 * arata.
 *
 * Nu inventeaza cifre in baza de date: fiecare deviz isi primeste liniile, iar
 * totalurile ies din `lib/pricing/calculator.ts`, acelasi motor ca in aplicatie.
 * Numerele de document se aloca prin `allocateDocumentNumber`, deci seria ramine
 * fara goluri si continua de unde era.
 *
 * Ruleaza dupa `npm run db:seed`, cu: npm run demo:istoric
 */
import { PrismaClient } from "@prisma/client";
import { computeEstimateLine, computeEstimateTotals } from "../lib/pricing/calculator";
import { computeInvoiceLine, computeInvoiceTotals } from "../lib/pricing/calculator";
import { allocateDocumentNumber } from "../lib/numbering/series";

const prisma = new PrismaClient();

/**
 * Generator determinist.
 *
 * Cu `Math.random`, fiecare rulare ar da alt grafic si n-ai putea compara doua
 * capturi de ecran sau reproduce o problema de desen. Un LCG mic, cu simburele
 * fixat, da mereu aceleasi date.
 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const LUCRARI = [
  "Casa parter Berceni — structura",
  "Mansardare bloc Titan",
  "Hala metalica Popesti — fundatii",
  "Reabilitare fatada Bd. Unirii 42",
  "Duplex Chiajna — la rosu",
  "Amenajare spatiu comercial Militari",
  "Consolidare planseu Str. Muncii",
  "Casa P+1 Otopeni — finisaje",
  "Garaj si imprejmuire Snagov",
  "Extindere hala depozitare Jilava",
  "Renovare apartament Aviatiei",
  "Terasa si trotuar perimetral Corbeanca",
];

/** Denumire, U.M., cantitate, apoi material, manopera, utilaj si transport. */
const LINII: [string, string, number, number, number, number, number][] = [
  ["Sapatura mecanizata in teren mijlociu", "mc", 38, 0, 8, 21, 10],
  ["Beton armat in fundatii continue", "mc", 16, 455, 175, 23, 14],
  ["Armatura din otel beton, fasonata si montata", "kg", 1250, 4.9, 1.8, 0, 0],
  ["Zidarie din blocuri BCA 30", "mc", 29, 460, 162, 0, 9],
  ["Termosistem 10 cm pe fatada", "mp", 168, 57, 41, 7, 0],
  ["Tencuiala mecanizata la interior", "mp", 380, 14.4, 15.2, 0, 0],
  ["Zugraveli lavabile in doua straturi", "mp", 380, 4.1, 8.3, 0, 0],
  ["Tamplarie PVC cu geam tripan", "mp", 24, 615, 84, 0, 0],
];

/**
 * Duce contorul fiecarei serii dupa ultimul document existent.
 *
 * Versiunile vechi de `demo-deviz.ts` scriau numarul de mina, fara sa treaca
 * prin alocator, si lasau contorul in urma. Pe o baza facuta atunci, prima
 * alocare ar cere un numar deja folosit si ar pica pe cheia unica. Aici se
 * repara starea, nu se ocoleste regula: alocarea propriu-zisa ramine atomica.
 */
async function sincronizeazaSeriile(orgId: string) {
  const serii = await prisma.documentSeries.findMany({ where: { orgId } });

  for (const serie of serii) {
    const ultimul =
      serie.kind === "DEVIZ"
        ? await prisma.estimate.aggregate({
            where: { orgId, series: serie.series },
            _max: { number: true },
          })
        : serie.kind === "FACTURA"
          ? await prisma.invoice.aggregate({
              where: { orgId, series: serie.series },
              _max: { number: true },
            })
          : null;

    const urmatorul = (ultimul?._max.number ?? 0) + 1;
    if (urmatorul > serie.nextNumber) {
      await prisma.documentSeries.update({
        where: { id: serie.id },
        data: { nextNumber: urmatorul },
      });
      console.log(`Seria ${serie.series} dusa la ${urmatorul}.`);
    }
  }
}

async function main() {
  const org = await prisma.organization.findFirstOrThrow({
    where: { slug: "construct-expert" },
  });
  const client = await prisma.client.findFirstOrThrow({ where: { orgId: org.id } });
  const project = await prisma.project.findFirst({ where: { orgId: org.id } });

  const deja = await prisma.estimate.count({ where: { orgId: org.id } });
  if (deja > 3) {
    console.log(`Firma are deja ${deja} devize — nu mai adaug istoric.`);
    return;
  }

  await sincronizeazaSeriile(org.id);

  const vatRate = Number(org.defaultVatRate);
  const aleator = rng(20260815);
  const acum = new Date();

  let nrDevize = 0;
  let nrFacturi = 0;

  // De acum douasprezece luni pina luna trecuta. Luna curenta ramine cum e, ca
  // sa nu acopere devizul demo pe care il stie deja cine a rulat `demo:deviz`.
  for (let inapoi = 12; inapoi >= 1; inapoi--) {
    const luna = new Date(acum.getFullYear(), acum.getMonth() - inapoi, 1);
    const zileInLuna = new Date(luna.getFullYear(), luna.getMonth() + 1, 0).getDate();

    // Iarna se lucreaza mai putin pe santier; vara, mai mult. Fara asta, linia
    // ar fi zgomot uniform si graficul n-ar semana cu un an de constructii.
    const iarna = [11, 0, 1].includes(luna.getMonth());
    const cite = iarna ? 1 : 1 + Math.floor(aleator() * 3);

    for (let i = 0; i < cite; i++) {
      const data = new Date(
        luna.getFullYear(),
        luna.getMonth(),
        1 + Math.floor(aleator() * zileInLuna),
        9 + Math.floor(aleator() * 8),
      );

      // Devizul ia un subset de linii, cu cantitatile scalate.
      const factor = 0.55 + aleator() * 1.5;
      const alese = LINII.filter(() => aleator() > 0.25);
      const linii = (alese.length > 0 ? alese : LINII.slice(0, 4)).map(
        ([name, unit, qty, mat, man, uti, tra]) => ({
          name,
          unit,
          quantity: Math.round(qty * factor * 100) / 100,
          materialUnitPrice: mat,
          laborUnitPrice: man,
          equipmentUnitPrice: uti,
          transportUnitPrice: tra,
        }),
      );

      const totals = computeEstimateTotals(linii, vatRate);

      const deviz = await prisma.$transaction(async (tx) => {
        const nr = await allocateDocumentNumber(tx, org.id, "DEVIZ");
        return tx.estimate.create({
          data: {
            orgId: org.id,
            series: nr.series,
            number: nr.number,
            fullNumber: nr.fullNumber,
            title: LUCRARI[(inapoi * 3 + i) % LUCRARI.length],
            clientId: client.id,
            projectId: project?.id ?? null,
            vatRate: org.defaultVatRate,
            status: "ACCEPTAT",
            issueDate: data,
            createdAt: data,
            updatedAt: data,
            totalMaterial: totals.totalMaterial,
            totalLabor: totals.totalLabor,
            totalEquipment: totals.totalEquipment,
            totalTransport: totals.totalTransport,
            netTotal: totals.netTotal,
            vatAmount: totals.vatAmount,
            grandTotal: totals.grandTotal,
            lines: {
              create: linii.map((l, idx) => {
                const t = computeEstimateLine(l);
                return {
                  name: l.name,
                  unit: l.unit,
                  quantity: l.quantity,
                  materialUnitPrice: l.materialUnitPrice,
                  laborUnitPrice: l.laborUnitPrice,
                  equipmentUnitPrice: l.equipmentUnitPrice,
                  transportUnitPrice: l.transportUnitPrice,
                  unitPrice: t.unitPrice,
                  total: t.total,
                  sortOrder: idx,
                  reviewed: true,
                };
              }),
            },
          },
        });
      });
      nrDevize++;

      // Cam trei sferturi din devizele acceptate ajung factura, la citeva zile
      // dupa. Cele mai vechi de doua luni sint deja incasate.
      if (aleator() > 0.25) {
        const dataFactura = new Date(data);
        dataFactura.setDate(dataFactura.getDate() + 3 + Math.floor(aleator() * 20));
        if (dataFactura > acum) dataFactura.setTime(acum.getTime());

        const liniiFactura = linii.map((l) => ({
          quantity: l.quantity,
          unitPrice:
            Math.round(
              (l.materialUnitPrice +
                l.laborUnitPrice +
                l.equipmentUnitPrice +
                l.transportUnitPrice) *
                100,
            ) / 100,
          vatRate,
        }));
        const ft = computeInvoiceTotals(liniiFactura);

        const scadenta = new Date(dataFactura);
        scadenta.setDate(scadenta.getDate() + 30);

        await prisma.$transaction(async (tx) => {
          const nr = await allocateDocumentNumber(tx, org.id, "FACTURA");
          await tx.invoice.create({
            data: {
              orgId: org.id,
              series: nr.series,
              number: nr.number,
              fullNumber: nr.fullNumber,
              clientId: client.id,
              projectId: project?.id ?? null,
              estimateId: deviz.id,
              scope: "TOT",
              status: inapoi >= 2 ? "PLATITA" : "EMISA",
              issueDate: dataFactura,
              dueDate: scadenta,
              createdAt: dataFactura,
              updatedAt: dataFactura,
              supplierSnapshot: {
                name: org.name,
                cui: org.cui,
                vatPayer: org.vatPayer,
                regCom: org.regCom,
                address: org.address,
                city: org.city,
                countyCode: org.countyCode,
                postalCode: org.postalCode,
                country: org.country,
                email: org.email,
                phone: org.phone,
                iban: org.iban,
                bank: org.bank,
              },
              clientSnapshot: {
                name: client.name,
                cui: client.cui,
                vatPayer: client.vatPayer,
                regCom: client.regCom,
                address: client.address,
                city: client.city,
                countyCode: client.countyCode,
                postalCode: client.postalCode,
                country: client.country,
                email: client.email,
                phone: client.phone,
                iban: client.iban,
                bank: client.bank,
              },
              netTotal: ft.netTotal,
              vatAmount: ft.vatAmount,
              grandTotal: ft.grandTotal,
              lines: {
                create: liniiFactura.map((l, idx) => {
                  const t = computeInvoiceLine(l);
                  return {
                    name: linii[idx].name,
                    unit: linii[idx].unit,
                    quantity: l.quantity,
                    unitPrice: l.unitPrice,
                    vatRate: l.vatRate,
                    netAmount: t.netAmount,
                    vatAmount: t.vatAmount,
                    total: t.total,
                    sortOrder: idx,
                  };
                }),
              },
            },
          });
        });
        nrFacturi++;
      }
    }
  }

  console.log(`DEVIZE=${nrDevize}`);
  console.log(`FACTURI=${nrFacturi}`);
}

main().finally(() => prisma.$disconnect());
