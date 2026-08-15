import { describe, expect, it } from "vitest";
import { isEditable, lockReason } from "./editable";

/**
 * Cind se inchide un deviz pentru editare.
 *
 * Regula s-a mutat de pe stare pe ce a iesit din deviz, si e usor de intors din
 * greseala inapoi la "doar ciorna" — de aceea are test. Sint functii pure, fara
 * baza de date: se testeaza direct.
 */

const deviz = (over: Partial<Parameters<typeof isEditable>[0]> = {}) => ({
  status: "CIORNA",
  invoiceCount: 0,
  progressCount: 0,
  ...over,
});

describe("isEditable", () => {
  it("lasa ciorna deschisa", () => {
    expect(isEditable(deviz())).toBe(true);
  });

  it("lasa deschis un deviz trimis clientului", () => {
    // Cazul pentru care exista schimbarea: clientul cere modificari la oferta,
    // iar omul nu trebuie sa faca un deviz nou pentru fiecare virgula.
    expect(isEditable(deviz({ status: "TRIMIS" }))).toBe(true);
  });

  it("lasa deschis un deviz acceptat, cit timp n-a iesit nimic din el", () => {
    expect(isEditable(deviz({ status: "ACCEPTAT" }))).toBe(true);
  });

  it("lasa deschis un deviz respins, ca sa poata fi refacut", () => {
    expect(isEditable(deviz({ status: "RESPINS" }))).toBe(true);
  });

  it("inchide devizul cu factura emisa", () => {
    expect(isEditable(deviz({ status: "ACCEPTAT", invoiceCount: 1 }))).toBe(false);
  });

  it("inchide devizul cu situatii de lucrari", () => {
    // `ProgressLine` cade in cascada la stergerea liniei de deviz: o situatie
    // semnata si-ar pierde cantitatea executata fara ca nimeni s-o ceara.
    expect(isEditable(deviz({ status: "ACCEPTAT", progressCount: 1 }))).toBe(false);
  });

  it("inchide devizul anulat, chiar daca n-a iesit nimic din el", () => {
    expect(isEditable(deviz({ status: "ANULAT" }))).toBe(false);
  });
});

describe("lockReason", () => {
  const cu = (status: string, invoices: number, progressReports: number) => ({
    status,
    _count: { invoices, progressReports },
  });

  it("spune de factura, ca omul sa stie ca trebuie stornata", () => {
    expect(lockReason(cu("ACCEPTAT", 1, 0))).toContain("factura");
  });

  it("spune de situatii cind nu exista factura", () => {
    expect(lockReason(cu("ACCEPTAT", 0, 2))).toContain("situatii");
  });

  it("anularea are prioritate in explicatie", () => {
    expect(lockReason(cu("ANULAT", 1, 1))).toContain("anulat");
  });

  it("factura are prioritate fata de situatii", () => {
    // Situatiile duc la factura; daca exista amindoua, factura e motivul care
    // spune omului ce are de facut.
    expect(lockReason(cu("ACCEPTAT", 1, 3))).toContain("factura");
  });
});
