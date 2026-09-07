import { afterEach, describe, expect, it } from "vitest";
import { cautaLaFurnizor, cautaLaFurnizoriDetaliat, reseteazaCaiCunoscute } from "./index";
import { reseteazaFetcher } from "./fetcher";
import { golesteCacheRobots } from "./robots";
import { reseteazaSanatate } from "./sanatate";

/**
 * Evantaiul: patru magazine intrebate deodata.
 *
 * Aici se verifica exact ce nu se vede din afara — ca un magazin cazut nu-i trage
 * pe ceilalti dupa el, ca fiecare observatie isi poarta furnizorul, si ca ce spune
 * `robots.txt` chiar se respecta.
 */

const PAGINA = (nume: string, pret: string) => `<ul>
  <li><h3><a href="/p/1">${nume} 40 kg</a></h3><span>${pret} lei</span></li>
  <li><h3><a href="/p/2">${nume} 25 kg</a></h3><span>${pret} lei</span></li>
  <li><h3><a href="/p/3">${nume} 10 kg</a></h3><span>${pret} lei</span></li>
</ul>`;

/** Retea falsa: alt raspuns pe fiecare gazda, si tine minte ce s-a cerut. */
function retea(
  peGazda: Record<string, { html?: string; robots?: string; status?: number }>,
) {
  const cereri: string[] = [];

  const impl = (async (url: string) => {
    cereri.push(url);
    const gazda = new URL(url).hostname;
    const cheie = Object.keys(peGazda).find((k) => gazda.includes(k));
    const raspuns = cheie ? peGazda[cheie] : undefined;

    if (!raspuns) return { ok: false, status: 404, text: async () => "" } as unknown as Response;

    if (url.endsWith("/robots.txt")) {
      return { ok: true, status: 200, text: async () => raspuns.robots ?? "" } as unknown as Response;
    }

    if (raspuns.status && raspuns.status >= 400) {
      return { ok: false, status: raspuns.status, text: async () => "" } as unknown as Response;
    }

    if (raspuns.html === undefined) throw new Error("ECONNRESET");
    return { ok: true, status: 200, text: async () => raspuns.html } as unknown as Response;
  }) as unknown as typeof fetch;

  return { impl, cereri };
}

const OPTIUNI = {
  config: { pauzaMs: 0, cacheMs: 0, timeoutMs: 500 },
  faraAi: true,
  // Fara baza de date in testul asta: selectoarele invatate sunt o economie, nu o
  // conditie ca evantaiul sa mearga.
  selectoareInvatate: async () => null,
};

afterEach(() => {
  delete process.env.SCRAPER_ACTIV;
  delete process.env.SCRAPER_MAGAZINE;
  reseteazaFetcher();
  golesteCacheRobots();
  reseteazaSanatate();
  reseteazaCaiCunoscute();
});

describe("cautaLaFurnizor", () => {
  it("nu cere nimic cat timp scraperul e oprit", async () => {
    process.env.SCRAPER_ACTIV = "false";
    const { impl, cereri } = retea({ dedeman: { html: PAGINA("Ciment", "32,50") } });

    expect(await cautaLaFurnizor("ciment", { ...OPTIUNI, fetchImpl: impl })).toEqual([]);
    expect(cereri).toEqual([]);
  });

  it("intreaba toate magazinele si pastreaza furnizorul fiecaruia", async () => {
    process.env.SCRAPER_ACTIV = "true";
    const { impl } = retea({
      dedeman: { html: PAGINA("Ciment Portland", "32,50") },
      leroymerlin: { html: PAGINA("Ciment Portland", "33,90") },
      hornbach: { html: PAGINA("Ciment Portland", "31,00") },
      bricostore: { html: PAGINA("Ciment Portland", "34,50") },
    });

    const observatii = await cautaLaFurnizor("ciment", { ...OPTIUNI, fetchImpl: impl });

    const furnizori = new Set(observatii.map((o) => o.supplier));
    expect(furnizori).toEqual(
      new Set(["Dedeman", "Leroy Merlin", "Hornbach", "Bricostore"]),
    );
  });

  it("da tuturor observatiilor aceeasi marca de timp", async () => {
    // Cu cate o marca per magazin, reperul afisat omului s-ar alege dupa cine a
    // raspuns primul — adica dupa o cursa de retea, nu dupa ceva ce inseamna ceva.
    process.env.SCRAPER_ACTIV = "true";
    const { impl } = retea({
      dedeman: { html: PAGINA("Ciment Portland", "32,50") },
      hornbach: { html: PAGINA("Ciment Portland", "31,00") },
    });

    const observatii = await cautaLaFurnizor("ciment", { ...OPTIUNI, fetchImpl: impl });
    const momente = new Set(observatii.map((o) => o.observedAt.getTime()));

    expect(momente.size).toBe(1);
  });

  it("nu se opreste din cauza unui magazin cazut", async () => {
    process.env.SCRAPER_ACTIV = "true";
    const { impl } = retea({
      dedeman: { html: PAGINA("Ciment Portland", "32,50") },
      leroymerlin: {},
      hornbach: { status: 500 },
      bricostore: { html: PAGINA("Ciment Portland", "34,50") },
    });

    const rezultate = await cautaLaFurnizoriDetaliat("ciment", { ...OPTIUNI, fetchImpl: impl });

    const cuProduse = rezultate.filter((r) => r.observatii.length > 0);
    expect(cuProduse.map((r) => r.cheie).sort()).toEqual(["bricostore", "dedeman"]);
    expect(rezultate.find((r) => r.cheie === "hornbach")?.motiv).toBe("retea");
  });

  it("respecta interdictia din robots.txt si merge mai departe cu ceilalti", async () => {
    process.env.SCRAPER_ACTIV = "true";
    const { impl, cereri } = retea({
      dedeman: { html: PAGINA("Ciment Portland", "32,50"), robots: "User-agent: *\nDisallow: /" },
      hornbach: { html: PAGINA("Ciment Portland", "31,00") },
    });
    process.env.SCRAPER_MAGAZINE = "dedeman,hornbach";

    const rezultate = await cautaLaFurnizoriDetaliat("ciment", { ...OPTIUNI, fetchImpl: impl });

    expect(rezultate.find((r) => r.cheie === "dedeman")?.motiv).toBe("robots");
    expect(rezultate.find((r) => r.cheie === "hornbach")?.observatii.length).toBeGreaterThan(0);
    // Nu s-a cerut nicio pagina de la magazinul care a spus nu.
    expect(cereri.filter((u) => u.includes("dedeman") && !u.endsWith("robots.txt"))).toEqual([]);
  });

  it("marcheaza blocarea altfel decat caderea", async () => {
    // 403 inseamna "nu esti binevenit". Insistenta n-aduce produse, aduce blocare.
    process.env.SCRAPER_ACTIV = "true";
    process.env.SCRAPER_MAGAZINE = "hornbach";
    const { impl } = retea({ hornbach: { status: 403 } });

    const rezultate = await cautaLaFurnizoriDetaliat("ciment", { ...OPTIUNI, fetchImpl: impl });

    expect(rezultate[0].motiv).toBe("blocat");
  });

  it("recunoaste un zid servit cu status 200", async () => {
    process.env.SCRAPER_ACTIV = "true";
    process.env.SCRAPER_MAGAZINE = "hornbach";
    const { impl } = retea({
      hornbach: { html: "<html><body>Just a moment...</body></html>" },
    });

    const rezultate = await cautaLaFurnizoriDetaliat("ciment", { ...OPTIUNI, fetchImpl: impl });

    expect(rezultate[0].motiv).toBe("blocat");
  });

  it("trece pe calea alternativa cand prima nu da nimic", async () => {
    process.env.SCRAPER_ACTIV = "true";
    process.env.SCRAPER_MAGAZINE = "leroymerlin";

    const cereri: string[] = [];
    const impl = (async (url: string) => {
      cereri.push(url);
      if (url.endsWith("robots.txt")) {
        return { ok: true, status: 200, text: async () => "" } as unknown as Response;
      }
      // Prima cale (adresa ghicita) da o pagina fara produse; a doua, lista.
      const html = url.includes("/search?q=") ? PAGINA("Ciment Portland", "32,50") : "<html></html>";
      return { ok: true, status: 200, text: async () => html } as unknown as Response;
    }) as unknown as typeof fetch;

    const rezultate = await cautaLaFurnizoriDetaliat("ciment", { ...OPTIUNI, fetchImpl: impl });

    expect(rezultate[0].observatii.length).toBeGreaterThan(0);
    expect(cereri.some((u) => u.includes("/cauta?q="))).toBe(true);
    expect(cereri.some((u) => u.includes("/search?q="))).toBe(true);
  });

  it("nu mai deranjeaza un magazin care a dat gol de trei ori", async () => {
    process.env.SCRAPER_ACTIV = "true";
    process.env.SCRAPER_MAGAZINE = "bricostore";
    const { impl, cereri } = retea({ bricostore: { html: "<html></html>" } });

    for (let i = 0; i < 4; i++) {
      await cautaLaFurnizor("ciment", { ...OPTIUNI, fetchImpl: impl });
      reseteazaFetcher();
    }

    const rezultate = await cautaLaFurnizoriDetaliat("ciment", { ...OPTIUNI, fetchImpl: impl });
    expect(rezultate[0].motiv).toBe("racit");

    // A patra cautare n-a mai cerut nimic: cererile s-au oprit dupa a treia.
    const pagini = cereri.filter((u) => !u.endsWith("robots.txt"));
    expect(pagini.length).toBeLessThanOrEqual(3 * 3);
  });

  it("spune care strat a citit pagina", async () => {
    process.env.SCRAPER_ACTIV = "true";
    process.env.SCRAPER_MAGAZINE = "hornbach";
    const jsonLd = {
      "@type": "ItemList",
      itemListElement: [
        {
          "@type": "Product",
          name: "Ciment Portland CEM II 40 kg",
          offers: { "@type": "Offer", price: 32.5, priceCurrency: "RON" },
        },
      ],
    };
    const { impl } = retea({
      hornbach: {
        html: `<html><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></html>`,
      },
    });

    const rezultate = await cautaLaFurnizoriDetaliat("ciment", { ...OPTIUNI, fetchImpl: impl });

    expect(rezultate[0].strat).toBe("jsonld");
  });
});
