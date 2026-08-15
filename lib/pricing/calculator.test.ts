import { describe, expect, it } from "vitest";
import { amountInWords, round, round2 } from "@/lib/money";
import {
  computeEstimateLine,
  computeEstimateTotals,
  computeInvoiceLine,
  computeInvoiceTotals,
} from "./calculator";

describe("round", () => {
  it("rotunjeste half-up chiar si unde virgula mobila strica rezultatul", () => {
    // Capcana clasica: 1.005 e stocat ca 1.00499999999999989.
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(2.675, 2)).toBe(2.68);
    expect(round(1.0049, 2)).toBe(1.0);
  });

  it("trateaza negativele simetric", () => {
    expect(round(-1.005, 2)).toBe(-1.01);
    expect(round(-2.344, 2)).toBe(-2.34);
  });

  it("intoarce 0 pentru valori nefinite", () => {
    expect(round(Number.NaN)).toBe(0);
    expect(round(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("rotunjeste la 4 zecimale pentru preturi unitare", () => {
    expect(round(12.34565, 4)).toBe(12.3457);
  });
});

describe("computeEstimateLine", () => {
  it("calculeaza valoarea liniei din cele doua preturi scrise de om", () => {
    const line = computeEstimateLine({
      quantity: 110.8,
      materialUnitPrice: 287.4,
      laborUnitPrice: 140.5,
    });

    expect(line.material).toBe(31843.92);
    expect(line.labor).toBe(15567.4);
    expect(line.total).toBe(47411.32);
    expect(line.unitPrice).toBe(427.9);
  });

  it("in modul combinat pretul intreg sta pe material", () => {
    const line = computeEstimateLine({
      quantity: 48,
      materialUnitPrice: 95,
      laborUnitPrice: 0,
    });

    expect(line.labor).toBe(0);
    expect(line.unitPrice).toBe(95);
    expect(line.total).toBe(4560);
  });

  it("pastreaza totalul egal cu suma componentelor si la cantitati urate", () => {
    const line = computeEstimateLine({
      quantity: 7.333,
      materialUnitPrice: 13.337,
      laborUnitPrice: 9.111,
    });

    expect(line.total).toBe(round2(line.material + line.labor));
  });
});

describe("computeEstimateTotals", () => {
  const lines = [
    { quantity: 100, materialUnitPrice: 50, laborUnitPrice: 30 },
    { quantity: 20, materialUnitPrice: 200, laborUnitPrice: 100 },
  ];

  it("aduna liniile fara sa adauge nimic peste ele", () => {
    const t = computeEstimateTotals(lines, 21);

    expect(t.totalMaterial).toBe(9000); // 5000 + 4000
    expect(t.totalLabor).toBe(5000); // 3000 + 2000
    expect(t.netTotal).toBe(14000);
    expect(t.vatAmount).toBe(2940); // 14000 x 21%
    expect(t.grandTotal).toBe(16940);
  });

  it("recapitulatia se inchide: totalul = materiale + manopera", () => {
    const t = computeEstimateTotals(lines, 11);

    expect(t.netTotal).toBe(round2(t.totalMaterial + t.totalLabor));
    expect(t.grandTotal).toBe(round2(t.netTotal + t.vatAmount));
  });

  it("suma facturii pe materiale si a celei pe manopera da exact devizul", () => {
    const t = computeEstimateTotals(lines, 21);

    const materialInvoice = computeInvoiceTotals(
      lines.map((l) => ({
        quantity: l.quantity,
        unitPrice: l.materialUnitPrice,
        vatRate: 21,
      })),
    );
    const laborInvoice = computeInvoiceTotals(
      lines.map((l) => ({
        quantity: l.quantity,
        unitPrice: l.laborUnitPrice,
        vatRate: 21,
      })),
    );

    expect(round2(materialInvoice.netTotal + laborInvoice.netTotal)).toBe(
      t.netTotal,
    );
  });

  it("intoarce zerouri pentru un deviz gol", () => {
    const t = computeEstimateTotals([], 21);
    expect(t.grandTotal).toBe(0);
    expect(t.netTotal).toBe(0);
  });
});

describe("computeInvoiceLine", () => {
  it("calculeaza net, TVA si total pe linie", () => {
    const line = computeInvoiceLine({
      quantity: 12.5,
      unitPrice: 340.75,
      vatRate: 21,
    });
    expect(line.netAmount).toBe(4259.38); // 4259.375 -> half-up
    expect(line.vatAmount).toBe(894.47);
    expect(line.total).toBe(5153.85);
  });
});

describe("computeInvoiceTotals", () => {
  it("grupeaza pe cota si calculeaza TVA din baza insumata", () => {
    const totals = computeInvoiceTotals([
      { quantity: 1, unitPrice: 1000, vatRate: 21 },
      { quantity: 2, unitPrice: 500, vatRate: 21 },
      { quantity: 1, unitPrice: 300, vatRate: 11 },
    ]);

    expect(totals.vatGroups).toEqual([
      { vatRate: 11, taxableAmount: 300, vatAmount: 33 },
      { vatRate: 21, taxableAmount: 2000, vatAmount: 420 },
    ]);
    expect(totals.netTotal).toBe(2300);
    expect(totals.vatAmount).toBe(453);
    expect(totals.grandTotal).toBe(2753);
  });

  it("evita deviatia de un ban fata de insumarea TVA-ului pe linii", () => {
    // Fiecare linie da 0.105 TVA -> rotunjit pe linie 0.11, x4 = 0.44.
    // Corect (EN 16931 BR-CO-17): baza 4 x 0.50 = 2.00, TVA = 2.00 x 21% = 0.42.
    const lines = Array.from({ length: 4 }, () => ({
      quantity: 1,
      unitPrice: 0.5,
      vatRate: 21,
    }));

    const totals = computeInvoiceTotals(lines);
    const sumOfLineVat = round2(
      lines.reduce((s, l) => s + computeInvoiceLine(l).vatAmount, 0),
    );

    expect(totals.vatAmount).toBe(0.42);
    expect(sumOfLineVat).toBe(0.44);
    expect(totals.vatAmount).not.toBe(sumOfLineVat);
  });

  it("factura goala nu produce grupe de TVA", () => {
    const totals = computeInvoiceTotals([]);
    expect(totals.vatGroups).toEqual([]);
    expect(totals.grandTotal).toBe(0);
  });
});

describe("amountInWords", () => {
  it("scrie suma in litere pentru factura", () => {
    expect(amountInWords(1234.5)).toBe(
      "una mie doua sute treizeci si patru lei si 50 bani",
    );
    expect(amountInWords(21)).toBe("douazeci si unu lei si 00 bani");
    expect(amountInWords(0)).toBe("zero lei si 00 bani");
    expect(amountInWords(100)).toBe("o suta lei si 00 bani");
  });
});
