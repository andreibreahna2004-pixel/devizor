import { round2, toNumber } from "@/lib/money";

/**
 * Linia asa cum intra in factura: un singur pret unitar, fara defalcare.
 * Defalcarea ramane pe deviz — pe factura beneficiarul deconteaza lucrarea.
 */
export interface InvoiceLineDraft {
  code: string | null;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
}

/** Linia de deviz sau de situatie, cu Decimal-urile Prisma inca neconvertite. */
export interface PricedLine {
  code: string | null;
  name: string;
  unit: string;
  quantity: unknown;
  materialUnitPrice: unknown;
  laborUnitPrice: unknown;
  equipmentUnitPrice: unknown;
  transportUnitPrice: unknown;
}

/**
 * Transforma liniile unui deviz in linii de factura.
 *
 * Cele patru componente ale liniei se aduna intr-un singur pret unitar: pe
 * factura nu are ce cauta defalcarea, beneficiarul deconteaza lucrarea, nu
 * partile ei. Preturile de pe deviz sint deja finale catre client, deci nu se
 * aplica niciun coeficient peste ele — factura aduna exact cat devizul.
 *
 * Liniile fara niciun pret se sar: o linie ramasa de ofertat separat n-are ce
 * cauta pe o factura.
 *
 * Atentie la rotunjire: devizul aduna componentele rotunjite fiecare in parte,
 * factura inmulteste cantitatea cu un pret unitar deja rotunjit la doi bani (o
 * cere e-Factura, ca `cantitate x pret` sa dea exact valoarea liniei si in PDF
 * si in XML). Pe preturi cu multe zecimale si cantitati mari cele doua pot
 * diferi cu citiva bani — vezi testul din `lines.test.ts`. Devizul e oferta,
 * factura e actul: actul trebuie sa se verifice cu el insusi, deci diferenta se
 * accepta aici, nu se ascunde printr-un pret unitar cu patru zecimale care ar
 * face factura sa nu se mai inchida.
 */
export function estimateLinesToInvoiceLines(
  lines: PricedLine[],
  vatRate: number,
): InvoiceLineDraft[] {
  return lines
    .map((line) => ({
      code: line.code,
      name: line.name,
      unit: line.unit,
      quantity: toNumber(line.quantity as never),
      unitPrice: round2(
        toNumber(line.materialUnitPrice as never) +
          toNumber(line.laborUnitPrice as never) +
          toNumber(line.equipmentUnitPrice as never) +
          toNumber(line.transportUnitPrice as never),
      ),
      vatRate,
    }))
    .filter((line) => line.unitPrice > 0);
}
