import { describe, expect, it } from "vitest";
import { parseCsv, parseNumar } from "./import";

/**
 * Un pret citit gresit intr-un import de mii de randuri nu se vede cu ochiul:
 * ajunge in reperul de pe linie si de acolo intr-o oferta. De aceea parsarea se
 * testeaza pe felul in care scriu furnizorii romani, nu pe numere curate.
 */

describe("parseNumar", () => {
  it("citeste formatul romanesc, cu virgula zecimala", () => {
    expect(parseNumar("1.234,56")).toBe(1234.56);
    expect(parseNumar("23,90")).toBe(23.9);
  });

  it("citeste si formatul englezesc", () => {
    expect(parseNumar("1,234.56")).toBe(1234.56);
    expect(parseNumar("23.90")).toBe(23.9);
  });

  it("nu confunda separatorul de mii cu cel zecimal", () => {
    // Capcana care ar da un pret de 1000 de ori mai mare.
    expect(parseNumar("1.234")).toBe(1234);
    expect(parseNumar("1,234")).toBe(1234);
  });

  it("scoate moneda si spatiile", () => {
    expect(parseNumar(" 45,50 lei ")).toBe(45.5);
    expect(parseNumar("45.50 RON")).toBe(45.5);
  });

  it("refuza ce nu e numar, in loc sa intoarca zero", () => {
    for (const rau of ["", "   ", "la cerere", "-", "abc"]) {
      expect(parseNumar(rau)).toBeNull();
    }
  });

  it("refuza preturile negative", () => {
    expect(parseNumar("-5")).toBeNull();
  });

  it("partea intreaga zero ramane zecimala: 0.125 nu e 125", () => {
    // Capcana inversa a celei de sus: regula "trei cifre = mii" ar strica
    // preturile subunitare, care exista (un surub, un dibl).
    expect(parseNumar("0.125")).toBe(0.125);
    expect(parseNumar("0,125")).toBe(0.125);
  });
});

describe("parseCsv", () => {
  const implicit = {
    supplier: "Furnizor SRL",
    observedAt: new Date("2026-08-28T10:00:00Z"),
    countyCode: null,
  };

  it("citeste coloanele dupa antet, nu dupa pozitie", () => {
    const csv = "pret;um;denumire\n23,90;sac;Ciment Portland 40 kg";
    const r = parseCsv(csv, implicit);
    expect(r.observations).toHaveLength(1);
    expect(r.observations[0]).toMatchObject({
      name: "Ciment Portland 40 kg",
      unit: "sac",
      price: 23.9,
      supplier: "Furnizor SRL",
    });
  });

  it("merge si cu virgula, si cu punct si virgula ca separator", () => {
    const cuVirgula = parseCsv("denumire,um,pret\nCiment,sac,23.90", implicit);
    expect(cuVirgula.observations[0].price).toBe(23.9);
  });

  it("nu se impiedica de diacritice si de majuscule in antet", () => {
    const r = parseCsv("Denumire;U.M.;Preț\nVar hidratat;sac;18,50", implicit);
    expect(r.observations).toHaveLength(1);
    expect(r.observations[0].unit).toBe("sac");
  });

  it("un rand stricat nu opreste importul, dar nici nu dispare tacut", () => {
    const csv = [
      "denumire;um;pret",
      "Ciment;sac;23,90",
      "Nisip;to;la cerere",
      ";sac;10",
      "Var;sac;18,50",
    ].join("\n");
    const r = parseCsv(csv, implicit);

    expect(r.observations.map((o) => o.name)).toEqual(["Ciment", "Var"]);
    expect(r.skipped).toEqual([
      { line: 3, reason: 'Pret necitit: "la cerere"' },
      { line: 4, reason: "Fara denumire" },
    ]);
  });

  it("ia judetul si data din fisier cand exista", () => {
    const csv = "denumire;um;pret;judet;data\nCiment;sac;25,00;RO-CJ;2026-07-15";
    const o = parseCsv(csv, implicit).observations[0];
    expect(o.countyCode).toBe("RO-CJ");
    expect(o.observedAt.toISOString().slice(0, 10)).toBe("2026-07-15");
  });

  it("cade pe valorile implicite cand fisierul nu le are", () => {
    const o = parseCsv("denumire;pret\nCiment;25", {
      ...implicit,
      countyCode: "RO-B",
    }).observations[0];
    expect(o.countyCode).toBe("RO-B");
    expect(o.observedAt).toEqual(implicit.observedAt);
    expect(o.unit).toBe("buc");
  });

  it("o data invalida nu strica randul: se foloseste cea implicita", () => {
    const o = parseCsv("denumire;pret;data\nCiment;25;candva", implicit).observations[0];
    expect(o.observedAt).toEqual(implicit.observedAt);
  });

  it("spune limpede cand antetul nu e bun, in loc sa importe nimic in tacere", () => {
    const r = parseCsv("coloana1;coloana2\na;b", implicit);
    expect(r.observations).toHaveLength(0);
    expect(r.skipped[0].reason).toContain("Antetul");
  });

  it("un fisier gol nu produce nimic si nu arunca", () => {
    expect(parseCsv("", implicit).observations).toHaveLength(0);
    expect(parseCsv("denumire;pret", implicit).observations).toHaveLength(0);
  });
});
