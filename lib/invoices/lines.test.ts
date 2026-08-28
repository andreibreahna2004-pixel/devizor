import { describe, expect, it } from "vitest";
import { estimateLinesToInvoiceLines } from "./lines";
import { computeEstimateTotals, computeInvoiceTotals } from "@/lib/pricing/calculator";

/**
 * Trecerea de la deviz la factura.
 *
 * Cele patru componente ale liniei se aduna intr-un singur pret unitar:
 * beneficiarul deconteaza lucrarea, nu partile ei. Ce se verifica aici e ca
 * adunarea nu pierde bani si ca nu ajunge pe factura o linie fara pret.
 */

const lines = [
  {
    code: "CA01A1",
    name: "Turnare beton simplu in fundatii",
    unit: "mc",
    quantity: 12.5,
    materialUnitPrice: 420.5,
    laborUnitPrice: 85.25,
    equipmentUnitPrice: 30,
    transportUnitPrice: 18.75,
  },
  {
    code: null,
    name: "Demolare zidarie interioara",
    unit: "mp",
    quantity: 40,
    materialUnitPrice: 0,
    laborUnitPrice: 35,
    equipmentUnitPrice: 0,
    transportUnitPrice: 12,
  },
];

describe("estimateLinesToInvoiceLines", () => {
  it("aduna cele patru componente intr-un singur pret unitar", () => {
    const invoiceLines = estimateLinesToInvoiceLines(lines, 21);

    expect(invoiceLines).toHaveLength(2);
    expect(invoiceLines[0].unitPrice).toBe(554.5); // 420.5 + 85.25 + 30 + 18.75
    expect(invoiceLines[1].unitPrice).toBe(47); // 0 + 35 + 0 + 12
  });

  it("pastreaza codul, denumirea si unitatea neatinse", () => {
    const invoiceLines = estimateLinesToInvoiceLines(lines, 21);

    expect(invoiceLines[0].code).toBe("CA01A1");
    expect(invoiceLines[0].name).toBe("Turnare beton simplu in fundatii");
    expect(invoiceLines[0].unit).toBe("mc");
    expect(invoiceLines[0].vatRate).toBe(21);
  });

  it("sare liniile fara niciun pret", () => {
    const cuLinieGoala = [
      ...lines,
      {
        code: null,
        name: "Hidroizolatie terasa — de ofertat separat",
        unit: "mp",
        quantity: 90,
        materialUnitPrice: 0,
        laborUnitPrice: 0,
        equipmentUnitPrice: 0,
        transportUnitPrice: 0,
      },
    ];

    const invoiceLines = estimateLinesToInvoiceLines(cuLinieGoala, 21);

    expect(invoiceLines).toHaveLength(2);
    expect(invoiceLines.map((l) => l.name)).not.toContain(
      "Hidroizolatie terasa — de ofertat separat",
    );
  });

  it("factura aduna cat devizul cand componentele nu cad intre bani", () => {
    const rotunde = lines.map((l) => ({ ...l, laborUnitPrice: 85.2 }));

    const deviz = computeEstimateTotals(rotunde, 21);
    const factura = computeInvoiceTotals(estimateLinesToInvoiceLines(rotunde, 21));

    expect(factura.netTotal).toBe(deviz.netTotal);
    expect(factura.grandTotal).toBe(deviz.grandTotal);
  });

  it("diferenta fata de deviz vine din rotunjirea pretului unitar la doi bani", () => {
    // 12,5 x 85,25 = 1065,625, care se rotunjeste in sus pe deviz (1065,63).
    // Pe factura, cele patru componente se aduna intai in 554,50 si abia apoi se
    // inmultesc, deci jumatatea de ban nu mai apare. Diferenta e cunoscuta si
    // acceptata: factura trebuie sa se verifice cu ea insasi la validatorul ANAF.
    const deviz = computeEstimateTotals(lines, 21);
    const factura = computeInvoiceTotals(estimateLinesToInvoiceLines(lines, 21));

    expect(deviz.netTotal).toBe(8811.26);
    expect(factura.netTotal).toBe(8811.25);
  });
});
