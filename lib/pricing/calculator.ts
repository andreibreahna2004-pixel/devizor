import { round2, round4 } from "@/lib/money";

/**
 * Motorul de calcul al devizului. Sursa unica de adevar: interfata, PDF-ul,
 * XML-ul de e-Factura si generatorul AI trec toate pe aici.
 *
 * Pretul de pe linie e pretul final catre client. Nu exista catalog din care
 * sa se recompuna si nu exista coeficienti care sa se adauge peste el in
 * recapitulatie — ce scrie omul pe linie e ce plateste beneficiarul.
 *
 * Valoarea unei linii e suma componentelor rotunjite separat, nu
 * `cantitate x pret_total`. Asa recapitulatia se inchide pe coloane, iar
 * facturile emise separat pe materiale si pe manopera aduna exact cat devizul.
 */

// ---------------------------------------------------------------------------
// Linia de deviz
// ---------------------------------------------------------------------------

export interface EstimateLineInput {
  quantity: number;
  /** In modul COMBINAT poarta pretul intreg al lucrarii. */
  materialUnitPrice: number;
  laborUnitPrice: number;
}

export interface EstimateLineTotals {
  unitPrice: number;
  material: number;
  labor: number;
  total: number;
}

export function computeEstimateLine(line: EstimateLineInput): EstimateLineTotals {
  const material = round2(line.quantity * line.materialUnitPrice);
  const labor = round2(line.quantity * line.laborUnitPrice);

  return {
    unitPrice: round4(line.materialUnitPrice + line.laborUnitPrice),
    material,
    labor,
    // Suma componentelor rotunjite, nu `qty * unitPrice`: asa raman coloanele
    // recapitulatiei consistente cu totalul.
    total: round2(material + labor),
  };
}

// ---------------------------------------------------------------------------
// Recapitulatia devizului
// ---------------------------------------------------------------------------

export interface EstimateTotals {
  totalMaterial: number;
  totalLabor: number;
  /** Total fara TVA — suma liniilor, fara nimic adaugat peste. */
  netTotal: number;
  vatAmount: number;
  grandTotal: number;
}

export function computeEstimateTotals(
  lines: EstimateLineInput[],
  vatRate: number,
): EstimateTotals {
  let totalMaterial = 0;
  let totalLabor = 0;

  for (const line of lines) {
    const t = computeEstimateLine(line);
    totalMaterial += t.material;
    totalLabor += t.labor;
  }

  totalMaterial = round2(totalMaterial);
  totalLabor = round2(totalLabor);

  const netTotal = round2(totalMaterial + totalLabor);
  const vatAmount = round2((netTotal * vatRate) / 100);

  return {
    totalMaterial,
    totalLabor,
    netTotal,
    vatAmount,
    grandTotal: round2(netTotal + vatAmount),
  };
}

// ---------------------------------------------------------------------------
// Facturi
// ---------------------------------------------------------------------------

export interface InvoiceLineInput {
  quantity: number;
  unitPrice: number;
  vatRate: number;
}

export interface InvoiceLineTotals {
  netAmount: number;
  vatAmount: number;
  total: number;
}

export function computeInvoiceLine(line: InvoiceLineInput): InvoiceLineTotals {
  const netAmount = round2(line.quantity * line.unitPrice);
  const vatAmount = round2((netAmount * line.vatRate) / 100);
  return { netAmount, vatAmount, total: round2(netAmount + vatAmount) };
}

export interface VatGroup {
  vatRate: number;
  taxableAmount: number;
  vatAmount: number;
}

export interface InvoiceTotals {
  netTotal: number;
  vatAmount: number;
  grandTotal: number;
  /** Un grup pe fiecare cota de TVA — devine TaxSubtotal in e-Factura. */
  vatGroups: VatGroup[];
}

/**
 * Totalurile facturii.
 *
 * TVA-ul se calculeaza pe grupa de cota, din baza impozabila insumata, NU prin
 * adunarea TVA-ului de pe linii. Regula EN 16931 (BR-CO-17) cere ca TVA-ul
 * categoriei sa fie baza x cota; insumarea liniilor poate devia cu un ban si
 * factura ar fi respinsa de validatorul ANAF.
 */
export function computeInvoiceTotals(lines: InvoiceLineInput[]): InvoiceTotals {
  const byRate = new Map<number, number>();

  for (const line of lines) {
    const { netAmount } = computeInvoiceLine(line);
    byRate.set(line.vatRate, round2((byRate.get(line.vatRate) ?? 0) + netAmount));
  }

  const vatGroups: VatGroup[] = [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([vatRate, taxableAmount]) => ({
      vatRate,
      taxableAmount,
      vatAmount: round2((taxableAmount * vatRate) / 100),
    }));

  const netTotal = round2(vatGroups.reduce((s, g) => s + g.taxableAmount, 0));
  const vatAmount = round2(vatGroups.reduce((s, g) => s + g.vatAmount, 0));

  return { netTotal, vatAmount, grandTotal: round2(netTotal + vatAmount), vatGroups };
}
