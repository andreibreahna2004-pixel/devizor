import { describe, expect, it } from "vitest";
import { type ConfigSite, dinJsonLd, dinSelectoare, extrageProduse, unitateDinText } from "./extract";

const SITE: ConfigSite = {
  cheie: "proba",
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

  it("ia amindoua bazele cand produsul e cotat pe doua unitati", () => {
    // Cazul Hornbach: acelasi parchet, pret pe mp si pret pe pachet. Alegerea
    // uneia era un accident de ordine si putea pune pachetul in coloana lei/mp.
    const html = jsonLd({
      "@type": "Product",
      name: "Parchet triplustratificat 14 mm stejar",
      offers: [
        { "@type": "Offer", price: 209, unitCode: "mp" },
        { "@type": "Offer", price: 286.33, unitCode: "pachet" },
      ],
    });

    const gasite = dinJsonLd(html, SITE, ACUM);
    expect(gasite).toHaveLength(2);
    expect(gasite.map((o) => [o.unit, o.price])).toEqual([
      ["mp", 209],
      ["pachet", 286.33],
    ]);
    // Acelasi produs, doua baze: in catalog devin doua materiale, si asa trebuie.
    expect(new Set(gasite.map((o) => o.name)).size).toBe(1);
  });

  it("da o singura observatie la doua preturi pe aceeasi unitate", () => {
    // Doua preturi vii pe aceeasi baza inseamna un interval "de la": prima
    // pastreaza purtarea de dinainte.
    const html = jsonLd({
      "@type": "Product",
      name: "Adeziv gresie",
      offers: [
        { price: 26.5, unitCode: "sac" },
        { price: 31.9, unitCode: "sac" },
      ],
    });

    const gasite = dinJsonLd(html, SITE, ACUM);
    expect(gasite).toHaveLength(1);
    expect(gasite[0].price).toBe(26.5);
  });

  it("sare peste ofertele fara pret si nu arunca", () => {
    // AggregateOffer da lowPrice/highPrice, nu price. Nu se alege un capat de
    // interval: ar fi o presupunere intr-o coloana de bani.
    const html = jsonLd({
      "@type": "Product",
      name: "Vopsea lavabila",
      offers: [
        { "@type": "AggregateOffer", lowPrice: 40, highPrice: 90 },
        { "@type": "Offer", price: 55, unitCode: "l" },
      ],
    });

    const gasite = dinJsonLd(html, SITE, ACUM);
    expect(gasite).toHaveLength(1);
    expect(gasite[0].price).toBe(55);
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

  it("ia amindoua bazele cand cardul arata doua unitati", () => {
    const html = `<ul>
      <li class="produs"><span class="titlu">Parchet SKANDOR 14 mm</span>
        <span class="pret">209,00 lei/mp</span>
        <span class="pret">286,33 lei/pachet</span></li>
    </ul>`;

    const gasite = dinSelectoare(html, SITE, ACUM);
    expect(gasite.map((o) => [o.unit, o.price])).toEqual([
      ["mp", 209],
      ["pachet", 286.33],
    ]);
  });

  it("nu dubleaza cand acelasi pret e prins de doua ori de selector", () => {
    // Un selector larg prinde si nodul din afara si pe cel dinauntru. Aceeasi
    // unitate, deci o singura observatie.
    const laxe: ConfigSite = {
      ...SITE,
      selectoare: { ...SITE.selectoare, pret: ".pret, .pret span" },
    };
    const html = `<ul>
      <li class="produs"><span class="titlu">Ciment 40 kg</span>
        <div class="pret"><span>26,50 lei/sac</span></div></li>
    </ul>`;

    expect(dinSelectoare(html, laxe, ACUM)).toHaveLength(1);
  });

  it("pretul taiat nu devine a doua observatie", () => {
    // Se sterge din card inainte de citire, deci nu poate intra nici ca a doua
    // baza, chiar daca ar fi scris pe alta unitate.
    const html = `<ul>
      <li class="produs"><span class="titlu">Parchet redus</span>
        <span class="pret-vechi">67,91 lei/pachet</span>
        <span class="pret">57,90 lei/mp</span></li>
    </ul>`;

    const gasite = dinSelectoare(html, SITE, ACUM);
    expect(gasite).toHaveLength(1);
    expect(gasite[0].price).toBe(57.9);
  });

  it("cu s.um configurat, unitatea e una pentru tot cardul", () => {
    const cuUm: ConfigSite = {
      ...SITE,
      selectoare: { ...SITE.selectoare, um: ".um" },
    };
    const html = `<ul>
      <li class="produs"><span class="titlu">Gletiera</span><span class="um">buc</span>
        <span class="pret">39,90 lei</span>
        <span class="pret">44,90 lei</span></li>
    </ul>`;

    const gasite = dinSelectoare(html, cuUm, ACUM);
    expect(gasite).toHaveLength(1);
    expect(gasite[0].unit).toBe("buc");
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

  it("citeste ambalajele, si nu le confunda cu bucata", () => {
    // Un pret pe pachet luat drept pret pe bucata ar fi de citeva ori mai mare
    // si n-ar arata diferit pe ecran.
    expect(unitateDinText("286,33 lei/pachet")).toBe("pachet");
    expect(unitateDinText("59,90 lei/cutie")).toBe("cutie");
    expect(unitateDinText("120,00 lei/rola")).toBe("rola");
    expect(unitateDinText("310,00 lei/colac")).toBe("colac");
    expect(unitateDinText("240,00 lei/to")).toBe("to");
  });
});
