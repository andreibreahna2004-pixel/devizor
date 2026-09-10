import { ziua } from "@/lib/charts/buckets";
import { type PriceObservation } from "../import";
import { BRICO } from "./brico";
import { DEDEMAN } from "./dedeman";
import { HORNBACH } from "./hornbach";
import { LEROY_MERLIN } from "./leroymerlin";
import { type ConfigSite, extrageProduse } from "./extract";
import { type ConfigFetch, FetchError, iaPagina } from "./fetcher";
import { caleDinUrl, estePermis, iaRobots } from "./robots";

/**
 * Cautarea unui material la magazin.
 *
 * Leaga cele trei piese: `robots.txt` spune daca avem voie, `fetcher` aduce
 * pagina cuviincios, `extract` scoate observatiile. Nimic nu iese pe internet
 * fara `SCRAPER_ACTIV=true` — pornirea e o decizie, nu un efect secundar al unui
 * deploy.
 *
 * Fan-out-ul pe mai multe magazine sta in `magazine.ts`, care cheama workerul de
 * aici o data pe magazin. Aici nu se stie nimic despre "mai multe".
 */

export const SITE_URI: Record<string, ConfigSite> = {
  dedeman: DEDEMAN,
  hornbach: HORNBACH,
  leroymerlin: LEROY_MERLIN,
  brico: BRICO,
};

export interface OptiuniFurnizor {
  site?: ConfigSite;
  fetchImpl?: typeof fetch;
  /** Suprascrie configurarea din mediu; folosit de proba si de teste. */
  config?: Partial<ConfigFetch>;
  /** Momentul observatiei. Implicit inceputul zilei de azi. Vezi `momentul()`. */
  acum?: Date;
}

export function scraperActiv(): boolean {
  return process.env.SCRAPER_ACTIV?.trim().toLowerCase() === "true";
}

function configDinEnv(peste?: Partial<ConfigFetch>): ConfigFetch {
  return {
    agent:
      process.env.SCRAPER_UA?.trim() ||
      "Devizor/1.0 (+https://github.com/andreibreahna2004-pixel/devizor)",
    pauzaMs: Number(process.env.SCRAPER_PAUZA_MS) || 2000,
    timeoutMs: Number(process.env.SCRAPER_TIMEOUT_MS) || 8000,
    cacheMs: Number(process.env.SCRAPER_CACHE_MS) || 15 * 60 * 1000,
    ...peste,
  };
}

/**
 * Momentul cu care se scriu observatiile de magazin: inceputul zilei.
 *
 * Nu `new Date()`, si asta conteaza. Cheia de duplicat din `importaObservatii`
 * e `(material, judet, observedAt, pret, furnizor)`; cu marca de timp la
 * milisecunda, acelasi produs la acelasi pret, citit de doua ori in aceeasi zi,
 * intra de doua ori, fiindca marca difera. La o rulare zilnica plus cautarile
 * oamenilor asta inseamna mii de randuri care nu spun nimic nou, iar graficul
 * nu cistiga nimic din ele.
 *
 * Normalizat pe zi, cheia face exact ce spune comentariul de la ea: un pret pe
 * produs pe zi. Si e mai adevarat asa: un pret de raft e un fapt al zilei
 * aceleia, cum scrie si in CLAUDE.md, nu al secundei in care s-a nimerit
 * cererea. Un pret care se schimba in cursul zilei intra tot, fiindca e alt
 * pret, deci alt fapt.
 *
 * Ziua e cea locala a serverului, si pe Vercel serverul e in UTC: hotarul cade
 * la 02:00 sau 03:00 ora Romaniei. De aia rularea zilnica se pune la o ora care
 * sta bine in mijlocul unei zile UTC.
 */
export function momentul(): Date {
  return ziua(new Date());
}

/**
 * Ce se face cu `robots.txt` la un magazin anume.
 *
 * `SCRAPER_IGNORA_ROBOTS` suprascrie cimpul din configurare, in ambele sensuri:
 * un magazin scris acolo se citeste chiar daca fisierul lui interzice calea, si
 * unul care are `robots: "ignora"` in cod revine la respectat daca variabila e
 * setata si nu-l cuprinde. Asa hotarirea se poate schimba fara deploy, si se
 * vede intr-un singur loc care magazine sunt in situatia asta.
 */
export function purtareRobots(site: ConfigSite): "respecta" | "ignora" {
  const din = process.env.SCRAPER_IGNORA_ROBOTS?.trim();
  if (din === undefined) return site.robots ?? "respecta";

  const chei = din
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);

  return chei.includes(site.cheie) ? "ignora" : "respecta";
}

/** Cum s-a terminat cererea la un magazin. */
export type StareMagazin = "ok" | "gol" | "interzis" | "eroare";

export interface RezultatSite {
  /** Calea ceruta, sau `null` cand nu s-a cerut nimic. */
  cale: string | null;
  stare: StareMagazin;
  /** De ce, cand nu e "ok". Pentru log, nu pentru interfata. */
  motiv?: string;
  observatii: PriceObservation[];
}

/**
 * O cerere la un magazin, cu tot ce trebuie inainte de ea.
 *
 * Nu arunca niciodata: intoarce starea. Un magazin cazut nu are voie sa ia cu el
 * pagina omului, nici pe celelalte magazine din aceeasi trecere.
 *
 * Motivul e intors, nu scris in log aici. Intr-o trecere de 40 de termeni, un
 * `console.warn` pe fiecare refuz ar da 40 de linii identice; cine cheama
 * decide sa scrie o data pe magazin pe trecere.
 */
export async function cereLaSite(
  site: ConfigSite,
  interogare: string,
  config: ConfigFetch,
  acum: Date,
): Promise<RezultatSite> {
  const cale = site.caleCautare(interogare);
  const url = new URL(cale, site.baseUrl).toString();
  const caleJudecata = caleDinUrl(url);

  // Fisierul se cere si cand purtarea e "ignora": ca sa se poata spune in log
  // peste ce regula anume s-a trecut. O decizie luata trebuie sa se vada.
  const robots = await iaRobots(site.baseUrl, config.agent, config.fetchImpl ?? fetch);
  const permis = estePermis(robots, caleJudecata);
  const purtare = purtareRobots(site);

  if (!permis && purtare !== "ignora") {
    return {
      cale: null,
      stare: "interzis",
      motiv: `robots.txt interzice ${caleJudecata}`,
      observatii: [],
    };
  }

  const ignorat = !permis && purtare === "ignora";

  try {
    const html = await iaPagina(url, config);
    const observatii = extrageProduse(html, site, acum);
    return {
      cale: caleJudecata,
      stare: observatii.length > 0 ? "ok" : "gol",
      motiv: ignorat ? `robots.txt interzice ${caleJudecata}, ignorat din config` : undefined,
      observatii,
    };
  } catch (e) {
    return {
      cale: caleJudecata,
      stare: "eroare",
      motiv: e instanceof FetchError ? e.message : String(e),
      observatii: [],
    };
  }
}

/**
 * Observatiile gasite la un magazin pentru o interogare.
 *
 * Intoarce lista goala in toate cazurile in care nu se poate: scraper oprit,
 * `robots.txt` care interzice calea, magazin cazut. Pagina omului trebuie sa se
 * afiseze oricum, cu ce e in catalog — o cautare de materiale nu e locul unde sa
 * cada aplicatia din cauza unui site strain.
 */
export async function cautaLaFurnizor(
  interogare: string,
  optiuni: OptiuniFurnizor = {},
): Promise<PriceObservation[]> {
  if (!interogare.trim()) return [];
  if (!scraperActiv()) return [];

  const site = optiuni.site ?? DEDEMAN;
  const config = configDinEnv({ ...optiuni.config, fetchImpl: optiuni.fetchImpl });

  const rezultat = await cereLaSite(site, interogare, config, optiuni.acum ?? momentul());
  if (rezultat.motiv) console.warn(`[furnizor] ${site.nume}: ${rezultat.motiv}`);
  return rezultat.observatii;
}

export { configDinEnv };
