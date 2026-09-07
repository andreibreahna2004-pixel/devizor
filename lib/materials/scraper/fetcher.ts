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

export class FetchError extends Error {
  /** Statusul HTTP, cand a existat unul. 403 si 429 inseamna altceva decat 500. */
  readonly status?: number;

  constructor(mesaj: string, status?: number) {
    super(mesaj);
    this.status = status;
  }
}

/**
 * Momentul pana la care origina e rezervata, nu momentul ultimei cereri.
 *
 * Diferenta conteaza: cu patru magazine si mai multi oameni deodata, doua cereri
 * care citesc amandoua "ultima cerere a fost acum 5 secunde" pleaca amandoua
 * imediat, si ritmul nu mai exista. Aici se rezerva slotul **inainte** de orice
 * `await`, deci cererile se aseaza la coada in loc sa se calce.
 */
const rezervat = new Map<string, number>();

/**
 * Cache-ul tine promisiunea, nu textul.
 *
 * Cu textul, doua cereri pentru aceeasi adresa pornite in aceeasi clipa nu se vad
 * una pe alta — prima scrie in cache abia dupa ce raspunsul a venit, deci a doua
 * pleaca pe retea degeaba. Cu promisiunea, a doua o asteapta pe prima.
 */
const cache = new Map<string, { html: Promise<string>; cand: number }>();

function asteapta(ms: number): Promise<void> {
  return new Promise((gata) => setTimeout(gata, ms));
}

/** Doar pentru teste: sterge ritmul si cache-ul intre cazuri. */
export function reseteazaFetcher(): void {
  rezervat.clear();
  cache.clear();
}

export async function iaPagina(
  url: string,
  config: ConfigFetch,
  acum: () => number = Date.now,
): Promise<string> {
  const { cacheMs } = config;

  const dinCache = cache.get(url);
  if (dinCache && acum() - dinCache.cand < cacheMs) return dinCache.html;

  const promisiune = cere(url, config, acum);
  cache.set(url, { html: promisiune, cand: acum() });

  // O cerere cazuta nu se tine minte: altfel o caderi trecatoare a magazinului ar
  // fi servita din cache pana expira, iar cautarile de dupa n-ar mai incerca.
  promisiune.catch(() => {
    if (cache.get(url)?.html === promisiune) cache.delete(url);
  });

  return promisiune;
}

async function cere(
  url: string,
  config: ConfigFetch,
  acum: () => number,
): Promise<string> {
  const { agent, pauzaMs, timeoutMs, fetchImpl = fetch } = config;

  // Rezervarea slotului e sincrona, inainte de primul `await`. Vezi `rezervat`.
  const acumMs = acum();
  const cand = Math.max(acumMs, rezervat.get(new URL(url).origin) ?? 0);
  rezervat.set(new URL(url).origin, cand + pauzaMs);
  if (cand > acumMs) await asteapta(cand - acumMs);

  let raspuns: Response;
  try {
    raspuns = await fetchImpl(url, {
      headers: {
        "User-Agent": agent,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ro-RO,ro;q=0.9",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new FetchError(
      `nu s-a putut cere ${url}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (!raspuns.ok) {
    throw new FetchError(`${url} a raspuns ${raspuns.status}`, raspuns.status);
  }

  return raspuns.text();
}
