import { describe, expect, it } from "vitest";
import { searchNorme } from "./index";

/**
 * Cazurile de santier: patru descrieri scrise asa cum vorbeste mesterul, sparte
 * in lucrarile din ele.
 *
 * Testele astea nu verifica motorul de cautare, ci **puntea dintre doua limbaje**:
 * cel de pe santier si cel al indicatoarelor, tiparite in anii '80. De aceea
 * fiecare caz spune si ce trebuie sa NU gaseasca — jumatate din greselile
 * costisitoare nu sint zerouri, ci norme vecine care par corecte: sapatura
 * pentru un sant de scurgere in loc de fundatie, jgheabul de moloz in loc de
 * transport.
 *
 * Cind un caz de aici pica, intrebarea nu e cum sa treaca testul, ci daca norma
 * pe care o cere chiar descrie lucrarea. Un cod gresit ajunge pe un act semnat.
 */

/** Codurile intoarse pentru o interogare, pe primele `limit` pozitii. */
function coduri(query: string, limit = 5): string[] {
  return searchNorme(query, limit).map((n) => n.cod);
}

/** Adevarat cand printre primele rezultate e o norma din familia ceruta. */
function gaseste(query: string, prefix: string, limit = 5): boolean {
  return coduri(query, limit).some((cod) => cod.replace(/\s+/g, "").startsWith(prefix));
}

describe("1. amenajari interioare — glet, sapa, parchet, plinta", () => {
  it("indreptarea peretilor cu glet duce la gletul din indicatorul C", () => {
    expect(gaseste("glet ipsos tencuieli interioare", "CF10")).toBe(true);
  });

  it("'sapa' inseamna strat suport, nu sapatura de pamint", () => {
    // Fara vocabular, "sapa" scotea epuizarea apei din sapaturi (TS A 25).
    expect(gaseste("sapa pardoseli", "CG01")).toBe(true);
    expect(coduri("sapa pardoseli").every((cod) => !cod.startsWith("TS"))).toBe(true);
  });

  it("sapa autonivelanta cade tot pe stratul suport", () => {
    expect(gaseste("sapa autonivelanta", "CG01")).toBe(true);
  });

  it("plinta de lemn are norma, in RpC", () => {
    expect(gaseste("plinte lemn stejar", "RPCK13")).toBe(true);
  });

  it("parchetul laminat de azi nu are norma proprie", () => {
    // CG02 exista, dar e parchet de stejar batut in cuie sau lipit cu aracet:
    // altceva decit parchetul flotant de azi. Modelul are voie sa il gaseasca,
    // dar promptul ii cere sa nu-l foloseasca pentru laminat.
    expect(searchNorme("parchet laminat flotant")).toEqual([]);
  });

  it("decopertarea gletului vechi nu are norma", () => {
    expect(searchNorme("decopertare glet vechi")).toEqual([]);
  });
});

describe("2. fundatie si gard — sapatura, cofraj, beton, hidroizolatie", () => {
  it("santul de fundatie e 'spatii limitate' in indicator, nu 'sant'", () => {
    // "Sant" singur duce in Ts la rigolele de scurgere a apelor (TS A 19).
    expect(gaseste("sapatura manuala sant fundatie", "TSA")).toBe(true);
    expect(coduri("sapatura manuala sant fundatie")).not.toContain("TS A 19");
  });

  it("turnarea betonului in fundatie gaseste familia CA", () => {
    expect(gaseste("turnare beton armat fundatii", "CA02")).toBe(true);
  });

  it("decofrarea e 'demontare cofraje' in indicator", () => {
    expect(searchNorme("decofrare").length).toBeGreaterThan(0);
    expect(gaseste("decofrare", "CB")).toBe(true);
  });

  it("hidroizolatia nu are norma: indicatorul Iz lipseste", () => {
    expect(searchNorme("hidroizolatie soclu")).toEqual([]);
    expect(searchNorme("izolatie bituminoasa")).toEqual([]);
  });
});

describe("3. zidarie si izolatie exterioara", () => {
  it("zidaria din BCA gaseste blocurile GBN din C", () => {
    expect(gaseste("zidarie blocuri bca", "CD07")).toBe(true);
  });

  it("termosistemul nu are norma, oricum ar fi scris", () => {
    for (const query of [
      "termosistem",
      "termosistem polistiren fatada",
      "polistiren expandat termoizolatie fatada",
    ]) {
      expect(searchNorme(query)).toEqual([]);
    }
  });

  it("profilul de colt cu plasa nu are norma", () => {
    // CD17 exista, dar sint profile de colt din tabla zincata pentru rosturi de
    // dilatatie — nu profilul de termosistem cu plasa din fibra de sticla.
    expect(searchNorme("profile colt plasa fibra sticla")).toEqual([]);
  });
});

describe("4. acoperis si scurgeri", () => {
  it("astereala din scindura gaseste norma exacta din C", () => {
    expect(coduri("astereala scinduri rasinoase")).toContain("CE18A1");
  });

  it("jgheaburile si burlanele au norme in RpC", () => {
    expect(gaseste("jgheaburi tabla zincata", "RPCI21")).toBe(true);
    expect(gaseste("burlane tabla zincata", "RPCI25")).toBe(true);
  });

  it("evacuarea molozului nu are norma: indicatorul Tr nu e incarcat", () => {
    // Capcana: "moloz" scoate RPCH45A1, care e jgheabul de lemn prin care se
    // arunca molozul, nu incarcarea sau transportul lui.
    expect(searchNorme("transport moloz")).toEqual([]);
    expect(searchNorme("incarcare moloz auto")).toEqual([]);
  });
});

describe("vocabularul nu strica interogarile care mergeau", () => {
  it("nu atinge cuvintele care contin, fara sa fie, un termen tradus", () => {
    // "sapa" e tradus, "sapatura" nu — altfel s-ar strica tot indicatorul Ts.
    expect(searchNorme("sapatura mecanica excavator").length).toBeGreaterThan(0);
    expect(
      searchNorme("sapatura mecanica excavator").every((n) => n.indicator === "Ts"),
    ).toBe(true);
  });

  it("nu inventeaza rezultate pentru lucrarile care chiar lipsesc", () => {
    expect(searchNorme("tamplarie pvc")).toEqual([]);
    expect(searchNorme("parchet laminat")).toEqual([]);
  });

  it("capcana cunoscuta: 'centrala termica' scoate norme de preparare beton", () => {
    // Cautarea trunchiata potriveste "centr" cu CENTRALIZATE si "termi" cu
    // TRAT.TERMIC, si iese CZ0107 — preparare de beton. Centralele termice nu
    // au norma nicaieri, deci raspunsul corect ar fi zero.
    //
    // Nu e reparabil din vocabular: tine de pasul trunchiat, care salveaza
    // multe alte interogari. Ramane scris aici ca sa se stie ca exista, si ca
    // sa se vada imediat daca cineva schimba pasul acela.
    const results = searchNorme("centrala termica");

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((n) => n.cod.startsWith("CZ01"))).toBe(true);
  });
});
