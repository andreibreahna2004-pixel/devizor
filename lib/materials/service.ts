import "server-only";
import { type RangeKey, bucketsFor, ultima } from "@/lib/charts/buckets";
import { prisma } from "@/lib/db";
import { toNumber } from "@/lib/money";
import { toDecimal } from "@/lib/money-db";
import { type PriceObservation } from "./import";
import { type Reper, potrivesteMaterial, reperPentruJudet } from "./pricing";

/**
 * Catalogul de preturi de referinta.
 *
 * Nomenclator national: preturile pietei sunt aceleasi pentru toate firmele,
 * deci nu poarta `orgId`. E singurul loc din aplicatie unde asta e in regula,
 * si e in regula pentru ca nimic de aici nu ajunge singur intr-un deviz.
 */

export interface MaterialCuReper {
  id: string;
  name: string;
  unit: string;
  category: string | null;
  reper: Reper | null;
  /** Evolutia pretului, pentru sparkline. `null` unde n-a existat masuratoare. */
  evolutie: (number | null)[];
}

/**
 * Cauta materiale si aduce pentru fiecare reperul pe judet si evolutia lui.
 *
 * Cautarea se face in memorie, ca la norme: catalogul e de ordinul miilor de
 * randuri, iar potrivirea fara diacritice si pe cuvinte partiale n-are echivalent
 * simplu in SQL. Daca ajunge la sute de mii, se muta pe un index de text.
 */
export async function cautaMateriale(
  interogare: string,
  countyCode: string | null,
  range: RangeKey = "1A",
  limit = 40,
): Promise<MaterialCuReper[]> {
  const toate = await prisma.material.findMany({
    select: { id: true, name: true, unit: true, category: true },
    orderBy: { name: "asc" },
  });

  const potrivite = interogare.trim()
    ? toate.filter((m) => potrivesteMaterial(m.name, interogare))
    : toate;

  const alese = potrivite.slice(0, limit);
  if (alese.length === 0) return [];

  const preturi = await prisma.materialPrice.findMany({
    where: { materialId: { in: alese.map((m) => m.id) } },
    select: {
      materialId: true,
      price: true,
      countyCode: true,
      observedAt: true,
      supplier: true,
      sourceUrl: true,
    },
    orderBy: { observedAt: "asc" },
  });

  const peMaterial = new Map<string, typeof preturi>();
  for (const p of preturi) {
    const b = peMaterial.get(p.materialId);
    if (b) b.push(p);
    else peMaterial.set(p.materialId, [p]);
  }

  const buckets = bucketsFor(range, new Date());

  return alese.map((m) => {
    const ale = peMaterial.get(m.id) ?? [];
    const observatii = ale.map((p) => ({
      price: toNumber(p.price),
      countyCode: p.countyCode,
      observedAt: p.observedAt,
      supplier: p.supplier,
      sourceUrl: p.sourceUrl,
    }));

    // Evolutia se deseneaza din observatiile zonei cerute cand exista; altfel
    // din tot ce se stie. Un grafic care amesteca judetele ar arata salturi care
    // sunt diferenta dintre Cluj si Botosani, nu o miscare de pret.
    const aleZonei = countyCode ? observatii.filter((o) => o.countyCode === countyCode) : [];
    const pentruGrafic = aleZonei.length > 1 ? aleZonei : observatii;

    return {
      ...m,
      reper: reperPentruJudet(observatii, countyCode),
      evolutie: ultima(
        pentruGrafic.map((o) => ({ data: o.observedAt, valoare: o.price })),
        buckets,
      ),
    };
  });
}

/** Evolutia unui singur material, pentru graficul mare. */
export async function evolutieMaterial(
  materialId: string,
  countyCode: string | null,
  range: RangeKey,
): Promise<{ etichete: string[]; valori: (number | null)[] }> {
  const preturi = await prisma.materialPrice.findMany({
    where: { materialId, ...(countyCode ? { countyCode } : {}) },
    select: { price: true, observedAt: true },
    orderBy: { observedAt: "asc" },
  });

  const buckets = bucketsFor(range, new Date());
  return {
    etichete: buckets.map((b) => b.eticheta),
    valori: ultima(
      preturi.map((p) => ({ data: p.observedAt, valoare: toNumber(p.price) })),
      buckets,
    ),
  };
}

export interface ImportResult {
  materialeNoi: number;
  observatii: number;
}

/**
 * Scrie observatiile in catalog.
 *
 * Materialul se creeaza doar daca nu exista deja cu acelasi nume si unitate.
 * Preturile se ADAUGA intotdeauna, niciodata nu se suprascriu: doua importuri la
 * date diferite lasa doua randuri, si de acolo iese evolutia. Un import care ar
 * rescrie ultimul pret ar sterge exact informatia pentru care exista tabelul.
 */
export async function importaObservatii(
  observatii: PriceObservation[],
): Promise<ImportResult> {
  let materialeNoi = 0;
  let scrise = 0;

  for (const o of observatii) {
    let material = await prisma.material.findFirst({
      where: { name: o.name, unit: o.unit },
      select: { id: true },
    });

    if (!material) {
      material = await prisma.material.create({
        data: { name: o.name, unit: o.unit },
        select: { id: true },
      });
      materialeNoi++;
    }

    await prisma.materialPrice.create({
      data: {
        materialId: material.id,
        countyCode: o.countyCode,
        price: toDecimal(o.price, 4),
        source: o.supplier ? "LISTA" : "MANUAL",
        supplier: o.supplier,
        sourceUrl: o.sourceUrl,
        observedAt: o.observedAt,
      },
    });
    scrise++;
  }

  return { materialeNoi, observatii: scrise };
}
