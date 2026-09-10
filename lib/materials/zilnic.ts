import "server-only";
import { importaObservatii, vechimeaTermenilor } from "./service";
import { scraperActiv } from "./scraper";
import { type RezultatMagazin, cautaLaMagazine, magazineActive } from "./scraper/magazine";
import { ordoneazaPlanul, taiePlanul, termeniCareIncap } from "./scraper/plan";
import { termeniLaMagazin } from "./termeni";

/**
 * Trecerea zilnica peste termeni.
 *
 * Un modul, doi apelanti: `scripts/preturi-zilnic.ts` de la linia de comanda si
 * `app/api/cron/preturi/route.ts` de pe Vercel. Logica se scrie si se verifica o
 * singura data.
 *
 * ## Marginita, si de aia reluabila
 *
 * Nu se trece prin toti termenii intr-o rulare. Se iau cei mai vechi, cati incap
 * in bugetul de timp, si restul rimin pe maine, cand vor fi cei mai vechi si
 * vor urca singuri in cap. Nu exista cursor si nu exista tabel de progres:
 * vechimea sta in `MaterialPrice.observedAt`, care exista oricum. O rulare care
 * cade la jumatate nu lasa nimic de reparat.
 *
 * ## Termenii merg unul dupa altul, magazinele in paralel
 *
 * Nu din comoditate: limitatorul de ritm din `fetcher.ts` nu e sigur la doua
 * cereri concurente **catre aceeasi origine**. Vezi antetul din `magazine.ts`.
 * Cine paralelizeaza termenii sparge ritmul fara ca nimic sa se vada.
 */

export interface EroareZilnica {
  termen: string;
  magazin: string;
  motiv: string;
}

export interface StareMagazinZilnic {
  magazin: string;
  /** La citi termeni a dat cel putin un rezultat. */
  cuRezultate: number;
  termeni: number;
}

export interface RezultatZilnic {
  /** Citi termeni s-au cerut efectiv. */
  termeni: number;
  /** Citi erau in plan, inainte de buget. */
  termeniInPlan: number;
  observatii: number;
  observatiiNoi: number;
  materialeNoi: number;
  duplicate: number;
  magazine: StareMagazinZilnic[];
  erori: EroareZilnica[];
  /** Adevarat cand bugetul de timp a taiat trecerea inainte de plan. */
  taiatDeTimp: boolean;
  durataMs: number;
  /** Setat cand nu s-a cerut nimic si de ce: scraper oprit, fara termeni. */
  sarit?: string;
}

function numarDinEnv(nume: string, implicit: number): number {
  const din = Number(process.env[nume]);
  return Number.isFinite(din) && din > 0 ? din : implicit;
}

export interface OptiuniZilnic {
  /** Citi termeni, cel mult. Implicit `SCRAPER_SCAN_TERMENI` sau 40. */
  budget?: number;
  /** Aduce si arata, fara sa scrie. Tot iese pe internet. */
  dry?: boolean;
  /** Un singur termen, pentru probe. */
  doarTermen?: string;
  /** Chemat dupa fiecare termen, ca scriptul sa poata scrie in log pe loc. */
  raporteaza?: (rand: {
    i: number;
    din: number;
    termen: string;
    um: string;
    ultimaObservatie: Date | null;
    magazine: RezultatMagazin[];
  }) => void;
}

export async function treceriZilnice(
  optiuni: OptiuniZilnic = {},
): Promise<RezultatZilnic> {
  const pornit = Date.now();
  const gol: RezultatZilnic = {
    termeni: 0,
    termeniInPlan: 0,
    observatii: 0,
    observatiiNoi: 0,
    materialeNoi: 0,
    duplicate: 0,
    magazine: [],
    erori: [],
    taiatDeTimp: false,
    durataMs: 0,
  };

  // Rularea zilnica nu e o cale de a ocoli comutatorul.
  if (!scraperActiv()) {
    return { ...gol, sarit: "SCRAPER_ACTIV nu e true, nu se cere nimic" };
  }

  const magazine = magazineActive();
  if (magazine.length === 0) {
    return { ...gol, sarit: "niciun magazin configurat in SCRAPER_MAGAZINE" };
  }

  let deCerut = termeniLaMagazin();
  if (optiuni.doarTermen) {
    const caut = optiuni.doarTermen.trim().toLowerCase();
    deCerut = deCerut.filter((t) => t.termen === caut);
    if (deCerut.length === 0) {
      return { ...gol, sarit: `termenul "${optiuni.doarTermen}" nu e in lista` };
    }
  }

  const bugetMs = numarDinEnv("SCRAPER_SCAN_BUGET_MS", 240_000);
  const pauzaMs = numarDinEnv("SCRAPER_PAUZA_MS", 2000);
  const timeoutMs = numarDinEnv("SCRAPER_TIMEOUT_MS", 8000);

  // Bugetul cerut, dar nu mai mult decat incape in timp: altfel ultimul termen
  // s-ar tăia de limita platformei la jumatatea scrierii.
  const cerut = optiuni.budget ?? numarDinEnv("SCRAPER_SCAN_TERMENI", 40);
  const incap = termeniCareIncap(bugetMs, pauzaMs, timeoutMs);
  const budget = Math.max(1, Math.min(cerut, incap || cerut));

  const plan = ordoneazaPlanul(await vechimeaTermenilor(deCerut));
  const deTrecut = taiePlanul(plan, budget);

  const rezultat: RezultatZilnic = { ...gol, termeniInPlan: plan.length };
  const sanatate = new Map<string, StareMagazinZilnic>(
    magazine.map((m) => [m.nume, { magazin: m.nume, cuRezultate: 0, termeni: 0 }]),
  );

  for (const [i, t] of deTrecut.entries()) {
    // Oprirea dupa ceas se verifica intre termeni, nu in mijlocul unuia.
    if (Date.now() - pornit > bugetMs) {
      rezultat.taiatDeTimp = true;
      break;
    }

    const aleMagazinelor = await cautaLaMagazine(t.termen);
    rezultat.termeni++;

    for (const m of aleMagazinelor) {
      const stare = sanatate.get(m.magazin) ?? {
        magazin: m.magazin,
        cuRezultate: 0,
        termeni: 0,
      };
      stare.termeni++;
      if (m.observatii.length > 0) stare.cuRezultate++;
      sanatate.set(m.magazin, stare);

      if (m.motiv) {
        rezultat.erori.push({ termen: t.termen, magazin: m.magazin, motiv: m.motiv });
      }
    }

    // Se scrie tot ce s-a gasit, pe toate unitatile, nu doar pe cea pe care o
    // asteapta termenul. Un pret pe pachet e o cotatie adevarata a magazinului,
    // nu un rebut: filtrarea pe unitate se face la citire, in `agregatPentruUnitate`,
    // si acolo se si spune cite observatii au ramas afara si de ce. Aruncate aici,
    // ar dispărea fara sa afle nimeni, si o schimbare de unitate la magazin ar
    // arata ca un magazin care nu mai raspunde.
    const observatii = aleMagazinelor.flatMap((m) => m.observatii);
    rezultat.observatii += observatii.length;

    if (!optiuni.dry && observatii.length > 0) {
      const scrise = await importaObservatii(observatii, "FURNIZOR");
      rezultat.observatiiNoi += scrise.observatii;
      rezultat.materialeNoi += scrise.materialeNoi;
      rezultat.duplicate += scrise.duplicate;
    }

    optiuni.raporteaza?.({
      i: i + 1,
      din: deTrecut.length,
      termen: t.termen,
      um: t.um,
      ultimaObservatie: t.ultimaObservatie,
      magazine: aleMagazinelor,
    });
  }

  rezultat.magazine = [...sanatate.values()].sort((a, b) =>
    a.magazin.localeCompare(b.magazin, "ro"),
  );
  rezultat.durataMs = Date.now() - pornit;
  return rezultat;
}

/**
 * Daca trecerea a fost o cadere totala.
 *
 * Numai cand **niciun** magazin n-a dat nimic: atunci ceva e rupt si cron-ul
 * trebuie sa strige. O trecere in care trei magazine au mers si unul a picat e o
 * reusita, si daca ar da cod de eroare, cine citeste mailul de cron s-ar invata
 * sa-l ignore, iar atunci o cadere adevarata trece neobservata.
 */
export function esteCadereTotala(r: RezultatZilnic): boolean {
  if (r.sarit) return false;
  if (r.termeni === 0) return false;
  return r.magazine.every((m) => m.cuRezultate === 0);
}
