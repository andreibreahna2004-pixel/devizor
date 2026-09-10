import { type PriceObservation } from "../import";
import { type ConfigSite } from "./extract";
import { type ConfigFetch } from "./fetcher";
import {
  SITE_URI,
  type StareMagazin,
  cereLaSite,
  configDinEnv,
  momentul,
  scraperActiv,
} from "./index";

/**
 * Aceeasi cautare, la mai multe magazine.
 *
 * Un pret de la un magazin e pretul unui magazin. Patru dau o idee de piata, si
 * de aia exista fisierul asta: cere acelasi termen la fiecare si intoarce cate
 * un rezultat pe magazin, cu starea lui.
 *
 * **Un magazin cazut nu ia cu el pe ceilalti.** Fiecare merge in `allSettled`,
 * si `cereLaSite` oricum nu arunca. Cine n-a dat nimic isi spune motivul:
 * "0 rezultate" fara motiv e ambiguu, si atunci un magazin care tace o luna
 * intreaga trece neobservat.
 *
 * ## Doua invariante de ritm, care se tin din structura
 *
 * **Magazinele merg in paralel, termenii nu.** Ritmul din `fetcher.ts` e per
 * origine, deci patru origini diferite nu se calca. Dar limitatorul citeste
 * marca de timp a ultimei cereri si o rescrie de partea cealalta a unui `await`:
 * doua cereri concurente **catre aceeasi origine** citesc amindoua aceeasi
 * marca veche, asteapta la fel de mult si pleaca aproape simultan, deci pauza e
 * ocolita. Aici asta nu se intampla, fiindca fiecare magazin face exact o cerere
 * pe termen si termenii se trec unul dupa altul. Cine paralelizeaza termenii, sau
 * adauga o a doua cale pe acelasi magazin, sparge ritmul fara sa se vada.
 *
 * **`iaRobots` nu trece prin limitator**, dar e o cerere pe origine pe proces si
 * e pusa in cache. Prima pagina poate veni imediat dupa `robots.txt`, fara pauza
 * intre ele. Se accepta: fisierul trebuie citit inaintea oricarui altceva.
 */

export interface RezultatMagazin {
  /** Cheia din `SITE_URI`. */
  cheie: string;
  /** Numele afisat, acelasi care ajunge in `MaterialPrice.supplier`. */
  magazin: string;
  cale: string | null;
  stare: StareMagazin;
  motiv?: string;
  observatii: PriceObservation[];
  durataMs: number;
}

export interface OptiuniMagazine {
  /** Implicit: cele din `magazineActive()`. */
  siteUri?: ConfigSite[];
  fetchImpl?: typeof fetch;
  config?: Partial<ConfigFetch>;
  /** Momentul observatiei. Implicit `momentul()`, adica inceputul zilei. */
  acum?: Date;
}

/**
 * Magazinele din care se citeste.
 *
 * `SCRAPER_MAGAZINE` le alege pe cheie, separate prin virgula. Nesetata inseamna
 * toate. Exista ca sa se poata scoate un magazin din trecere fara deploy, de pilda
 * exemplu Leroy, cat timp nu se stie daca raspunde din mediul de deploy.
 */
export function magazineActive(): ConfigSite[] {
  const cerute = process.env.SCRAPER_MAGAZINE?.trim();
  if (!cerute) return Object.values(SITE_URI);

  const chei = cerute
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);

  return chei.map((c) => SITE_URI[c]).filter((s): s is ConfigSite => Boolean(s));
}

/**
 * Cate un rezultat pe magazin, in ordinea din `siteUri`.
 *
 * Lista goala cand scraperul e oprit sau interogarea e alba: nu se cere nimic si
 * nu se raporteaza magazine, fiindca n-a fost intrebat niciunul.
 */
export async function cautaLaMagazine(
  interogare: string,
  optiuni: OptiuniMagazine = {},
): Promise<RezultatMagazin[]> {
  if (!interogare.trim()) return [];
  if (!scraperActiv()) return [];

  const siteUri = optiuni.siteUri ?? magazineActive();
  const config = configDinEnv({ ...optiuni.config, fetchImpl: optiuni.fetchImpl });
  const acum = optiuni.acum ?? momentul();

  const rezultate = await Promise.allSettled(
    siteUri.map(async (site): Promise<RezultatMagazin> => {
      const pornit = Date.now();
      const r = await cereLaSite(site, interogare, config, acum);
      return {
        cheie: site.cheie,
        magazin: site.nume,
        cale: r.cale,
        stare: r.stare,
        motiv: r.motiv,
        observatii: r.observatii,
        durataMs: Date.now() - pornit,
      };
    }),
  );

  // `cereLaSite` nu arunca, deci `rejected` ar fi o eroare de programare la noi.
  // Se mapeaza tot la o stare, nu se lasa sa cada: intr-un cod care duce cifre
  // spre o coloana de bani, trei magazine bune nu se pierd din cauza unui bug in
  // al patrulea.
  return rezultate.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          cheie: siteUri[i].cheie,
          magazin: siteUri[i].nume,
          cale: null,
          stare: "eroare" as StareMagazin,
          motiv: String(r.reason),
          observatii: [],
          durataMs: 0,
        },
  );
}

/**
 * Observatiile de la toate magazinele, puse cap la cap.
 *
 * Aceeasi semnatura ca `cautaLaFurnizor`, ca sa poata inlocui implicitul din
 * `cautaMaterialeProaspete` fara sa se schimbe altceva. Motivele se scriu in log
 * o data pe magazin, aici, fiindca mai departe nu mai are cine.
 */
export async function cautaLaToateMagazinele(
  interogare: string,
): Promise<PriceObservation[]> {
  const rezultate = await cautaLaMagazine(interogare);

  for (const r of rezultate) {
    if (r.motiv) console.warn(`[magazine] ${r.magazin}: ${r.motiv}`);
  }

  return rezultate.flatMap((r) => r.observatii);
}
