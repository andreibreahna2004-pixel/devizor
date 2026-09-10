import "server-only";
import { type MaterialPriceSource } from "@prisma/client";
import { type RangeKey, bucketsFor, ultima } from "@/lib/charts/buckets";
import { prisma } from "@/lib/db";
import { toNumber } from "@/lib/money";
import { toDecimal } from "@/lib/money-db";
import {
  type AgregatPiata,
  agregatePentruTermen,
  observatiiDinCatalog,
  potrivesteTermen,
} from "./agregat";
import { type PriceObservation } from "./import";
import { type LaborIndexObservation } from "./labor-source";
import { scraperActiv } from "./scraper";
import { cautaLaToateMagazinele } from "./scraper/magazine";
import { type TermenDeScanat, vechimeaDinCatalog } from "./scraper/plan";
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
  let materialeNoi = 0;
  let scrise = 0;
  let duplicate = 0;

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

    // Aceeasi observatie, adusa a doua oara, nu se mai scrie. Nu contrazice
    // regula de mai sus: nimic nu se suprascrie si nimic nu se sterge. Un API
    // care intoarce tot istoricul la fiecare rulare ar umple tabelul cu copii
    // ale aceleiasi masuratori, iar graficul ar arata la fel — doar ca peste
    // cateva mii de randuri degeaba.
    // `supplier` intra in cheie fiindca de acum citim la mai multe magazine, iar
    // `observedAt` e normalizat pe zi (vezi `scraper/magazine.ts`). Doua magazine
    // care dau acelasi pret pe acelasi material in aceeasi zi sunt doua fapte,
    // nu unul: fara furnizor in cheie, al doilea s-ar pierde si defalcarea pe
    // magazin ar ramine cu un rand mai putin.
    const existenta = await prisma.materialPrice.findFirst({
      where: {
        materialId: material.id,
        countyCode: o.countyCode,
        observedAt: o.observedAt,
        price: toDecimal(o.price, 4),
        supplier: o.supplier,
      },
      select: { id: true },
    });

    if (existenta) {
      duplicate++;
      continue;
    }

    await prisma.materialPrice.create({
      data: {
        materialId: material.id,
        countyCode: o.countyCode,
        price: toDecimal(o.price, 4),
        source: sursa ?? (o.supplier ? "LISTA" : "MANUAL"),
        supplier: o.supplier,
        sourceUrl: o.sourceUrl,
        observedAt: o.observedAt,
      },
    });
    scrise++;
  }

  return { materialeNoi, observatii: scrise, duplicate };
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
  cauta: (interogare: string) => Promise<PriceObservation[]> = cautaLaToateMagazinele,
): Promise<CautareProaspata> {
  const local = await cautaMateriale(interogare, countyCode, range);

  if (!interogare.trim() || !scraperActiv()) {
    return { materiale: local, cerutLaFurnizor: false, observatiiNoi: 0 };
  }

  const celMaiNou = local.reduce<number>(
    (max, m) => Math.max(max, m.reper?.observedAt.getTime() ?? 0),
    0,
  );
  const invechit = Date.now() - celMaiNou > ttlOre() * 3_600_000;
  if (local.length > 0 && !invechit) {
    return { materiale: local, cerutLaFurnizor: false, observatiiNoi: 0 };
  }

  const observatii = await cauta(interogare);
  if (observatii.length === 0) {
    return { materiale: local, cerutLaFurnizor: true, observatiiNoi: 0 };
  }

  const scrise = await importaObservatii(observatii, "FURNIZOR");

  return {
    materiale: await cautaMateriale(interogare, countyCode, range),
    cerutLaFurnizor: true,
    observatiiNoi: scrise.observatii,
  };
}

/** Cate zile in urma se mai poate compara un pret cu al altui magazin. */
function fereastraZile(): number {
  const din = Number(process.env.SCRAPER_FEREASTRA_ZILE);
  return Number.isFinite(din) && din > 0 ? din : 7;
}

/**
 * Reperul de piata pentru un termen: cat cere, cam, la magazine.
 *
 * Se calculeaza la citire din observatiile care exista deja, si nu se stocheaza
 * nimic. Vezi antetul din `agregat.ts` pentru de ce: un agregat scris in baza ar
 * fi un al doilea adevar despre bani, si ar pune regula 1 in pericol.
 *
 * **Fereastra conteaza.** Fara ea s-ar aseza un pret Dedeman de acum sase luni
 * langa unul Hornbach de azi si s-ar numi comparatie de piata. Se iau numai
 * observatii de la magazine (`FURNIZOR`), naționale (magazinul online n-are pret
 * pe judet) si din fereastra.
 */
export async function agregatLaMagazine(
  termen: string,
  zile = fereastraZile(),
): Promise<AgregatPiata[]> {
  if (!termen.trim()) return [];

  const dinCand = new Date(Date.now() - zile * 24 * 3_600_000);

  // Potrivirea pe termen se face in memorie, ca la `cautaMateriale` si la norme:
  // fara diacritice si pe cuvinte partiale n-are echivalent simplu in SQL.
  const toate = await prisma.material.findMany({
    select: { id: true, name: true, unit: true },
  });

  const potrivite = toate.filter((m) => potrivesteTermen(m.name, termen));
  if (potrivite.length === 0) return [];

  const preturi = await prisma.materialPrice.findMany({
    where: {
      materialId: { in: potrivite.map((m) => m.id) },
      source: "FURNIZOR",
      // Magazinul online n-are pret pe judet, deci numai observatiile naționale
      // sunt de la magazine. Un rind cu judet ar veni din alta sursa.
      countyCode: null,
      supplier: { not: null },
      observedAt: { gte: dinCand },
    },
    select: {
      materialId: true,
      price: true,
      supplier: true,
      sourceUrl: true,
      observedAt: true,
    },
  });

  // Maparea si agregarea sunt pure, ca sa fie verificabile fara baza. Aici
  // ramane doar interogarea.
  const observatii = observatiiDinCatalog(
    potrivite,
    preturi.map((p) => ({
      materialId: p.materialId,
      price: toNumber(p.price),
      supplier: p.supplier,
      sourceUrl: p.sourceUrl,
      observedAt: p.observedAt,
    })),
  );

  return agregatePentruTermen(observatii, termen);
}

/**
 * Cand a fost cerut ultima data fiecare termen la magazine.
 *
 * De aici iese ordinea trecerii zilnice, cel-mai-vechi-intii. Nu exista tabel de
 * progres si nu e nevoie: vechimea sta deja in `MaterialPrice.observedAt`.
 * Vezi antetul din `scraper/plan.ts`.
 */
export async function vechimeaTermenilor(
  termeni: { termen: string; um: string }[],
): Promise<TermenDeScanat[]> {
  const materiale = await prisma.material.findMany({
    select: { id: true, name: true, unit: true },
  });

  // O singura interogare pentru toate materialele, nu una pe termen: la 90 de
  // termeni ar fi 90 de drumuri la baza pentru o socoteala de ordonare.
  const ultimele = await prisma.materialPrice.groupBy({
    by: ["materialId"],
    where: { source: "FURNIZOR", countyCode: null },
    _max: { observedAt: true },
  });

  const ultimaPeMaterial = new Map(
    ultimele.map((u) => [u.materialId, u._max.observedAt]),
  );

  // Socoteala e pura si testata in `plan.test.ts`; aici ramane doar aducerea
  // datelor.
  return vechimeaDinCatalog(termeni, materiale, ultimaPeMaterial, potrivesteTermen);
}
