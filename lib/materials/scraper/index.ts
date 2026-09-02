import { type PriceObservation } from "../import";
import { DEDEMAN } from "./dedeman";
import { type ConfigSite, extrageProduse } from "./extract";
import { type ConfigFetch, FetchError, iaPagina } from "./fetcher";
import { estePermis, iaRobots } from "./robots";

/**
 * Cautarea unui material la magazin.
 *
 * Leaga cele trei piese: `robots.txt` spune daca avem voie, `fetcher` aduce
 * pagina cuviincios, `extract` scoate observatiile. Nimic nu iese pe internet
 * fara `SCRAPER_ACTIV=true` — pornirea e o decizie, nu un efect secundar al unui
 * deploy.
 */

export const SITE_URI: Record<string, ConfigSite> = { dedeman: DEDEMAN };

export interface OptiuniFurnizor {
  site?: ConfigSite;
  fetchImpl?: typeof fetch;
  /** Suprascrie configurarea din mediu; folosit de proba si de teste. */
  config?: Partial<ConfigFetch>;
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
 * Observatiile gasite la magazin pentru o interogare.
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

  const cale = site.caleCautare(interogare);
  const url = new URL(cale, site.baseUrl).toString();

  const robots = await iaRobots(site.baseUrl, config.agent, config.fetchImpl ?? fetch);
  if (!estePermis(robots, new URL(url).pathname)) {
    console.warn(`[furnizor] ${site.nume}: robots.txt interzice ${cale}`);
    return [];
  }

  try {
    const html = await iaPagina(url, config);
    return extrageProduse(html, site);
  } catch (e) {
    // Nu se arunca mai departe: catalogul local ramane raspunsul, si el e bun.
    console.warn(
      `[furnizor] ${site.nume}: ${e instanceof FetchError ? e.message : String(e)}`,
    );
    return [];
  }
}
