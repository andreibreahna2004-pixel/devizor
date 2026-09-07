import { describe, expect, it } from "vitest";
import { type ConfigSite } from "./extract";
import { dinStareJson } from "./stare-app";

/**
 * Stratul care vede produsele cand DOM-ul nu le arata.
 *
 * Un magazin scris in Next sau Nuxt trimite datele o data ca JSON si abia apoi
 * deseneaza lista din ele. Pentru o aplicatie care cere pagina cu `fetch`, asta e
 * diferenta dintre "magazinul nu da nimic" si catalogul plin.
 */

const SITE: ConfigSite = {
  cheie: "proba",
  nume: "Magazin de proba",
  baseUrl: "https://exemplu.invalid",
  caleCautare: (q) => `/cauta?q=${q}`,
};

const ACUM = new Date("2026-08-30T10:00:00.000Z");
const extrage = (html: string) => dinStareJson(html, SITE, ACUM);

const nextData = (obiect: unknown) =>
  `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(obiect)}</script></body></html>`;

describe("dinStareJson", () => {
  it("scoate produsele ingropate in __NEXT_DATA__", () => {
    const html = nextData({
      props: {
        pageProps: {
          rezultate: {
            produse: [
              { id: 1, name: "Ciment Portland CEM II 40 kg", price: 32.5, url: "/p/1" },
              { id: 2, name: "Var hidratat 20 kg", price: 18.9, url: "/p/2" },
            ],
          },
        },
      },
    });

    const iesire = extrage(html);

    expect(iesire).toHaveLength(2);
    expect(iesire[0].price).toBe(32.5);
    expect(iesire[0].sourceUrl).toBe("https://exemplu.invalid/p/1");
    expect(iesire[0].supplier).toBe("Magazin de proba");
  });

  it("citeste pretul si cand e obiect", () => {
    const html = nextData({
      produse: [{ sku: "A1", title: "Adeziv gresie 25 kg", price: { value: 45.5, currency: "RON" } }],
    });

    expect(extrage(html)[0].price).toBe(45.5);
  });

  it("citeste cheile scrise cu underscore", () => {
    const html = nextData({
      items: [{ product_id: 7, product_name: "Placa OSB 12 mm", final_price: "89,90" }],
    });

    expect(extrage(html)[0].price).toBe(89.9);
  });

  it("arunca preturile in alta moneda", () => {
    // Un pret in euro citit ca leu intra in catalog de cinci ori mai mic decat
    // adevarul, si nu se mai poate distinge dupa aceea.
    const html = nextData({
      produse: [{ id: 1, name: "Pompa de caldura", price: 1200, currency: "EUR", url: "/p/1" }],
    });

    expect(extrage(html)).toEqual([]);
  });

  it("nu ia un obiect cu nume si pret dar fara identitate", () => {
    // Configurari, texte de interfata si evenimente de urmarire au si ele nume si
    // numere; cheia de identitate e ce le deosebeste de produse.
    const html = nextData({ config: { name: "livrare standard", price: 19.99 } });

    expect(extrage(html)).toEqual([]);
  });

  it("nu arunca pe un payload care nu e JSON", () => {
    // Nuxt isi inveleste uneori starea intr-o functie. Nu se interpreteaza cod
    // strain: se incearca `JSON.parse`, si daca nu merge, lista e goala.
    const html = `<script>window.__NUXT__=(function(a,b){return {data:[{id:1,name:"X",price:a}]}}(32.5,1))</script>`;

    expect(() => extrage(html)).not.toThrow();
  });

  it("citeste starea Nuxt cand e JSON curat", () => {
    const html = `<script>window.__NUXT__={"data":[{"produse":[{"id":1,"name":"Ciment Portland 40 kg","price":32.5,"url":"/p/1"}]}]}</script>`;

    expect(extrage(html)[0].name).toBe("Ciment Portland 40 kg");
  });

  it("sare peste un bloc stricat si merge mai departe", () => {
    const html = `<script type="application/json">{ stricat</script>
      ${nextData({ produse: [{ id: 1, name: "Ciment Portland 40 kg", price: 32.5, url: "/p/1" }] })}`;

    expect(extrage(html)).toHaveLength(1);
  });

  it("se opreste inainte sa manance procesorul pe un blob urias", () => {
    // Ruleaza pe calea de randare a paginii omului: plimbarea e marginita.
    const gunoi = Array.from({ length: 20_000 }, (_, i) => ({ k: i, text: `nimic ${i}` }));
    const html = nextData({ gunoi });

    const inceput = Date.now();
    expect(extrage(html)).toEqual([]);
    expect(Date.now() - inceput).toBeLessThan(2000);
  });
});
