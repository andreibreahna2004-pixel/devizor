import "server-only";
import type { InvoiceScope, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { toNumber } from "@/lib/money";
import { toDecimal } from "@/lib/money-db";
import { allocateDocumentNumber } from "@/lib/numbering/series";
// Forma liniei de factura si conversia din deviz sunt pure si stau intr-un modul
// fara `server-only`, ca sa poata fi testate direct — vezi `lib/estimates/editable.ts`.
import {
  type InvoiceLineDraft,
  type PricedLine,
  estimateLinesToInvoiceLines,
} from "./lines";
import {
  type InvoiceLineInput,
  computeInvoiceLine,
  computeInvoiceTotals,
} from "@/lib/pricing/calculator";

/**
 * Emiterea si intretinerea facturilor.
 *
 * Regula care da tonul: la emitere, datele celor doua parti se ingheata in
 * factura (`supplierSnapshot` / `clientSnapshot`). Daca firma isi schimba
 * sediul sau beneficiarul isi schimba denumirea, facturile vechi trebuie sa
 * arate in continuare exact cum au fost emise.
 */

export interface PartySnapshot {
  name: string;
  cui: string | null;
  vatPayer: boolean;
  regCom: string | null;
  address: string | null;
  city: string | null;
  countyCode: string | null;
  postalCode: string | null;
  country: string;
  email: string | null;
  phone: string | null;
  iban: string | null;
  bank: string | null;
}

/** Termenul de plata implicit, in zile. */
const DEFAULT_PAYMENT_DAYS = 30;

export async function buildSupplierSnapshot(orgId: string): Promise<PartySnapshot> {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  return {
    name: org.name,
    cui: org.cui,
    vatPayer: org.vatPayer,
    regCom: org.regCom,
    address: org.address,
    city: org.city,
    countyCode: org.countyCode,
    postalCode: org.postalCode,
    country: org.country,
    email: org.email,
    phone: org.phone,
    iban: org.iban,
    bank: org.bank,
  };
}

export async function buildClientSnapshot(
  orgId: string,
  clientId: string,
): Promise<PartySnapshot> {
  const client = await prisma.client.findFirstOrThrow({
    where: { id: clientId, orgId },
  });
  return {
    name: client.name,
    cui: client.cui,
    vatPayer: client.vatPayer,
    regCom: client.regCom,
    address: client.address,
    city: client.city,
    countyCode: client.countyCode,
    postalCode: client.postalCode,
    country: client.country,
    email: client.email,
    phone: client.phone,
    iban: client.iban,
    bank: client.bank,
  };
}

export interface CreateInvoiceInput {
  clientId: string;
  projectId?: string | null;
  estimateId?: string | null;
  progressReportId?: string | null;
  /**
   * Doar pentru storno, care copiaza scope-ul facturii initiale. O emitere noua
   * il lasa gol si primeste TOT: devizul nu se mai imparte pe materiale si
   * manopera. Vezi `InvoiceScope` in schema.
   */
  scope?: InvoiceScope;
  issueDate?: Date;
  dueDate?: Date;
  supplyDate?: Date | null;
  notes?: string | null;
  lines: InvoiceLineDraft[];
}

export async function createInvoice(orgId: string, input: CreateInvoiceInput) {
  if (input.lines.length === 0) {
    throw new Error("Factura trebuie sa aiba cel putin o linie.");
  }

  const [supplier, client] = await Promise.all([
    buildSupplierSnapshot(orgId),
    buildClientSnapshot(orgId, input.clientId),
  ]);

  const totals = computeInvoiceTotals(input.lines);
  const issueDate = input.issueDate ?? new Date();
  const dueDate =
    input.dueDate ??
    new Date(issueDate.getTime() + DEFAULT_PAYMENT_DAYS * 24 * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    // Numarul se aloca in aceeasi tranzactie cu inserarea: daca inserarea
    // esueaza, rollback-ul da numarul inapoi si secventa ramane fara goluri.
    const allocated = await allocateDocumentNumber(tx, orgId, "FACTURA");

    return tx.invoice.create({
      data: {
        orgId,
        series: allocated.series,
        number: allocated.number,
        fullNumber: allocated.fullNumber,
        clientId: input.clientId,
        projectId: input.projectId ?? null,
        estimateId: input.estimateId ?? null,
        progressReportId: input.progressReportId ?? null,
        scope: input.scope ?? "TOT",
        status: "EMISA",
        issueDate,
        dueDate,
        supplyDate: input.supplyDate ?? null,
        supplierSnapshot: supplier as unknown as Prisma.InputJsonValue,
        clientSnapshot: client as unknown as Prisma.InputJsonValue,
        netTotal: toDecimal(totals.netTotal),
        vatAmount: toDecimal(totals.vatAmount),
        grandTotal: toDecimal(totals.grandTotal),
        notes: input.notes ?? null,
        lines: {
          create: input.lines.map((line, index) => {
            const lineTotals = computeInvoiceLine(line);
            return {
              code: line.code,
              name: line.name,
              unit: line.unit,
              quantity: toDecimal(line.quantity, 4),
              // Doua zecimale, ca "cantitate x pret unitar" sa dea exact
              // valoarea liniei si in PDF, si in XML-ul de e-Factura.
              unitPrice: toDecimal(line.unitPrice, 2),
              vatRate: toDecimal(line.vatRate, 2),
              netAmount: toDecimal(lineTotals.netAmount),
              vatAmount: toDecimal(lineTotals.vatAmount),
              total: toDecimal(lineTotals.total),
              sortOrder: index,
            };
          }),
        },
      },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
  });
}

export { type InvoiceLineDraft, type PricedLine, estimateLinesToInvoiceLines };

/** Factura completa, pentru pagina de detaliu, PDF si e-Factura. */
export async function getInvoiceForView(orgId: string, invoiceId: string) {
  return prisma.invoice.findFirst({
    where: { id: invoiceId, orgId },
    include: {
      client: true,
      project: true,
      estimate: { select: { id: true, fullNumber: true, title: true } },
      lines: { orderBy: { sortOrder: "asc" } },
      org: true,
      reversedBy: { select: { id: true, fullNumber: true } },
      reversalOf: { select: { id: true, fullNumber: true } },
    },
  });
}

export type InvoiceForView = NonNullable<
  Awaited<ReturnType<typeof getInvoiceForView>>
>;

/** Recalculeaza totalurile facturii din liniile ei. */
export async function recalculateInvoice(invoiceId: string) {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    select: {
      lines: { select: { quantity: true, unitPrice: true, vatRate: true } },
    },
  });

  const lines: InvoiceLineInput[] = invoice.lines.map((line) => ({
    quantity: toNumber(line.quantity),
    unitPrice: toNumber(line.unitPrice),
    vatRate: toNumber(line.vatRate),
  }));

  const totals = computeInvoiceTotals(lines);

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      netTotal: toDecimal(totals.netTotal),
      vatAmount: toDecimal(totals.vatAmount),
      grandTotal: toDecimal(totals.grandTotal),
    },
  });

  return totals;
}

/**
 * Emite factura de storno care anuleaza o factura existenta.
 *
 * O factura emisa nu se sterge si nu se modifica; se anuleaza printr-o factura
 * noua cu valori negative, care isi primeste propriul numar din serie.
 */
export async function createReversal(orgId: string, invoiceId: string) {
  const original = await prisma.invoice.findFirstOrThrow({
    where: { id: invoiceId, orgId },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });

  if (original.status === "STORNATA") {
    throw new Error("Factura este deja stornata.");
  }
  if (original.status === "CIORNA") {
    throw new Error("O ciorna nu se storneaza; sterge-o direct.");
  }

  const lines: InvoiceLineDraft[] = original.lines.map((line) => ({
    code: line.code,
    name: line.name,
    unit: line.unit,
    quantity: -toNumber(line.quantity),
    unitPrice: toNumber(line.unitPrice),
    vatRate: toNumber(line.vatRate),
  }));

  const reversal = await createInvoice(orgId, {
    clientId: original.clientId,
    projectId: original.projectId,
    estimateId: original.estimateId,
    scope: original.scope,
    notes: `Storno la factura ${original.fullNumber}`,
    lines,
  });

  await prisma.$transaction([
    prisma.invoice.update({
      where: { id: reversal.id },
      data: { reversalOfId: original.id },
    }),
    prisma.invoice.update({
      where: { id: original.id },
      data: { status: "STORNATA" },
    }),
  ]);

  return reversal;
}
