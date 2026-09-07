import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { type ConfigSite } from "@/lib/materials/scraper/extract";
import { condenseaza, extrageCuAi } from "./extrage-produse";

/**
 * Stratul cu model, verificat fara sa se atinga reteaua.
 *
 * Clientul se injecteaza, ca `fetchImpl` la `api-source.ts`: altfel nimic din ce
 * urmeaza — validarea, verificarea in pagina, salvarea selectoarelor — n-ar putea
 * fi verificat decat platind un apel adevarat, iar intr-o aplicatie unde cifra
 * ajunge intr-un catalog de preturi asta inseamna neverificat.
 */

const SITE: ConfigSite = {
  cheie: "proba",
  nume: "Magazin de proba",
  baseUrl: "https://exemplu.invalid",
  caleCautare: (q) => `/cauta?q=${q}`,
};

const ACUM = new Date("2026-08-30T10:00:00.000Z");

const PAGINA = `<ul>
  <li class="produs"><a class="titlu" href="/p/1">Ciment Portland CEM II 40 kg</a><span class="pret">32,50 lei</span></li>
  <li class="produs"><a class="titlu" href="/p/2">Ciment alb 25 kg</a><span class="pret">48,90 lei</span></li>
</ul>`;

/** Client fals: intoarce exact textul dat, in forma in care raspunde SDK-ul. */
function clientFals(raspuns: unknown, folosire = { input_tokens: 1200, output_tokens: 80 }) {
  const cereri: unknown[] = [];
  const client = {
    messages: {
      create: async (cerere: unknown) => {
        cereri.push(cerere);
        return {
          content: [{ type: "text", text: JSON.stringify(raspuns) }],
          usage: folosire,
        };
      },
    },
  } as unknown as Anthropic;
  return { client, cereri };
}

describe("extrageCuAi", () => {
  it("scoate produsele pe care modelul le-a citit din pagina", async () => {
    const { client } = clientFals({
      produse: [
        { denumire: "Ciment Portland CEM II 40 kg", pret: "32,50", um: "sac", url: "/p/1" },
        { denumire: "Ciment alb 25 kg", pret: "48,90", url: "/p/2" },
      ],
      selectoare: null,
    });

    const iesire = await extrageCuAi(PAGINA, SITE, "ciment", ACUM, client);

    expect(iesire.observatii).toHaveLength(2);
    expect(iesire.observatii[0].price).toBe(32.5);
    expect(iesire.observatii[0].unit).toBe("sac");
    expect(iesire.observatii[0].supplier).toBe("Magazin de proba");
    expect(iesire.observatii[0].sourceUrl).toBe("https://exemplu.invalid/p/1");
    expect(iesire.folosire.inputTokens).toBe(1200);
  });

  it("arunca un produs care nu e in pagina si le pastreaza pe celelalte", async () => {
    // Cazul de care atarna tot: un model care n-a gasit destule poate completa din
    // ce stie despre materiale. Ce nu scrie in pagina nu e o observatie.
    const { client } = clientFals({
      produse: [
        { denumire: "Ciment Portland CEM II 40 kg", pret: "32,50" },
        { denumire: "Ciment Portland CEM I 50 kg", pret: "41,00" },
      ],
    });

    const iesire = await extrageCuAi(PAGINA, SITE, "ciment", ACUM, client);

    expect(iesire.observatii.map((o) => o.name)).toEqual(["Ciment Portland CEM II 40 kg"]);
  });

  it("arunca un pret care nu e cel din pagina", async () => {
    const { client } = clientFals({
      produse: [{ denumire: "Ciment Portland CEM II 40 kg", pret: "29,90" }],
    });

    const iesire = await extrageCuAi(PAGINA, SITE, "ciment", ACUM, client);

    expect(iesire.observatii).toEqual([]);
  });

  it("nu produce nimic dintr-un raspuns care nu trece de zod", async () => {
    const { client } = clientFals({ produse: [{ denumire: "X", pret: 32.5 }] });

    const iesire = await extrageCuAi(PAGINA, SITE, "ciment", ACUM, client);

    expect(iesire.observatii).toEqual([]);
    // Apelul s-a facut si a costat, deci folosirea se raporteaza oricum.
    expect(iesire.folosire.inputTokens).toBe(1200);
  });

  it("pastreaza selectoarele care se verifica pe aceeasi pagina", async () => {
    const { client } = clientFals({
      produse: [
        { denumire: "Ciment Portland CEM II 40 kg", pret: "32,50" },
        { denumire: "Ciment alb 25 kg", pret: "48,90" },
      ],
      selectoare: { card: ".produs", denumire: ".titlu", pret: ".pret", link: "a[href]" },
    });

    const iesire = await extrageCuAi(PAGINA, SITE, "ciment", ACUM, client);

    expect(iesire.selectoare?.card).toBe(".produs");
  });

  it("nu pastreaza selectoare care nu prind nimic", async () => {
    // Un selector nepotrivit salvat ar fi tot o presupunere, doar ca de-acum
    // scrisa in baza, cu aerul unui fapt.
    const { client } = clientFals({
      produse: [{ denumire: "Ciment Portland CEM II 40 kg", pret: "32,50" }],
      selectoare: { card: ".nu-exista", denumire: ".nici-asta", pret: ".nici-asta" },
    });

    const iesire = await extrageCuAi(PAGINA, SITE, "ciment", ACUM, client);

    expect(iesire.selectoare).toBeNull();
  });

  it("trimite pagina condensata, nu HTML-ul brut", async () => {
    const { client, cereri } = clientFals({ produse: [] });

    await extrageCuAi(
      `<html><head><style>.x{color:red}</style><script>var a=1;</script></head><body>${PAGINA}</body></html>`,
      SITE,
      "ciment",
      ACUM,
      client,
    );

    const mesaj = JSON.stringify(cereri[0]);
    expect(mesaj).not.toContain("var a=1");
    expect(mesaj).not.toContain("color:red");
    expect(mesaj).toContain("Ciment Portland");
  });
});

describe("condenseaza", () => {
  it("scoate scripturile si stilurile si pastreaza textul si legaturile", () => {
    const text = condenseaza(
      `<html><body><script>tot ce e aici dispare</script><style>.a{}</style>
       <a href="/p/1">Ciment Portland 40 kg</a><img alt="poza ciment"></body></html>`,
    );

    expect(text).not.toContain("tot ce e aici dispare");
    expect(text).toContain("Ciment Portland 40 kg");
    expect(text).toContain("/p/1");
    expect(text).toContain("poza ciment");
  });

  it("respecta plafonul de caractere", () => {
    const mult = `<ul>${"<li>Ciment Portland CEM II 40 kg 32,50 lei</li>".repeat(5000)}</ul>`;

    expect(condenseaza(mult, 1000).length).toBeLessThanOrEqual(1000);
  });
});
