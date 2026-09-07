import { afterEach, describe, expect, it } from "vitest";
import { FetchError, iaPagina, reseteazaFetcher } from "./fetcher";

const CONFIG = { agent: "Devizor/1.0", pauzaMs: 0, timeoutMs: 1000, cacheMs: 60_000 };

afterEach(() => reseteazaFetcher());

function raspunde(html: string, ok = true, status = 200) {
  const cereri: { url: string; init?: RequestInit }[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    cereri.push({ url, init });
    return { ok, status, text: async () => html } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, cereri };
}

describe("iaPagina", () => {
  it("aduce pagina si se prezinta", async () => {
    const { impl, cereri } = raspunde("<html>ok</html>");

    const html = await iaPagina("https://exemplu.invalid/cauta", {
      ...CONFIG,
      fetchImpl: impl,
    });

    expect(html).toBe("<html>ok</html>");
    const antete = cereri[0].init?.headers as Record<string, string>;
    expect(antete["User-Agent"]).toBe("Devizor/1.0");
  });

  it("nu cere de doua ori aceeasi pagina in cache", async () => {
    // Fara asta, doi oameni care cauta "parchet" in acelasi minut ar face doua
    // cereri identice la magazin.
    const { impl, cereri } = raspunde("<html>ok</html>");
    const optiuni = { ...CONFIG, fetchImpl: impl };

    await iaPagina("https://exemplu.invalid/a", optiuni);
    await iaPagina("https://exemplu.invalid/a", optiuni);

    expect(cereri).toHaveLength(1);
  });

  it("cere din nou dupa ce expira cache-ul", async () => {
    const { impl, cereri } = raspunde("<html>ok</html>");
    const optiuni = { ...CONFIG, cacheMs: 1000, fetchImpl: impl };

    let ceas = 0;
    const acum = () => ceas;

    await iaPagina("https://exemplu.invalid/a", optiuni, acum);
    ceas = 1500;
    await iaPagina("https://exemplu.invalid/a", optiuni, acum);

    expect(cereri).toHaveLength(2);
  });

  it("tine ritmul intre cereri catre acelasi magazin", async () => {
    const { impl } = raspunde("<html>ok</html>");
    const optiuni = { ...CONFIG, pauzaMs: 40, cacheMs: 0, fetchImpl: impl };

    const inceput = Date.now();
    await iaPagina("https://exemplu.invalid/a", optiuni);
    await iaPagina("https://exemplu.invalid/b", optiuni);

    expect(Date.now() - inceput).toBeGreaterThanOrEqual(35);
  });

  it("ridica FetchError la raspuns cu eroare", async () => {
    const { impl } = raspunde("", false, 503);
    await expect(
      iaPagina("https://exemplu.invalid/a", { ...CONFIG, fetchImpl: impl }),
    ).rejects.toBeInstanceOf(FetchError);
  });

  it("ridica FetchError cand reteaua cade", async () => {
    const cade = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;

    await expect(
      iaPagina("https://exemplu.invalid/a", { ...CONFIG, fetchImpl: cade }),
    ).rejects.toBeInstanceOf(FetchError);
  });

  it("serializeaza doua cereri concurente catre aceeasi origine", async () => {
    // Cursa pe care o pazeste rezervarea sincrona: pornite deodata, amandoua ar
    // citi "ultima cerere a fost demult" si ar pleca in acelasi moment.
    const { impl } = raspunde("<html>ok</html>");
    const optiuni = { ...CONFIG, pauzaMs: 40, cacheMs: 0, fetchImpl: impl };

    const inceput = Date.now();
    await Promise.all([
      iaPagina("https://exemplu.invalid/a", optiuni),
      iaPagina("https://exemplu.invalid/b", optiuni),
    ]);

    expect(Date.now() - inceput).toBeGreaterThanOrEqual(35);
  });

  it("nu tine in loc cererile catre magazine diferite", async () => {
    // Ritmul e per origine: patru magazine intrebate deodata nu se asteapta unul
    // pe altul, altfel evantaiul ar dura cat suma pauzelor.
    const { impl } = raspunde("<html>ok</html>");
    const optiuni = { ...CONFIG, pauzaMs: 200, cacheMs: 0, fetchImpl: impl };

    const inceput = Date.now();
    await Promise.all([
      iaPagina("https://unu.invalid/a", optiuni),
      iaPagina("https://doi.invalid/a", optiuni),
      iaPagina("https://trei.invalid/a", optiuni),
    ]);

    expect(Date.now() - inceput).toBeLessThan(150);
  });

  it("face o singura cerere pentru doua cautari pornite deodata", async () => {
    // Cache-ul tine promisiunea, nu textul: altfel a doua cerere pleaca inainte ca
    // prima sa fi apucat sa scrie raspunsul.
    const { impl, cereri } = raspunde("<html>ok</html>");
    const optiuni = { ...CONFIG, fetchImpl: impl };

    const [a, b] = await Promise.all([
      iaPagina("https://exemplu.invalid/a", optiuni),
      iaPagina("https://exemplu.invalid/a", optiuni),
    ]);

    expect(cereri).toHaveLength(1);
    expect(a).toBe(b);
  });

  it("nu tine minte o cerere cazuta", async () => {
    // O cadere trecatoare servita din cache ar face ca urmatoarele cautari sa nici
    // nu mai incerce, pana expira TTL-ul.
    let apeluri = 0;
    const cade = (async () => {
      apeluri++;
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    const optiuni = { ...CONFIG, fetchImpl: cade };

    await expect(iaPagina("https://exemplu.invalid/a", optiuni)).rejects.toThrow();
    await expect(iaPagina("https://exemplu.invalid/a", optiuni)).rejects.toThrow();

    expect(apeluri).toBe(2);
  });

  it("poarta statusul HTTP pe eroare", async () => {
    // 403 si 429 inseamna "blocat", nu "cazut": racirea le trateaza altfel.
    const { impl } = raspunde("", false, 429);
    await expect(
      iaPagina("https://exemplu.invalid/a", { ...CONFIG, fetchImpl: impl }),
    ).rejects.toMatchObject({ status: 429 });
  });
});
