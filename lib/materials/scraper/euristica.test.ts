import { describe, expect, it } from "vitest";
import { type ConfigSite } from "./extract";
import { dinTipare } from "./euristica";

/**
 * Euristica se testeaza pe **arhetipuri de markup**, nu pe magazine.
 *
 * Nu se poate deschide niciun magazin din mediul in care s-a scris codul, deci un
 * test scris "pe Dedeman" ar fi tot o presupunere, doar cu nume adevarat pe ea. Ce
 * se poate demonstra e altceva, si e ce conteaza: acelasi cod, fara nicio
 * configurare, scoate produsele din forme de pagina care n-au nimic in comun, si
 * **nu** scoate nimic din formele care doar seamana.
 */

const SITE: ConfigSite = {
  cheie: "proba",
  nume: "Magazin de proba",
  baseUrl: "https://exemplu.invalid",
  caleCautare: (q) => `/cauta?q=${q}`,
};

const ACUM = new Date("2026-08-30T10:00:00.000Z");
const extrage = (html: string) => dinTipare(html, SITE, ACUM);

describe("dinTipare", () => {
  it("scoate produsele dintr-o lista clasica", () => {
    const html = `<ul>
      <li><h3><a href="/p/1">Ciment Portland CEM II 40 kg</a></h3><span>32,50 lei</span></li>
      <li><h3><a href="/p/2">Var hidratat pentru zidarie 20 kg</a></h3><span>18,90 lei</span></li>
      <li><h3><a href="/p/3">Adeziv gresie si faianta 25 kg</a></h3><span>45,00 lei</span></li>
    </ul>`;

    const iesire = extrage(html);

    expect(iesire).toHaveLength(3);
    expect(iesire[0].name).toBe("Ciment Portland CEM II 40 kg");
    expect(iesire[0].price).toBe(32.5);
    expect(iesire[0].sourceUrl).toBe("https://exemplu.invalid/p/1");
  });

  it("merge si pe o grila cu clase generate", () => {
    // La un magazin scris cu Tailwind sau CSS modules, doua carduri fratesti n-au
    // nicio clasa comuna. De aceea gruparea e pe parinte si tag, nu pe clase.
    const html = `<div class="x9f0">
      <article class="a1b2"><a href="/p/1" title="Parchet laminat stejar 8 mm">poza</a><div class="c3d4">59,90 lei</div></article>
      <article class="z7y8"><a href="/p/2" title="Parchet laminat nuc 10 mm">poza</a><div class="q1w2">72,50 lei</div></article>
    </div>`;

    const iesire = extrage(html);

    expect(iesire.map((o) => o.name)).toEqual([
      "Parchet laminat stejar 8 mm",
      "Parchet laminat nuc 10 mm",
    ]);
  });

  it("citeste pretul spart in mai multe noduri", () => {
    const html = `<ul>
      <li><h3><a href="/p/1">Placa gips carton 12,5 mm</a></h3>
        <p><span>1.234</span><span>,56</span><span> lei</span></p></li>
      <li><h3><a href="/p/2">Placa gips carton rezistenta la foc</a></h3>
        <p><span>1.500</span><span>,00</span><span> lei</span></p></li>
    </ul>`;

    expect(extrage(html).map((o) => o.price)).toEqual([1234.56, 1500]);
  });

  it("nu ia pretul taiat al unui produs redus", () => {
    // La un parchet redus scrie 57,90 linga 67,91; cel taiat ar intra in catalog ca
    // un pret care nu se mai practica.
    const html = `<ul>
      <li><h3><a href="/p/1">Parchet laminat stejar 8 mm</a></h3>
        <del>67,91 lei</del><span>57,90 lei</span></li>
      <li><h3><a href="/p/2">Parchet laminat nuc 10 mm</a></h3>
        <span class="pret-vechi">80,00 lei</span><span>72,50 lei</span></li>
    </ul>`;

    expect(extrage(html).map((o) => o.price)).toEqual([57.9, 72.5]);
  });

  it("nu scoate nimic dintr-un banner razlet", () => {
    // "de la 9,99 lei" pe o pagina fara grila nu e un produs. Un singur card nu e o
    // lista, si intr-un tabel din care nu se sterge nimic asta conteaza.
    const html = `<div><section><h2><a href="/promo">Promotie de toamna la scule</a></h2>
      <p>Produse de la 9,99 lei</p></section></div>`;

    expect(extrage(html)).toEqual([]);
  });

  it("nu confunda bara de sus si subsolul cu produse", () => {
    const html = `<body>
      <header><a href="/cos">Cosul meu</a><span>0,00 lei</span></header>
      <ul>
        <li><h3><a href="/p/1">Ciment Portland CEM II 40 kg</a></h3><span>32,50 lei</span></li>
        <li><h3><a href="/p/2">Var hidratat pentru zidarie 20 kg</a></h3><span>18,90 lei</span></li>
        <li><h3><a href="/p/3">Adeziv gresie si faianta 25 kg</a></h3><span>45,00 lei</span></li>
      </ul>
      <footer><a href="/livrare">Livrare standard</a><span>19,99 lei</span></footer>
    </body>`;

    const iesire = extrage(html);

    expect(iesire).toHaveLength(3);
    expect(iesire.every((o) => !/cos|livrare/i.test(o.name))).toBe(true);
  });

  it("citeste unitatea de dupa slash", () => {
    const html = `<ul>
      <li><h3><a href="/p/1">Parchet laminat stejar 8 mm</a></h3><span>62,90 lei/mp</span></li>
      <li><h3><a href="/p/2">Parchet laminat nuc 10 mm</a></h3><span>71,00 lei/mp</span></li>
    </ul>`;

    expect(extrage(html).map((o) => o.unit)).toEqual(["mp", "mp"]);
  });

  it("nu citeste numere care nu sunt preturi", () => {
    // Fara marcajul monedei, "8 mm" si "2026" ar fi preturi.
    const html = `<ul>
      <li><h3><a href="/p/1">Placa OSB 8 mm din 2026</a></h3><span>32,50 lei</span></li>
      <li><h3><a href="/p/2">Placa OSB 12 mm din 2026</a></h3><span>45,00 lei</span></li>
    </ul>`;

    expect(extrage(html).map((o) => o.price)).toEqual([32.5, 45]);
  });

  it("nu se sufoca pe o pagina mare", () => {
    const carduri = Array.from(
      { length: 500 },
      (_, i) => `<li><h3><a href="/p/${i}">Produsul de proba numarul ${i}</a></h3><span>${10 + i},50 lei</span></li>`,
    ).join("");

    expect(extrage(`<ul>${carduri}</ul>`).length).toBeGreaterThan(100);
  });

  it("nu arunca pe HTML rupt", () => {
    expect(() => extrage("<ul><li><h3><a href=/p/1>Ceva<span>32,50 lei")).not.toThrow();
  });
});
