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
  it("calculeaza valoarea liniei din cele patru preturi scrise de om", () => {
    const line = computeEstimateLine({
      quantity: 110.8,
      materialUnitPrice: 287.4,
      laborUnitPrice: 140.5,
      equipmentUnitPrice: 12.3,
      transportUnitPrice: 8.75,
    });

    expect(line.material).toBe(31843.92);
    expect(line.labor).toBe(15567.4);
    expect(line.equipment).toBe(1362.84);
    expect(line.transport).toBe(969.5);
    expect(line.total).toBe(49743.66);
    expect(line.unitPrice).toBe(448.95);
  });

  it("lucrarea fara utilaj si fara transport are doar material si manopera", () => {
    const line = computeEstimateLine({
      quantity: 48,
      materialUnitPrice: 95,
      laborUnitPrice: 40,
      equipmentUnitPrice: 0,
      transportUnitPrice: 0,
    });

    expect(line.equipment).toBe(0);
    expect(line.transport).toBe(0);
    expect(line.unitPrice).toBe(135);
    expect(line.total).toBe(6480);
  });

  it("pastreaza totalul egal cu suma componentelor si la cantitati urate", () => {
    const line = computeEstimateLine({
      quantity: 7.333,
      materialUnitPrice: 13.337,
      laborUnitPrice: 9.111,
      equipmentUnitPrice: 2.555,
      transportUnitPrice: 1.777,
    });

    expect(line.total).toBe(
      round2(line.material + line.labor + line.equipment + line.transport),
    );
  });
});

describe("computeEstimateTotals", () => {
  const lines = [
    {
      quantity: 100,
      materialUnitPrice: 50,
      laborUnitPrice: 30,
      equipmentUnitPrice: 5,
      transportUnitPrice: 2,
    },
    {
      quantity: 20,
      materialUnitPrice: 200,
      laborUnitPrice: 100,
      equipmentUnitPrice: 15,
      transportUnitPrice: 10,
    },
  ];

  it("aduna liniile fara sa adauge nimic peste ele", () => {
    const t = computeEstimateTotals(lines, 21);

    expect(t.totalMaterial).toBe(9000); // 5000 + 4000
    expect(t.totalLabor).toBe(5000); // 3000 + 2000
    expect(t.totalEquipment).toBe(800); // 500 + 300
    expect(t.totalTransport).toBe(400); // 200 + 200
    expect(t.netTotal).toBe(15200);
    expect(t.vatAmount).toBe(3192); // 15200 x 21%
    expect(t.grandTotal).toBe(18392);
  });

  it("recapitulatia se inchide pe cele patru coloane, si la cifre urate", () => {
    const urate = [
      {
        quantity: 7.333,
        materialUnitPrice: 13.337,
        laborUnitPrice: 9.111,
        equipmentUnitPrice: 2.555,
        transportUnitPrice: 1.777,
      },
      {
        quantity: 0.125,
        materialUnitPrice: 1234.5678,
        laborUnitPrice: 0.005,
        equipmentUnitPrice: 99.995,
        transportUnitPrice: 0,
      },
    ];

    const t = computeEstimateTotals(urate, 11);

    expect(t.netTotal).toBe(
      round2(
        t.totalMaterial + t.totalLabor + t.totalEquipment + t.totalTransport,
      ),
    );
    expect(t.grandTotal).toBe(round2(t.netTotal + t.vatAmount));
  });

  it("factura pe tot devizul aduna cat devizul", () => {
    const t = computeEstimateTotals(lines, 21);

    const invoice = computeInvoiceTotals(
      lines.map((l) => ({
        quantity: l.quantity,
        unitPrice: round2(
          l.materialUnitPrice +
            l.laborUnitPrice +
            l.equipmentUnitPrice +
            l.transportUnitPrice,
        ),
        vatRate: 21,
      })),
    );

    expect(invoice.netTotal).toBe(t.netTotal);
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
