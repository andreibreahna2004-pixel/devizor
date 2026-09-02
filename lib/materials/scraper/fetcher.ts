/**
 * Cererile catre magazin, facute cuviincios.
 *
 * Patru lucruri, si niciunul nu e de ornament:
 *
 *  - **se prezinta.** Un User-Agent care spune cine e si unde se raspunde e
 *    diferenta dintre un client neobisnuit si un robot anonim.
 *  - **tine ritmul.** Cel putin `pauzaMs` intre doua cereri catre aceeasi
 *    origine. Cererile omului sunt rare, dar nimic nu garanteaza ca nu vin zece
 *    deodata.
 *  - **renunta la timp.** Un magazin care nu raspunde nu are voie sa tina in loc
 *    pagina omului: la `timeoutMs` se abandoneaza si se afiseaza ce e in catalog.
 *  - **tine minte.** Aceeasi interogare, ceruta din nou in `cacheMs`, se serveste
 *    din memorie. Fara asta, doi oameni care cauta "parchet" in acelasi minut ar
 *    face doua cereri identice.
 *
 * `fetch`-ul se injecteaza, ca la `api-source.ts`: altfel nimic din toate astea
 * n-ar putea fi verificat decat lovind un server real.
 */

export interface ConfigFetch {
  agent: string;
  pauzaMs: number;
  timeoutMs: number;
  cacheMs: number;
  fetchImpl?: typeof fetch;
}

export class FetchError extends Error {}

const ultimaCerere = new Map<string, number>();
const cache = new Map<string, { html: string; cand: number }>();

function asteapta(ms: number): Promise<void> {
  return new Promise((gata) => setTimeout(gata, ms));
}

/** Doar pentru teste: sterge ritmul si cache-ul intre cazuri. */
export function reseteazaFetcher(): void {
  ultimaCerere.clear();
  cache.clear();
}

export async function iaPagina(
  url: string,
  config: ConfigFetch,
  acum: () => number = Date.now,
): Promise<string> {
  const { agent, pauzaMs, timeoutMs, cacheMs, fetchImpl = fetch } = config;

  const dinCache = cache.get(url);
  if (dinCache && acum() - dinCache.cand < cacheMs) return dinCache.html;

  const origine = new URL(url).origin;
  const trecutDeUltima = acum() - (ultimaCerere.get(origine) ?? 0);
  if (trecutDeUltima < pauzaMs) await asteapta(pauzaMs - trecutDeUltima);
  ultimaCerere.set(origine, acum());

  const oprire = AbortSignal.timeout(timeoutMs);

  let raspuns: Response;
  try {
    raspuns = await fetchImpl(url, {
      headers: {
        "User-Agent": agent,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ro-RO,ro;q=0.9",
      },
      signal: oprire,
    });
  } catch (e) {
    throw new FetchError(
      `nu s-a putut cere ${url}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (!raspuns.ok) throw new FetchError(`${url} a raspuns ${raspuns.status}`);

  const html = await raspuns.text();
  cache.set(url, { html, cand: acum() });
  return html;
}
