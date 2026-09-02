import { describe, expect, it } from "vitest";
import { type ConfigSite, dinJsonLd, dinSelectoare, extrageProduse, unitateDinText } from "./extract";

const SITE: ConfigSite = {
  nume: "Magazin de proba",
  baseUrl: "https://exemplu.invalid",
  caleCautare: (q) => `/cauta?q=${q}`,
  selectoare: {
    card: ".produs",
    denumire: ".titlu",
    pret: ".pret",
    pretVechi: ".pret-vechi",
    link: "a[href]",
  },
};

const ACUM = new Date("2026-08-30T10:00:00.000Z");

const jsonLd = (obiect: unknown) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(obiect)}</script></head><body></body></html>`;

describe("dinJsonLd", () => {
  it("scoate produsul si pretul din schema.org", () => {
    const html = jsonLd({
      "@type": "Product",
      name: "Parchet laminat 8 mm stejar",
      url: "/ro/parchet/p/4016028",
      offers: { "@type": "Offer", price: "62.90", priceCurrency: "RON" },
    });

    const [o] = dinJsonLd(html, SITE, ACUM);
    expect(o.name).toBe("Parchet laminat 8 mm stejar");
    expect(o.price).toBe(62.9);
    expect(o.supplier).toBe("Magazin de proba");
    expect(o.sourceUrl).toBe("https://exemplu.invalid/ro/parchet/p/4016028");
    // Pretul online e national: judetul schimba disponibilitatea, nu cifra.
    expect(o.countyCode).toBeNull();
  });

  it("desface listele de produse", () => {
    const html = jsonLd({
      "@type": "ItemList",
      itemListElement: [
        { "@type": "Product", name: "Unu", offers: { price: 10 } },
        { "@type": "Product", name: "Doi", offers: { price: 20 } },
      ],
    });

    expect(dinJsonLd(html, SITE, ACUM).map((o) => o.name)).toEqual(["Unu", "Doi"]);
  });

  it("sare peste blocul stricat si il pastreaza pe cel bun", () => {
    // O pagina cu zece produse din care unul are JSON invalid trebuie sa dea
    // noua observatii, nu zero.
    const html =
      '<script type="application/ld+json">{ nu e json }</script>' +
      jsonLd({ "@type": "Product", name: "Bun", offers: { price: 5 } });

    expect(dinJsonLd(html, SITE, ACUM)).toHaveLength(1);
  });

  it("arunca produsele fara pret sau cu pret imposibil", () => {
    const html = jsonLd({
      "@type": "ItemList",
      itemListElement: [
        { "@type": "Product", name: "Fara pret" },
        { "@type": "Product", name: "Pret zero", offers: { price: 0 } },
        { "@type": "Product", name: "Pret aiurea", offers: { price: "n/a" } },
        { "@type": "Product", name: "Bun", offers: { price: 12.5 } },
      ],
    });

    expect(dinJsonLd(html, SITE, ACUM).map((o) => o.name)).toEqual(["Bun"]);
  });

  it("nu confunda alte tipuri cu produse", () => {
    const html = jsonLd({ "@type": "BreadcrumbList", name: "Parchet", offers: { price: 9 } });
    expect(dinJsonLd(html, SITE, ACUM)).toHaveLength(0);
  });
});

describe("dinSelectoare", () => {
  it("citeste denumirea, pretul si adresa din card", () => {
    const html = `<ul>
      <li class="produs"><a href="/p/1"><span class="titlu">Ciment 40 kg</span></a>
        <span class="pret">26,50 lei/sac</span></li>
    </ul>`;

    const [o] = dinSelectoare(html, SITE, ACUM);
    expect(o.name).toBe("Ciment 40 kg");
    expect(o.price).toBe(26.5);
    expect(o.unit).toBe("sac");
    expect(o.sourceUrl).toBe("https://exemplu.invalid/p/1");
  });

  it("ia pretul redus, nu pe cel taiat", () => {
    // Cazul care conteaza cel mai mult: la Dedeman un parchet redus arata 57,90
    // linga 67,91. Cel taiat, luat din greseala, ar intra in catalog ca un pret
    // care nu se mai practica.
    const html = `<ul>
      <li class="produs"><span class="titlu">Parchet Kronospan 12 mm</span>
        <span class="pret-vechi">67,91 lei/mp</span>
        <span class="pret">57,90 lei/mp</span></li>
    </ul>`;

    const [o] = dinSelectoare(html, SITE, ACUM);
    expect(o.price).toBe(57.9);
    expect(o.unit).toBe("mp");
  });

  it("ia pretul curent chiar cand cel taiat e scris primul si prinde acelasi selector", () => {
    const laxe: ConfigSite = {
      ...SITE,
      selectoare: { ...SITE.selectoare, pret: "span", pretVechi: ".pret-vechi" },
    };
    const html = `<ul><li class="produs">
      <span class="pret-vechi">67,91 lei</span><span class="titlu">X</span><span>57,90 lei</span>
    </li></ul>`;

    // Pretul vechi se sterge din card inainte de citire, deci nu poate fi luat
    // nici cand selectorul e larg.
    expect(dinSelectoare(html, laxe, ACUM)[0].price).toBe(57.9);
  });

  it("sare peste cardurile fara denumire sau fara pret", () => {
    const html = `<ul>
      <li class="produs"><span class="pret">10 lei</span></li>
      <li class="produs"><span class="titlu">Fara pret</span></li>
      <li class="produs"><span class="titlu">Bun</span><span class="pret">10 lei</span></li>
    </ul>`;

    expect(dinSelectoare(html, SITE, ACUM).map((o) => o.name)).toEqual(["Bun"]);
  });

  it("intoarce lista goala pe o pagina fara produse", () => {
    expect(dinSelectoare("<html><body>nimic</body></html>", SITE, ACUM)).toEqual([]);
  });
});

describe("extrageProduse", () => {
  it("prefera JSON-LD si nu mai incearca selectoarele", () => {
    const html =
      jsonLd({ "@type": "Product", name: "Din standard", offers: { price: 30 } }) +
      '<li class="produs"><span class="titlu">Din selector</span><span class="pret">40 lei</span></li>';

    const rezultat = extrageProduse(html, SITE, ACUM);
    expect(rezultat).toHaveLength(1);
    expect(rezultat[0].name).toBe("Din standard");
  });

  it("cade pe selectoare cand JSON-LD lipseste", () => {
    const html = '<li class="produs"><span class="titlu">Din selector</span><span class="pret">40 lei</span></li>';
    expect(extrageProduse(html, SITE, ACUM)[0].name).toBe("Din selector");
  });

  it("cade pe selectoare si cand JSON-LD e stricat", () => {
    const html =
      '<script type="application/ld+json">{stricat}</script>' +
      '<li class="produs"><span class="titlu">Din selector</span><span class="pret">40 lei</span></li>';
    expect(extrageProduse(html, SITE, ACUM)[0].name).toBe("Din selector");
  });
});

describe("unitateDinText", () => {
  it("citeste unitatea de dupa slash", () => {
    expect(unitateDinText("57,90 lei/mp")).toBe("mp");
    expect(unitateDinText("26,50 lei/sac")).toBe("sac");
    expect(unitateDinText("12 lei/kg")).toBe("kg");
  });

  it("cade pe bucata cand nu se poate citi", () => {
    // Neutru, si omul o schimba — ca la normele fara unitate in indicator.
    expect(unitateDinText("57,90 lei")).toBe("buc");
    expect(unitateDinText(null)).toBe("buc");
    expect(unitateDinText("")).toBe("buc");
  });
});
