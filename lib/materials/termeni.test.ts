import { describe, expect, it } from "vitest";
import { RETETE } from "@/lib/consum";
import { TERMENI, getTermen, termeniLaMagazin, termeniPentruReteta } from "./termeni";

/**
 * Test de integritate, in acelasi spirit ca `lib/consum/index.test.ts`, care
 * refuza un material fara sursa.
 *
 * Aici se apara puntea deviz -> reteta -> termen. Un `retete` care pomeneste o
 * reteta inexistenta rupe puntea fara sa arunce nimic: pagina ar arata pur si
 * simplu mai puține materiale, si nimeni n-ar afla de ce.
 */
describe("integritatea termenilor de magazin", () => {
  const IDURI = new Set(RETETE.map((r) => r.id));

  it("are termeni", () => {
    expect(TERMENI.length).toBeGreaterThan(50);
    expect(termeniLaMagazin().length).toBeGreaterThan(50);
  });

  it("fiecare termen are termen, unitate si material", () => {
    for (const t of TERMENI) {
      expect(t.termen.trim(), `termen gol la ${t.material}`).not.toBe("");
      expect(t.um.trim(), `unitate goala la ${t.termen}`).not.toBe("");
      expect(t.material.trim(), `material gol la ${t.termen}`).not.toBe("");
    }
  });

  it("fiecare termen serveste retete care exista", () => {
    for (const t of TERMENI) {
      expect(t.retete.length, `${t.termen} nu serveste nicio reteta`).toBeGreaterThan(0);
      for (const id of t.retete) {
        expect(IDURI.has(id), `${t.termen} pomeneste reteta inexistenta "${id}"`).toBe(true);
      }
    }
  });

  it("nu exista doi termeni pe aceeasi pereche termen-unitate", () => {
    // Ar face doua rinduri pe acelasi ecran si doua cereri pentru acelasi lucru.
    const vazute = new Set<string>();
    for (const t of TERMENI) {
      const cheie = `${t.termen}|${t.um}`;
      expect(vazute.has(cheie), `termen dublu: ${cheie}`).toBe(false);
      vazute.add(cheie);
    }
  });

  it("ce nu se cere la magazin isi spune motivul", () => {
    // Un material lasat afara fara motiv se citeste ca o scapare.
    for (const t of TERMENI.filter((x) => !x.laMagazin)) {
      expect(t.motiv?.trim(), `${t.termen} n-are motiv`).toBeTruthy();
    }
  });

  it("termenii ceruti la magazin n-au motiv de excludere", () => {
    for (const t of termeniLaMagazin()) {
      expect(t.motiv, `${t.termen} e cerut dar are motiv de excludere`).toBeUndefined();
    }
  });

  it("termenul e scris cu litere mici, ca sa mearga in cautare", () => {
    for (const t of TERMENI) {
      expect(t.termen, `${t.termen} are majuscule`).toBe(t.termen.toLowerCase());
    }
  });
});

describe("termeniPentruReteta", () => {
  it("gaseste termenii unei retete reale", () => {
    const termeni = termeniPentruReteta("gresie-pardoseala");
    expect(termeni.length).toBeGreaterThan(0);
    expect(termeni.map((t) => t.termen)).toContain("adeziv gresie");
  });

  it("da lista goala pe o reteta fara termeni", () => {
    expect(termeniPentruReteta("nu-exista")).toEqual([]);
  });
});

describe("getTermen", () => {
  it("gaseste pe pereche termen-unitate", () => {
    const t = getTermen("parchet laminat", "mp");
    expect(t?.material).toBe("Parchet laminat");
  });

  it("da null cand unitatea nu se potriveste", () => {
    expect(getTermen("parchet laminat", "buc")).toBeNull();
  });
});
