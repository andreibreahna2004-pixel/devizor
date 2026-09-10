import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ConfigSite } from "./extract";
import { reseteazaFetcher } from "./fetcher";
import { purtareRobots } from "./index";
import { cautaLaMagazine, magazineActive } from "./magazine";
import { golesteCacheRobots } from "./robots";

const CONFIG = { pauzaMs: 0, timeoutMs: 1000, cacheMs: 0 };

function site(cheie: string, gazda: string, peste: Partial<ConfigSite> = {}): ConfigSite {
  return {
    cheie,
    nume: cheie[0].toUpperCase() + cheie.slice(1),
    baseUrl: `https://${gazda}`,
    caleCautare: (q) => `/cauta?q=${encodeURIComponent(q)}`,
    selectoare: { card: ".p", denumire: ".t", pret: ".pret" },
    ...peste,
  };
}

/** O pagina cu un produs, in forma pe care o citesc selectoarele. */
function pagina(nume: string, pret: string): string {
  return `<ul><li class="p"><span class="t">${nume}</span><span class="pret">${pret}</span></li></ul>`;
}

/**
 * Un internet prefacut: robots.txt si pagini, pe gazda.
 *
 * `cereri` tine ce s-a cerut, ca sa se poata verifica **ce nu** s-a cerut: la un
 * magazin interzis, dovada e absenta cererii, nu lipsa rezultatelor.
 */
function internet(
  gazde: Record<string, { robots?: string; html?: string; status?: number }>,
) {
  const cereri: string[] = [];

  const fetchImpl = (async (url: string) => {
    cereri.push(url);
    const u = new URL(url);
    const g = gazde[u.hostname];

    if (!g) throw new Error(`gazda necunoscuta: ${u.hostname}`);

    if (u.pathname === "/robots.txt") {
      return { ok: true, text: async () => g.robots ?? "" } as unknown as Response;
    }

    if (g.status && g.status >= 400) {
      return { ok: false, status: g.status, text: async () => "" } as unknown as Response;
    }

    return { ok: true, text: async () => g.html ?? "" } as unknown as Response;
  }) as unknown as typeof fetch;

  return { fetchImpl, cereri };
}

beforeEach(() => {
  process.env.SCRAPER_ACTIV = "true";
  delete process.env.SCRAPER_MAGAZINE;
  delete process.env.SCRAPER_IGNORA_ROBOTS;
});

afterEach(() => {
  delete process.env.SCRAPER_ACTIV;
  delete process.env.SCRAPER_MAGAZINE;
  delete process.env.SCRAPER_IGNORA_ROBOTS;
  reseteazaFetcher();
  golesteCacheRobots();
});

describe("cautaLaMagazine", () => {
  it("cere la toate magazinele si intoarce cate un rezultat pe fiecare", async () => {
    const { fetchImpl } = internet({
      "unu.invalid": { html: pagina("Parchet A", "88,00 lei/mp") },
      "doi.invalid": { html: pagina("Parchet B", "209,00 lei/mp") },
    });

    const rezultate = await cautaLaMagazine("parchet", {
      siteUri: [site("unu", "unu.invalid"), site("doi", "doi.invalid")],
      fetchImpl,
      config: CONFIG,
    });

    expect(rezultate.map((r) => r.magazin)).toEqual(["Unu", "Doi"]);
    expect(rezultate.map((r) => r.stare)).toEqual(["ok", "ok"]);
    expect(rezultate[0].observatii[0].price).toBe(88);
    expect(rezultate[1].observatii[0].price).toBe(209);
  });

  it("un magazin cazut nu ia cu el pe ceilalti", async () => {
    const { fetchImpl } = internet({
      "bun.invalid": { html: pagina("Parchet", "88,00 lei/mp") },
      "rau.invalid": { status: 500 },
    });

    const rezultate = await cautaLaMagazine("parchet", {
      siteUri: [site("bun", "bun.invalid"), site("rau", "rau.invalid")],
      fetchImpl,
      config: CONFIG,
    });

    expect(rezultate[0].stare).toBe("ok");
    expect(rezultate[0].observatii).toHaveLength(1);
    expect(rezultate[1].stare).toBe("eroare");
    expect(rezultate[1].motiv).toMatch(/500/);
  });

  it("deosebeste 'gol' de 'eroare', ca zero sa nu fie ambiguu", async () => {
    // Un magazin care intoarce tacut zero timp de o luna e defectiunea care se
    // intampla de-adevaratelea. Trebuie sa se vada diferenta.
    const { fetchImpl } = internet({
      "gol.invalid": { html: "<ul></ul>" },
    });

    const [r] = await cautaLaMagazine("parchet", {
      siteUri: [site("gol", "gol.invalid")],
      fetchImpl,
      config: CONFIG,
    });

    expect(r.stare).toBe("gol");
    expect(r.observatii).toHaveLength(0);
  });

  it("nu cere pagina cand robots.txt interzice", async () => {
    const { fetchImpl, cereri } = internet({
      "nu.invalid": { robots: "User-agent: *\nDisallow: /cauta", html: pagina("X", "10 lei") },
    });

    const [r] = await cautaLaMagazine("parchet", {
      siteUri: [site("nu", "nu.invalid")],
      fetchImpl,
      config: CONFIG,
    });

    expect(r.stare).toBe("interzis");
    expect(r.cale).toBeNull();
    // Dovada e absenta cererii: s-a cerut doar robots.txt.
    expect(cereri.filter((u) => !u.endsWith("/robots.txt"))).toEqual([]);
  });

  it("vede interdictia scrisa pe query string", async () => {
    // Gaura de dinainte: cu pathname singur, regula asta trecea nevazuta.
    const { fetchImpl, cereri } = internet({
      "q.invalid": { robots: "User-agent: *\nDisallow: /*q=", html: pagina("X", "10 lei") },
    });

    const [r] = await cautaLaMagazine("parchet", {
      siteUri: [site("q", "q.invalid")],
      fetchImpl,
      config: CONFIG,
    });

    expect(r.stare).toBe("interzis");
    expect(cereri.filter((u) => !u.endsWith("/robots.txt"))).toEqual([]);
  });

  it("cu robots 'ignora' cere pagina, dar tot citeste fisierul si spune ce a trecut", async () => {
    const { fetchImpl, cereri } = internet({
      "ig.invalid": {
        robots: "User-agent: *\nDisallow: /cauta",
        html: pagina("Parchet", "88,00 lei/mp"),
      },
    });

    const [r] = await cautaLaMagazine("parchet", {
      siteUri: [site("ig", "ig.invalid", { robots: "ignora" })],
      fetchImpl,
      config: CONFIG,
    });

    expect(r.stare).toBe("ok");
    expect(r.observatii).toHaveLength(1);
    // Fisierul se cere oricum: o hotarire luata trebuie sa se vada in log.
    expect(cereri.some((u) => u.endsWith("/robots.txt"))).toBe(true);
    expect(r.motiv).toMatch(/ignorat din config/);
  });

  it("nu cere nimic cand scraperul e oprit", async () => {
    delete process.env.SCRAPER_ACTIV;
    const { fetchImpl, cereri } = internet({
      "unu.invalid": { html: pagina("X", "10 lei") },
    });

    const rezultate = await cautaLaMagazine("parchet", {
      siteUri: [site("unu", "unu.invalid")],
      fetchImpl,
      config: CONFIG,
    });

    expect(rezultate).toEqual([]);
    expect(cereri).toEqual([]);
  });

  it("nu cere nimic pe interogare alba", async () => {
    const { fetchImpl, cereri } = internet({ "unu.invalid": { html: "" } });
    expect(
      await cautaLaMagazine("   ", {
        siteUri: [site("unu", "unu.invalid")],
        fetchImpl,
        config: CONFIG,
      }),
    ).toEqual([]);
    expect(cereri).toEqual([]);
  });

  it("scrie acelasi moment pe toate observatiile trecerii", async () => {
    // Normalizat pe zi: altfel acelasi produs la acelasi pret, citit de doua ori
    // intr-o zi, ar intra de doua ori, fiindca marca de timp difera.
    const acum = new Date("2026-09-09T00:00:00.000Z");
    const { fetchImpl } = internet({
      "unu.invalid": { html: pagina("A", "10 lei/mp") },
      "doi.invalid": { html: pagina("B", "20 lei/mp") },
    });

    const rezultate = await cautaLaMagazine("parchet", {
      siteUri: [site("unu", "unu.invalid"), site("doi", "doi.invalid")],
      fetchImpl,
      config: CONFIG,
      acum,
    });

    for (const r of rezultate) {
      for (const o of r.observatii) expect(o.observedAt).toEqual(acum);
    }
  });
});

describe("magazineActive", () => {
  it("da toate magazinele cand variabila nu e setata", () => {
    expect(magazineActive().map((s) => s.cheie).sort()).toEqual([
      "brico",
      "dedeman",
      "hornbach",
      "leroymerlin",
    ]);
  });

  it("alege pe chei, in ordinea cerută", () => {
    process.env.SCRAPER_MAGAZINE = "hornbach, dedeman";
    expect(magazineActive().map((s) => s.cheie)).toEqual(["hornbach", "dedeman"]);
  });

  it("sare peste chei care nu exista, in loc sa cada", () => {
    process.env.SCRAPER_MAGAZINE = "hornbach,nuexista";
    expect(magazineActive().map((s) => s.cheie)).toEqual(["hornbach"]);
  });
});

describe("purtareRobots", () => {
  const s = site("dedeman", "d.invalid", { robots: "ignora" });
  const alt = site("hornbach", "h.invalid");

  it("ia purtarea din configurare cand variabila nu e setata", () => {
    expect(purtareRobots(s)).toBe("ignora");
    expect(purtareRobots(alt)).toBe("respecta");
  });

  it("variabila suprascrie in ambele sensuri", () => {
    process.env.SCRAPER_IGNORA_ROBOTS = "hornbach";
    // Hornbach trece pe ignora...
    expect(purtareRobots(alt)).toBe("ignora");
    // ...si Dedeman revine la respectat, desi in cod scrie altfel.
    expect(purtareRobots(s)).toBe("respecta");
  });

  it("variabila goala inseamna: se respecta la toate", () => {
    process.env.SCRAPER_IGNORA_ROBOTS = "";
    expect(purtareRobots(s)).toBe("respecta");
  });
});
