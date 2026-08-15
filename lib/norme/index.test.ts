import { describe, expect, it } from "vitest";
import { GRUPE, NORME, getNorma, grupeCuNumar, searchNorme } from "./index";

/**
 * Indicatorul e o lista fixa, extrasa dintr-un PDF. Testele pazesc doua lucruri:
 * ca extractia nu s-a stricat la o reimportare, si ca omul gaseste norma pe care
 * o cauta scriind cum vorbeste pe santier.
 */

describe("integritatea indicatoarelor", () => {
  const codeOf = {
    C: /^[A-Z]{2}\d{2}[A-Z0-9]{1,4}$/,
    RpC: /^RPC[A-Z]\d{2}[A-Z0-9]{1,3}$/,
    // "TS C 10 A" si "TS D 11 A1" — unele norme au varianta dupa numar.
    Ts: /^TS [A-J] \d{2}( [A-Z]\d?)?$/,
  };

  it("are toate normele complete", () => {
    expect(NORME.length).toBeGreaterThan(4000);

    for (const norma of NORME) {
      expect(norma.cod).toMatch(codeOf[norma.indicator]);
      expect(norma.denumire.length).toBeGreaterThan(3);
      // Ts nu da unitatea in sursa; C o are pe toate.
      if (norma.indicator === "C") expect(norma.um).toBeTruthy();
    }
  });

  it("nu are coduri duplicate, nici intre indicatoare", () => {
    const codes = new Set(NORME.map((n) => n.cod));
    expect(codes.size).toBe(NORME.length);
  });

  it("foloseste unitatile din aplicatie, nu cele din PDF", () => {
    const units = new Set(NORME.map((n) => n.um).filter(Boolean));
    expect(units).not.toContain("M.C.");
    expect(units).not.toContain("MP.");
    expect([...units].sort()).toEqual(
      ["100 buc", "100 ml", "buc", "kg", "l", "mc", "ml", "mp", "to"].sort(),
    );
  });

  it("are norme in fiecare grupa declarata", () => {
    const goale = grupeCuNumar()
      .filter((g) => g.numar === 0)
      .map((g) => g.prefix);

    expect(goale).toEqual([]);
  });

  it("fiecare norma cade intr-o grupa declarata", () => {
    for (const norma of NORME) {
      const grupa = GRUPE.find((g) => norma.cod.startsWith(g.prefix));
      expect(grupa?.indicator).toBe(norma.indicator);
    }
  });
});

describe("indicatorul Ts", () => {
  it("gaseste sapatura mecanica cu excavatorul, care lipseste din C", () => {
    const results = searchNorme("sapatura mecanica excavator");

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((n) => n.indicator === "Ts")).toBe(true);
  });

  it("accepta codul si fara spatii, cum il scrie omul", () => {
    expect(getNorma("TSC04")?.cod).toBe("TS C 04");
    expect(getNorma("ts c 04")?.cod).toBe("TS C 04");
  });

  it("lasa unitatea nedecisa, ca sursa nu o da", () => {
    expect(getNorma("TS C 04")?.um).toBeNull();
  });
});

describe("getNorma", () => {
  it("gaseste o norma dupa cod", () => {
    const norma = getNorma("CA01A1");
    expect(norma?.denumire).toContain("TURNARE BETON SIMPLU IN FUNDATII");
    expect(norma?.um).toBe("mc");
  });

  it("accepta codul scris cu litere mici sau cu spatii", () => {
    expect(getNorma(" ca01a1 ")?.cod).toBe("CA01A1");
  });

  it("intoarce null pentru un cod inventat", () => {
    expect(getNorma("XX99Z9")).toBeNull();
  });
});

describe("searchNorme", () => {
  it("cere toate cuvintele, nu doar unul", () => {
    const results = searchNorme("tencuieli interioare");
    expect(results.length).toBeGreaterThan(0);

    for (const norma of results) {
      const text = norma.denumire.toLowerCase();
      expect(text).toContain("tencuieli");
      expect(text).toContain("interioare");
    }
  });

  it("ignora diacriticele", () => {
    const cu = searchNorme("zidărie cărămidă");
    const fara = searchNorme("zidarie caramida");
    expect(cu).toEqual(fara);
    expect(cu.length).toBeGreaterThan(0);
  });

  it("gaseste si dupa cod", () => {
    expect(searchNorme("CA01")[0]?.cod.startsWith("CA01")).toBe(true);
  });

  it("scoate primele normele cu denumirea cea mai scurta", () => {
    const results = searchNorme("beton");
    const lengths = results.map((n) => n.denumire.length);
    expect(lengths).toEqual([...lengths].sort((a, b) => a - b));
  });

  it("respecta limita ceruta", () => {
    expect(searchNorme("beton", 5)).toHaveLength(5);
  });

  it("nu intoarce nimic pentru o interogare goala sau prea scurta", () => {
    expect(searchNorme("")).toEqual([]);
    expect(searchNorme("  a ")).toEqual([]);
  });

  it("nu inventeaza rezultate pentru lucrari care chiar lipsesc", () => {
    // Indicatoarele sint din anii '80: termosistemul si tamplaria PVC nu
    // existau, deci nu au norma nicaieri.
    expect(searchNorme("termosistem polistiren")).toEqual([]);
    expect(searchNorme("tamplarie pvc")).toEqual([]);
  });

  it("sapatura vine din Ts si RpC, nu din C", () => {
    const results = searchNorme("sapatura", 999);

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((n) => n.indicator !== "C")).toBe(true);
    expect(results.some((n) => n.indicator === "Ts")).toBe(true);
  });
});

describe("searchNorme — puntea peste felul in care e scris indicatorul", () => {
  it("gaseste STILPI cand omul scrie stalpi, cu sau fara diacritice", () => {
    for (const query of ["stâlpi beton", "stalpi beton"]) {
      const results = searchNorme(query, 999);

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((n) => /STILP/i.test(n.denumire))).toBe(true);
    }
  });

  it("gaseste TIMPLARIE cand omul scrie tamplarie", () => {
    const results = searchNorme("tamplarie lemn");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((n) => n.denumire.includes("TIMPLARIE"))).toBe(true);
  });

  it("trece peste nepotrivirea de numar: planseu gaseste PLANSEE", () => {
    const singular = searchNorme("cofraje planseu", 999);
    const plural = searchNorme("cofraje plansee", 999);

    expect(singular.length).toBeGreaterThan(0);
    expect(singular).toEqual(plural);
  });

  it("cauta trunchiat doar la inceput de cuvant, ca sa nu prinda altceva", () => {
    // Trunchiat, "stalp" devine "stal"; fara conditia de inceput de cuvant ar
    // prinde "inSTALatii".
    for (const norma of searchNorme("stalp", 999)) {
      expect(norma.denumire.toLowerCase()).not.toContain("instalatii");
    }
  });

  it("nu largeste cautarea cand cea exacta a gasit ceva", () => {
    // "zugraveli" are potriviri exacte, deci nu se cade pe forma trunchiata.
    for (const norma of searchNorme("zugraveli", 999)) {
      expect(norma.denumire.toUpperCase()).toContain("ZUGRAVELI");
    }
  });
});
