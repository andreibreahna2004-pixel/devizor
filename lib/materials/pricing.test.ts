import { describe, expect, it } from "vitest";
import { manoperaCuIndice, potrivesteMaterial, reperPentruJudet } from "./pricing";

/**
 * Ce se verifica aici e ce cifra ajunge in fata omului ca reper de pret, si de
 * unde spune ca vine. Un reper national prezentat ca local ar fi o minciuna
 * despre piata lui.
 */

const zi = (s: string) => new Date(`${s}T12:00:00Z`);

describe("reperPentruJudet", () => {
  const obs = [
    { price: 320, countyCode: null, observedAt: zi("2026-08-20") },
    { price: 341.5, countyCode: "RO-CJ", observedAt: zi("2026-08-01") },
    { price: 336, countyCode: "RO-CJ", observedAt: zi("2026-07-10") },
    { price: 298, countyCode: "RO-BT", observedAt: zi("2026-08-25") },
  ];

  it("ia cel mai recent pret din judetul cerut", () => {
    const r = reperPentruJudet(obs, "RO-CJ");
    expect(r?.price).toBe(341.5);
    expect(r?.national).toBe(false);
  });

  it("judetul bate vechimea: local mai vechi, nu national mai nou", () => {
    // Nationalul e din 20 august, clujeanul din 1 august. Castiga Clujul.
    const r = reperPentruJudet(obs, "RO-CJ");
    expect(r?.price).toBe(341.5);
  });

  it("cade pe national cand judetul n-are observatii, si o spune", () => {
    const r = reperPentruJudet(obs, "RO-TL");
    expect(r?.price).toBe(320);
    expect(r?.national).toBe(true);
  });

  it("fara judet cerut da tot reperul national", () => {
    expect(reperPentruJudet(obs, null)?.price).toBe(320);
  });

  it("fara nicio observatie nu inventeaza un pret", () => {
    expect(reperPentruJudet([], "RO-CJ")).toBeNull();
  });

  it("cand nu exista national, foloseste ce are si marcheaza ca nu e local", () => {
    const doarJudete = obs.filter((o) => o.countyCode !== null);
    const r = reperPentruJudet(doarJudete, "RO-TL");
    expect(r?.national).toBe(true);
    expect(r?.price).toBe(298); // cea mai recenta dintre cele existente
  });

  it("duce mai departe furnizorul si adresa, ca omul sa poata verifica", () => {
    const r = reperPentruJudet(
      [{ price: 12.5, countyCode: "RO-B", observedAt: zi("2026-08-01"), supplier: "Furnizor", sourceUrl: "https://exemplu/x" }],
      "RO-B",
    );
    expect(r?.supplier).toBe("Furnizor");
    expect(r?.sourceUrl).toBe("https://exemplu/x");
  });
});

describe("manoperaCuIndice", () => {
  it("inmulteste reperul national cu indicele judetului", () => {
    expect(manoperaCuIndice(40, 1.18)).toEqual({ price: 47.2, ajustat: true });
  });

  it("fara indice lasa reperul national neatins si o spune", () => {
    expect(manoperaCuIndice(40, null)).toEqual({ price: 40, ajustat: false });
  });

  it("refuza indici absurzi in loc sa-i aplice", () => {
    for (const rau of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(manoperaCuIndice(40, rau)).toEqual({ price: 40, ajustat: false });
    }
  });
});

describe("potrivesteMaterial", () => {
  it("gaseste fara diacritice si cu potrivire partiala de cuvant", () => {
    expect(potrivesteMaterial("Sapa autonivelanta 25 kg", "sapa")).toBe(true);
    expect(potrivesteMaterial("Șapă autonivelantă 25 kg", "sapa")).toBe(true);
  });

  it("cere toate cuvintele, nu oricare", () => {
    expect(potrivesteMaterial("Adeziv gresie si faianta", "adeziv gresie")).toBe(true);
    expect(potrivesteMaterial("Adeziv gresie si faianta", "adeziv parchet")).toBe(false);
  });

  it("o cautare goala nu potriveste tot", () => {
    expect(potrivesteMaterial("Ciment", "")).toBe(false);
    expect(potrivesteMaterial("Ciment", "   ")).toBe(false);
  });
});
