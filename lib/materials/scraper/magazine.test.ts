import { afterEach, describe, expect, it } from "vitest";
import { MAGAZINE, caiDeCautare, magazineActive } from "./magazine";

/**
 * Cele patru magazine si felul in care se aleg.
 *
 * Nu se poate verifica de aici ca o adresa de cautare e cea buna — mediul n-are
 * acces la internet. Se verifica ce se poate: ca adresele sunt valide, ca fiecare
 * magazin are o identitate stabila, si ca operatorul poate opri unul sau muta
 * adresa fara sa astepte o versiune noua.
 */

afterEach(() => {
  delete process.env.SCRAPER_MAGAZINE;
  delete process.env.SCRAPER_URL_HORNBACH;
});

describe("MAGAZINE", () => {
  it("are cele patru magazine cerute", () => {
    expect(Object.keys(MAGAZINE).sort()).toEqual([
      "bricostore",
      "dedeman",
      "hornbach",
      "leroymerlin",
    ]);
  });

  it("are chei si nume distincte", () => {
    // `nume` e singura identitate a magazinului in `MaterialPrice.supplier`: doua
    // magazine cu acelasi nume ar amesteca doua serii de preturi in una singura.
    const nume = Object.values(MAGAZINE).map((m) => m.nume);
    expect(new Set(nume).size).toBe(nume.length);

    for (const [cheie, m] of Object.entries(MAGAZINE)) {
      expect(m.cheie).toBe(cheie);
    }
  });

  it("da adrese absolute valide, cu interogarea codata", () => {
    for (const m of Object.values(MAGAZINE)) {
      for (const cale of caiDeCautare(m, "adeziv gresie & faianta")) {
        const url = new URL(cale, m.baseUrl);
        expect(url.protocol).toBe("https:");
        expect(url.href).toContain("adeziv%20gresie");
        // Un `&` necodat ar rupe interogarea in doua si cautarea ar fi alta.
        expect(url.searchParams.get("q") ?? url.searchParams.get("s")).toContain("&");
      }
    }
  });

  it("incearca si formele alternative de adresa", () => {
    // Adresa de cautare nu e un fapt verificat de aici, deci exista rezerve.
    for (const m of Object.values(MAGAZINE)) {
      expect(caiDeCautare(m, "ciment").length).toBeGreaterThan(1);
    }
  });
});

describe("magazineActive", () => {
  it("le ia pe toate cand variabila lipseste", () => {
    expect(magazineActive()).toHaveLength(4);
  });

  it("restringe la ce cere operatorul, in ordinea data", () => {
    process.env.SCRAPER_MAGAZINE = "hornbach, dedeman";
    expect(magazineActive().map((m) => m.cheie)).toEqual(["hornbach", "dedeman"]);
  });

  it("ignora cheile pe care nu le cunoaste", () => {
    process.env.SCRAPER_MAGAZINE = "hornbach,inexistent";
    expect(magazineActive().map((m) => m.cheie)).toEqual(["hornbach"]);
  });

  it("nu ramane fara magazine daca variabila e numai gunoi", () => {
    process.env.SCRAPER_MAGAZINE = "inexistent";
    expect(magazineActive()).toHaveLength(4);
  });
});

describe("caiDeCautare", () => {
  it("lasa operatorul sa mute adresa fara deploy", () => {
    process.env.SCRAPER_URL_HORNBACH = "https://www.hornbach.ro/s/{q}";
    expect(caiDeCautare(MAGAZINE.hornbach, "ciment alb")).toEqual([
      "https://www.hornbach.ro/s/ciment%20alb",
    ]);
  });
});
