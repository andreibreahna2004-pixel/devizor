import { type PriceObservation } from "../import";
import { type ConfigSite, type SelectoareSite, type Strat, extrageDeterminist } from "./extract";
import { type ConfigFetch, FetchError, iaPagina } from "./fetcher";
import { caiDeCautare, magazineActive } from "./magazine";
import { estePermis, iaRobots } from "./robots";
import { deAnuntatRobots, noteazaRezultat, poateFiIntrebat } from "./sanatate";

/**
 * Cautarea unui material la magazine.
 *
 * Leaga piesele: `robots.txt` spune daca avem voie, `fetcher` aduce pagina
 * cuviincios, `extract` scoate observatiile, iar cand nimic determinist n-a prins,
 * `lib/ai/extrage-produse` pune modelul sa citeasca pagina. Nimic nu iese pe
 * internet fara `SCRAPER_ACTIV=true` — pornirea e o decizie, nu un efect secundar
 * al unui deploy.
 *
 * Magazinele se intreaba deodata. Sunt origini diferite, deci ritmul per origine
 * nu se incalca, iar un magazin cazut nu-i tine in loc pe ceilalti.
 */

export { MAGAZINE, magazineActive } from "./magazine";

export interface OptiuniFurnizor {
  /** Un singur magazin, in loc de toate. Folosit de proba si de teste. */
  site?: ConfigSite;
  fetchImpl?: typeof fetch;
  /** Suprascrie configurarea din mediu; folosit de proba si de teste. */
  config?: Partial<ConfigFetch>;
  /** Marca de timp a intregii cautari. Vezi `cautaLaFurnizoriDetaliat`. */
  acum?: Date;
  /** Opreste stratul cu model, chiar daca ar fi disponibil. */
  faraAi?: boolean;
  /**
   * Firma din a carei cautare a pornit totul. Cand exista, apelurile de model se
   * scriu in `AiRun`: cheltuiala are un vinovat, chiar daca catalogul e national.
   */
  orgId?: string;
  userId?: string | null;
  /**
   * De unde vin selectoarele invatate. Injectat, ca `cauta` in `service.ts`:
   * modulul care le tine atinge baza de date, si evantaiul se testeaza fara ea.
   */
  selectoareInvatate?: (magazin: string) => Promise<SelectoareSite | null>;
}

/** De ce n-a dat un magazin nimic. Pentru log si pentru proba, nu pentru om. */
export type MotivGol = "oprit" | "robots" | "blocat" | "retea" | "gol" | "racit";

export interface RezultatMagazin {
  cheie: string;
  nume: string;
  url: string | null;
  strat: Strat | null;
  peStrat: Partial<Record<Strat, number>>;
  observatii: PriceObservation[];
  motiv?: MotivGol;
  durataMs: number;
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

/** Calea care a mers ultima data la un magazin, ca sa nu se reia cautarea de la prima. */
const caleaBuna = new Map<string, string>();

/** Doar pentru teste: uita ce cale a mers. */
export function reseteazaCaiCunoscute(): void {
  caleaBuna.clear();
}

/**
 * Observatiile de la toate magazinele active.
 *
 * Intoarce lista goala in toate cazurile in care nu se poate: scraper oprit,
 * `robots.txt` care interzice, magazin cazut. Pagina omului trebuie sa se afiseze
 * oricum, cu ce e in catalog — o cautare de materiale nu e locul unde sa cada
 * aplicatia din cauza unui site strain.
 */
export async function cautaLaFurnizor(
  interogare: string,
  optiuni: OptiuniFurnizor = {},
): Promise<PriceObservation[]> {
  const rezultate = await cautaLaFurnizoriDetaliat(interogare, optiuni);
  return rezultate.flatMap((r) => r.observatii);
}

export async function cautaLaFurnizoriDetaliat(
  interogare: string,
  optiuni: OptiuniFurnizor = {},
): Promise<RezultatMagazin[]> {
  if (!interogare.trim()) return [];
  if (!scraperActiv()) return [];

  const config = configDinEnv({ ...optiuni.config, fetchImpl: optiuni.fetchImpl });
  const magazine = optiuni.site ? [optiuni.site] : magazineActive();

  // O singura marca de timp pentru toata cautarea. Cu cate una per magazin,
  // `reperPentruJudet` — care ia cea mai noua observatie — ar alege furnizorul
  // dupa cine a raspuns primul, adica dupa o cursa de retea.
  const acum = optiuni.acum ?? new Date();

  const rezultate = await Promise.allSettled(
    magazine.map((site) => cautaLaUnMagazin(interogare, site, config, acum, optiuni)),
  );

  return rezultate.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          cheie: magazine[i].cheie,
          nume: magazine[i].nume,
          url: null,
          strat: null,
          peStrat: {},
          observatii: [],
          motiv: "retea" as const,
          durataMs: 0,
        },
  );
}

/** Un singur magazin, de la robots pana la observatii. Nu arunca niciodata. */
export async function cautaLaUnMagazin(
  interogare: string,
  site: ConfigSite,
  config: ConfigFetch,
  acum: Date,
  optiuni: OptiuniFurnizor = {},
): Promise<RezultatMagazin> {
  const inceput = Date.now();
  const gol = (motiv: MotivGol, url: string | null = null): RezultatMagazin => ({
    cheie: site.cheie,
    nume: site.nume,
    url,
    strat: null,
    peStrat: {},
    observatii: [],
    motiv,
    durataMs: Date.now() - inceput,
  });

  if (!poateFiIntrebat(site.cheie)) return gol("racit");

  const robots = await iaRobots(
    site.baseUrl,
    config.agent,
    config.fetchImpl ?? fetch,
    config.timeoutMs,
  ).catch(() => ({ reguli: [] }));

  // Selectoarele invatate intra in configurarea magazinului pentru cautarea asta.
  // Cand exista si prind, stratul cu model nu se mai cheama deloc.
  const invatate = await incarcaSelectoare(site.cheie, optiuni);
  const cuSelectoare: ConfigSite = invatate ? { ...site, selectoare: invatate } : site;

  // Calea care a mers ultima data se incearca prima; celelalte raman rezerva.
  const cai = caiDeCautare(site, interogare);
  const cunoscuta = caleaBuna.get(site.cheie);
  const ordonate = cunoscuta
    ? [...cai.filter((c) => tipar(c) === cunoscuta), ...cai.filter((c) => tipar(c) !== cunoscuta)]
    : cai;

  let ultimulMotiv: MotivGol = "gol";
  let ultimulUrl: string | null = null;

  for (const cale of ordonate) {
    const url = new URL(cale, site.baseUrl).toString();
    ultimulUrl = url;

    if (!estePermis(robots, new URL(url).pathname)) {
      if (deAnuntatRobots(site.cheie)) {
        console.warn(`[furnizor] ${site.cheie} robots.txt interzice ${cale}`);
      }
      ultimulMotiv = "robots";
      continue;
    }

    let html: string;
    try {
      html = await iaPagina(url, config);
    } catch (e) {
      // 403 si 429 inseamna "nu esti binevenit", nu "am cazut": se opreste aici.
      const status = e instanceof FetchError ? e.status : undefined;
      ultimulMotiv = status === 403 || status === 429 ? "blocat" : "retea";
      if (ultimulMotiv === "blocat") break;
      continue;
    }

    if (esteInterstitial(html)) {
      ultimulMotiv = "blocat";
      break;
    }

    const determinist = extrageDeterminist(html, cuSelectoare, acum, interogare);
    if (determinist.observatii.length > 0) {
      if (invatate) void noteazaSelectoare(determinist.strat === "selectoare", site.cheie);
      caleaBuna.set(site.cheie, tipar(cale));
      noteazaRezultat(site.cheie, "reusit");
      console.info(
        `[furnizor] ${site.cheie} strat=${determinist.strat} produse=${determinist.observatii.length} ms=${Date.now() - inceput}`,
      );
      return { ...gol("gol", url), ...determinist, durataMs: Date.now() - inceput, motiv: undefined };
    }

    // Selectoarele invatate n-au mai prins: magazinul si-a refacut pagina. La al
    // doilea esec la rand se sterg si se reinvata.
    if (invatate) void noteazaSelectoare(false, site.cheie);

    // Ultimul strat: pagina o citeste modelul. Se cheama o singura data per
    // cautare, pe prima pagina adusa cu adevarat, nu pe fiecare cale incercata.
    const cuAi = await incearcaAi(html, site, interogare, acum, optiuni);
    if (cuAi) {
      caleaBuna.set(site.cheie, tipar(cale));
      noteazaRezultat(site.cheie, "reusit");
      return { ...cuAi, cheie: site.cheie, nume: site.nume, url, durataMs: Date.now() - inceput };
    }

    ultimulMotiv = "gol";
  }

  noteazaRezultat(site.cheie, ultimulMotiv === "blocat" ? "blocat" : "gol");
  console.warn(
    `[furnizor] ${site.cheie} gol motiv=${ultimulMotiv} ms=${Date.now() - inceput}`,
  );
  return gol(ultimulMotiv, ultimulUrl);
}

/**
 * Stratul cu model se incarca lenes.
 *
 * Asa raman `index.ts` si tot ce atarna de el fara dependenta de SDK-ul Anthropic
 * cand cheia lipseste sau `SCRAPER_AI` e oprit — si asa il pot rula testele fara
 * sa aiba nevoie de cheie.
 */
async function incearcaAi(
  html: string,
  site: ConfigSite,
  interogare: string,
  acum: Date,
  optiuni: OptiuniFurnizor,
): Promise<{ strat: Strat; observatii: PriceObservation[]; peStrat: Partial<Record<Strat, number>> } | null> {
  if (optiuni.faraAi) return null;

  const modul = await import("@/lib/ai/extrage-produse");
  if (!modul.extragereAiActiva()) return null;

  try {
    const iesire = await modul.extrageCuAi(html, site, interogare, acum);

    if (optiuni.orgId) {
      const { noteazaRulareMateriale } = await import("./audit");
      void noteazaRulareMateriale({
        orgId: optiuni.orgId,
        userId: optiuni.userId,
        magazin: site.cheie,
        interogare,
        produse: iesire.observatii.length,
        ...iesire.folosire,
      });
    }

    if (iesire.observatii.length === 0) return null;

    console.info(
      `[furnizor] ${site.cheie} strat=ai produse=${iesire.observatii.length} tokeni=${iesire.folosire.inputTokens}`,
    );

    if (iesire.selectoare) {
      // Selectoarele invatate se pastreaza in baza, ca urmatoarea cautare sa nu
      // mai coste niciun token. Scrierea nu are voie sa strice cautarea.
      const { salveazaSelectoare } = await import("./selectoare-invatate");
      await salveazaSelectoare(site.cheie, iesire.selectoare).catch(() => {});
    }

    return { strat: "ai", observatii: iesire.observatii, peStrat: { ai: iesire.observatii.length } };
  } catch (e) {
    console.warn(
      `[furnizor] ${site.cheie} modelul n-a putut citi pagina: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}

/** Selectoarele invatate, daca modulul care le tine e disponibil. */
async function incarcaSelectoare(
  magazin: string,
  optiuni: OptiuniFurnizor,
): Promise<SelectoareSite | null> {
  if (optiuni.selectoareInvatate) return optiuni.selectoareInvatate(magazin).catch(() => null);

  try {
    const modul = await import("./selectoare-invatate");
    return await modul.selectoareInvatate(magazin);
  } catch {
    // Fara baza de date se merge mai departe: selectoarele sunt o economie, nu o
    // conditie.
    return null;
  }
}

/** Se numara cat economisesc selectoarele invatate, si cand nu mai prind. */
async function noteazaSelectoare(auPrins: boolean, magazin?: string): Promise<void> {
  if (!magazin) return;
  try {
    const modul = await import("./selectoare-invatate");
    await (auPrins ? modul.noteazaReusita(magazin) : modul.noteazaEsec(magazin));
  } catch {
    // Vezi `incarcaSelectoare`.
  }
}

/** Forma caii, fara interogare, ca sa poata fi tinuta minte de la o cautare la alta. */
function tipar(cale: string): string {
  return cale.split("=")[0];
}

/**
 * Pagina care nu e pagina, ci un zid.
 *
 * Un interstitial vine cu status 200 si arata, pentru cod, ca o pagina fara
 * produse. Vocabularul e generic, nu e legat de vreun magazin.
 */
function esteInterstitial(html: string): boolean {
  if (html.length > 200_000) return false;
  return /just a moment|access denied|attention required|verifying you are human/i.test(html);
}
