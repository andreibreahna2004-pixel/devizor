import "server-only";
import { type MaterialPriceSource, type Prisma } from "@prisma/client";
import { type RangeKey, bucketsFor, ultima } from "@/lib/charts/buckets";
import { prisma } from "@/lib/db";
import { toNumber } from "@/lib/money";
import { toDecimal } from "@/lib/money-db";
import { type PriceObservation } from "./import";
import { type LaborIndexObservation } from "./labor-source";
import { cautaLaFurnizor, scraperActiv } from "./scraper";
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
  /** Observatii identice, deja in baza; nu se scriu a doua oara. */
  duplicate: number;
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
  sursa?: MaterialPriceSource,
): Promise<ImportResult> {
  if (observatii.length === 0) return { materialeNoi: 0, observatii: 0, duplicate: 0 };

  // Pe loturi, nu observatie cu observatie. Cu patru magazine intrebate deodata,
  // scrierea una cate una ar face cateva sute de dus-intors la baza chiar pe calea
  // de randare a paginii omului. Semantica ramane neschimbata: se cauta materialul
  // dupa (nume, unitate), se sare peste masuratorile identice, nimic nu se rescrie.
  const perechi = new Map<string, { name: string; unit: string }>();
  for (const o of observatii) perechi.set(`${o.name}|${o.unit}`, { name: o.name, unit: o.unit });

  const existente = await prisma.material.findMany({
    where: { OR: [...perechi.values()] },
    select: { id: true, name: true, unit: true },
  });

  const idMaterial = new Map(existente.map((m) => [`${m.name}|${m.unit}`, m.id]));
  let materialeNoi = 0;

  for (const [cheie, date] of perechi) {
    if (idMaterial.has(cheie)) continue;
    const creat = await prisma.material.create({ data: date, select: { id: true } });
    idMaterial.set(cheie, creat.id);
    materialeNoi++;
  }

  const ids = [...idMaterial.values()];
  const deja = await prisma.materialPrice.findMany({
    where: {
      materialId: { in: ids },
      observedAt: { in: [...new Set(observatii.map((o) => o.observedAt.getTime()))].map((t) => new Date(t)) },
    },
    select: {
      materialId: true,
      countyCode: true,
      observedAt: true,
      price: true,
      supplier: true,
    },
  });

  const vazute = new Set(
    deja.map((p) =>
      cheieMasuratoare(p.materialId, p.countyCode, p.observedAt, toNumber(p.price), p.supplier),
    ),
  );

  const deScris: Prisma.MaterialPriceCreateManyInput[] = [];
  let duplicate = 0;

  for (const o of observatii) {
    const materialId = idMaterial.get(`${o.name}|${o.unit}`);
    if (!materialId) continue;

    const cheie = cheieMasuratoare(materialId, o.countyCode, o.observedAt, o.price, o.supplier);
    if (vazute.has(cheie)) {
      duplicate++;
      continue;
    }
    vazute.add(cheie);

    deScris.push({
      materialId,
      countyCode: o.countyCode,
      price: toDecimal(o.price, 4),
      source: sursa ?? (o.supplier ? "LISTA" : "MANUAL"),
      supplier: o.supplier,
      sourceUrl: o.sourceUrl,
      observedAt: o.observedAt,
    });
  }

  if (deScris.length > 0) await prisma.materialPrice.createMany({ data: deScris });

  return { materialeNoi, observatii: deScris.length, duplicate };
}

/**
 * Ce inseamna "aceeasi masuratoare".
 *
 * `supplier` face parte din cheie, si asta conteaza de cand se intreaba mai multe
 * magazine deodata: cu o singura marca de timp pe toata cautarea, doua magazine
 * care listeaza acelasi produs la acelasi pret ar parea aceeasi observatie, iar al
 * doilea furnizor ar disparea din catalog. Doua magazine sunt doua masuratori.
 */
function cheieMasuratoare(
  materialId: string,
  countyCode: string | null,
  observedAt: Date,
  price: number,
  supplier: string | null,
): string {
  return [
    materialId,
    countyCode ?? "",
    observedAt.getTime(),
    price.toFixed(4),
    supplier ?? "",
  ].join("|");
}

export interface LaborImportResult {
  scrisi: number;
  actualizati: number;
}

/**
 * Scrie indicii de manopera pe judet.
 *
 * Aici se face upsert, spre deosebire de preturi, si diferenta e reala: un pret
 * observat intr-o zi e un fapt de ziua aceea, pe cand indicele unei perioade e
 * o statistica ce se revizuieste. Cand institutul corecteaza trimestrul trecut,
 * valoarea corecta o inlocuieste pe cea provizorie — doua randuri pe aceeasi
 * perioada ar insemna doua adevaruri despre acelasi trimestru. De asta perechea
 * (judet, perioada) e unica in schema.
 */
export async function importaIndiciManopera(
  observatii: LaborIndexObservation[],
): Promise<LaborImportResult> {
  let scrisi = 0;
  let actualizati = 0;

  for (const o of observatii) {
    const existent = await prisma.laborIndex.findUnique({
      where: { countyCode_period: { countyCode: o.countyCode, period: o.period } },
      select: { id: true },
    });

    await prisma.laborIndex.upsert({
      where: { countyCode_period: { countyCode: o.countyCode, period: o.period } },
      create: {
        countyCode: o.countyCode,
        period: o.period,
        value: toDecimal(o.value, 4),
        sourceUrl: o.sourceUrl,
      },
      update: { value: toDecimal(o.value, 4), sourceUrl: o.sourceUrl },
    });

    if (existent) actualizati++;
    else scrisi++;
  }

  return { scrisi, actualizati };
}

/**
 * Indicele cel mai recent al unui judet, sau `null` cand nu s-a importat nimic
 * pentru el. `null` nu se inlocuieste cu 1: vezi `manoperaCuIndice`, unde lipsa
 * indicelui lasa reperul national neatins si spus ca atare.
 */
export async function indiceManopera(countyCode: string | null): Promise<number | null> {
  if (!countyCode) return null;

  const indice = await prisma.laborIndex.findFirst({
    where: { countyCode },
    select: { value: true },
    orderBy: { period: "desc" },
  });

  return indice ? toNumber(indice.value) : null;
}

export interface CautareProaspata {
  materiale: MaterialCuReper[];
  /** Adevarat cand s-a cerut la magazin in cautarea asta. */
  cerutLaFurnizor: boolean;
  /** Cate observatii noi au intrat in catalog. */
  observatiiNoi: number;
  /** Magazinele care au raspuns la cautarea asta. */
  furnizori: string[];
}

/** Sub atita, ce e in catalog se considera proaspat si nu se mai cere nimic. */
function ttlOre(): number {
  const din = Number(process.env.SCRAPER_TTL_ORE);
  return Number.isFinite(din) && din > 0 ? din : 24;
}

/**
 * Cautarea care isi improspateaza singura catalogul.
 *
 * Local intii — instant, si de cele mai multe ori destul. Se iese la magazin
 * numai cand catalogul n-are nimic pentru interogarea asta, sau cand ce are e
 * mai vechi decat TTL-ul.
 *
 * De ce nu se afiseaza direct ce s-a gasit acum, fara sa mai treaca prin baza:
 * `MaterialPrice` **creste, nu se rescrie**, si de acolo iese graficul de
 * evolutie. Trecand prin catalog, fiecare cautare a unui om lasa in urma o
 * masuratoare datata — asa se construieste seria in timp, in loc sa se arate un
 * pret fara istorie.
 */
export async function cautaMaterialeProaspete(
  interogare: string,
  countyCode: string | null,
  range: RangeKey = "1A",
  cauta?: (interogare: string) => Promise<PriceObservation[]>,
  /** Firma care cauta: numai pentru auditul apelurilor de model. Vezi `audit.ts`. */
  cine?: { orgId: string; userId?: string | null },
): Promise<CautareProaspata> {
  const laMagazine =
    cauta ?? ((q: string) => cautaLaFurnizor(q, { orgId: cine?.orgId, userId: cine?.userId }));
  const local = await cautaMateriale(interogare, countyCode, range);

  if (!interogare.trim() || !scraperActiv()) {
    return { materiale: local, cerutLaFurnizor: false, observatiiNoi: 0, furnizori: [] };
  }

  const celMaiNou = local.reduce<number>(
    (max, m) => Math.max(max, m.reper?.observedAt.getTime() ?? 0),
    0,
  );
  const invechit = Date.now() - celMaiNou > ttlOre() * 3_600_000;
  if (local.length > 0 && !invechit) {
    return { materiale: local, cerutLaFurnizor: false, observatiiNoi: 0, furnizori: [] };
  }

  const observatii = await laMagazine(interogare);
  const furnizori = [
    ...new Set(observatii.map((o) => o.supplier).filter((f): f is string => Boolean(f))),
  ];

  if (observatii.length === 0) {
    return { materiale: local, cerutLaFurnizor: true, observatiiNoi: 0, furnizori };
  }

  const scrise = await importaObservatii(observatii, "FURNIZOR");

  return {
    materiale: await cautaMateriale(interogare, countyCode, range),
    cerutLaFurnizor: true,
    observatiiNoi: scrise.observatii,
    furnizori,
  };
}
