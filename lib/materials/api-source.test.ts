import { describe, expect, it } from "vitest";
import { ApiSourceError, createApiPriceSource } from "./api-source";
import { LaborSourceError, createApiLaborSource } from "./labor-source";

/**
 * Transportul e injectat, deci tot lantul — cerere, validare, mapare — se
 * verifica aici, fara retea. Cand se conecteaza un API adevarat, singurul lucru
 * care se schimba e de unde vin octetii; ce se intampla cu ei ramane dovedit.
 */

/** Un API prefacut: intoarce paginile date, si tine minte ce i s-a cerut. */
function apiFals(pagini: unknown[], opt: { status?: number } = {}) {
  const cereri: { url: string; auth: string | null }[] = [];

  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    cereri.push({
      url: u,
      auth: (init?.headers as Record<string, string> | undefined)?.Authorization ?? null,
    });
    const page = Number(new URL(u).searchParams.get("page") ?? "1");
    return {
      ok: opt.status ? opt.status < 400 : true,
      status: opt.status ?? 200,
      json: async () => pagini[page - 1],
    } as Response;
  }) as unknown as typeof fetch;

  return { fetchImpl, cereri };
}

describe("createApiPriceSource", () => {
  const item = {
    name: "Ciment Portland 40 kg",
    unit: "sac",
    price: 26.5,
    county: "RO-CJ",
    observedAt: "2026-08-01",
    supplier: "Furnizor A",
    url: "https://exemplu/ciment",
  };

  it("citeste o pagina si o mapeaza intreaga", async () => {
    const { fetchImpl } = apiFals([{ items: [item] }]);
    const o = await createApiPriceSource({ baseUrl: "https://api/preturi", fetchImpl }).fetch();

    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({
      name: "Ciment Portland 40 kg",
      unit: "sac",
      price: 26.5,
      countyCode: "RO-CJ",
      supplier: "Furnizor A",
      sourceUrl: "https://exemplu/ciment",
    });
    expect(o[0].observedAt.toISOString().slice(0, 10)).toBe("2026-08-01");
  });

  it("urmareste paginarea pana la capat", async () => {
    const { fetchImpl, cereri } = apiFals([
      { items: [item], nextPage: 2 },
      { items: [{ ...item, name: "Var" }], nextPage: 3 },
      { items: [{ ...item, name: "Nisip" }] },
    ]);
    const o = await createApiPriceSource({ baseUrl: "https://api/preturi", fetchImpl }).fetch();

    expect(o.map((x) => x.name)).toEqual(["Ciment Portland 40 kg", "Var", "Nisip"]);
    expect(cereri.map((c) => new URL(c.url).searchParams.get("page"))).toEqual(["1", "2", "3"]);
  });

  it("nu se invarte la nesfarsit daca API-ul cere mereu pagina urmatoare", async () => {
    const fetchImpl = (async () =>
      ({ ok: true, status: 200, json: async () => ({ items: [item], nextPage: 99 }) }) as Response) as unknown as typeof fetch;

    const o = await createApiPriceSource({
      baseUrl: "https://api/preturi",
      fetchImpl,
      maxPages: 5,
    }).fetch();
    expect(o).toHaveLength(5);
  });

  it("trimite cheia ca Bearer cand exista, si nimic cand nu", async () => {
    const cuCheie = apiFals([{ items: [] }]);
    await createApiPriceSource({ baseUrl: "https://api/p", apiKey: "secret", fetchImpl: cuCheie.fetchImpl }).fetch();
    expect(cuCheie.cereri[0].auth).toBe("Bearer secret");

    const faraCheie = apiFals([{ items: [] }]);
    await createApiPriceSource({ baseUrl: "https://api/p", fetchImpl: faraCheie.fetchImpl }).fetch();
    expect(faraCheie.cereri[0].auth).toBeNull();
  });

  it("un judet necunoscut devine pret national, nu unul legat de o zona inventata", async () => {
    const { fetchImpl } = apiFals([{ items: [{ ...item, county: "RO-XX" }] }]);
    const o = await createApiPriceSource({ baseUrl: "https://api/p", fetchImpl }).fetch();
    expect(o[0].countyCode).toBeNull();
  });

  it("o data invalida nu strica randul", async () => {
    const { fetchImpl } = apiFals([{ items: [{ ...item, observedAt: "candva" }] }]);
    const o = await createApiPriceSource({ baseUrl: "https://api/p", fetchImpl }).fetch();
    expect(Number.isNaN(o[0].observedAt.getTime())).toBe(false);
  });

  it("un raspuns de forma gresita opreste importul, nu il lasa pe jumatate", async () => {
    const { fetchImpl } = apiFals([{ items: [{ name: "Ciment", price: "mult" }] }]);
    await expect(
      createApiPriceSource({ baseUrl: "https://api/p", fetchImpl }).fetch(),
    ).rejects.toBeInstanceOf(ApiSourceError);
  });

  it("un API care raspunde cu eroare se vede, nu se inghite", async () => {
    const { fetchImpl } = apiFals([{ items: [] }], { status: 503 });
    await expect(
      createApiPriceSource({ baseUrl: "https://api/p", fetchImpl }).fetch(),
    ).rejects.toThrow(/503/);
  });
});

describe("createApiLaborSource", () => {
  function laborFals(corp: unknown, status = 200) {
    return (async () =>
      ({ ok: status < 400, status, json: async () => corp }) as Response) as unknown as typeof fetch;
  }

  it("ia indicele direct cand API-ul il da", async () => {
    const o = await createApiLaborSource({
      baseUrl: "https://api/manopera",
      fetchImpl: laborFals({
        period: "2026-06-01",
        counties: [
          { county: "RO-B", index: 1.18 },
          { county: "RO-BT", index: 0.87 },
        ],
      }),
    }).fetch();

    expect(o.map((x) => [x.countyCode, x.value])).toEqual([
      ["RO-B", 1.18],
      ["RO-BT", 0.87],
    ]);
    expect(o[0].period.toISOString().slice(0, 10)).toBe("2026-06-01");
  });

  it("calculeaza indicele din lei/ora, cand se stie media nationala", async () => {
    const o = await createApiLaborSource({
      baseUrl: "https://api/m",
      fetchImpl: laborFals({ national: 40, counties: [{ county: "RO-CJ", value: 46 }] }),
    }).fetch();
    expect(o[0].value).toBe(1.15);
  });

  it("fara media nationala, o valoare in lei nu se poate transforma in indice", async () => {
    const o = await createApiLaborSource({
      baseUrl: "https://api/m",
      fetchImpl: laborFals({ counties: [{ county: "RO-CJ", value: 46 }] }),
    }).fetch();
    expect(o).toHaveLength(0);
  });

  it("arunca judetele necunoscute in loc sa le lege de alt cod", async () => {
    const o = await createApiLaborSource({
      baseUrl: "https://api/m",
      fetchImpl: laborFals({ counties: [{ county: "RO-XX", index: 1.5 }, { county: "RO-B", index: 1.1 }] }),
    }).fetch();
    expect(o.map((x) => x.countyCode)).toEqual(["RO-B"]);
  });

  it("un raspuns fara indice si fara valoare e refuzat, nu ghicit", async () => {
    await expect(
      createApiLaborSource({
        baseUrl: "https://api/m",
        fetchImpl: laborFals({ counties: [{ county: "RO-B" }] }),
      }).fetch(),
    ).rejects.toBeInstanceOf(LaborSourceError);
  });
});
