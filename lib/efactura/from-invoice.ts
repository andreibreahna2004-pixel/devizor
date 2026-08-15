import "server-only";
import type { UblInvoice, UblParty } from "./ubl";
import type { InvoiceForView, PartySnapshot } from "@/lib/invoices/service";
import { toNumber } from "@/lib/money";

/**
 * Puntea dintre factura din baza de date si generatorul UBL.
 *
 * Partile se citesc din snapshot-urile inghetate la emitere, nu din tabelele
 * curente: XML-ul trebuie sa descrie factura asa cum a fost emisa.
 */

function toParty(snapshot: PartySnapshot): UblParty {
  return {
    name: snapshot.name,
    cui: snapshot.cui,
    vatPayer: snapshot.vatPayer,
    regCom: snapshot.regCom,
    address: snapshot.address,
    city: snapshot.city,
    countyCode: snapshot.countyCode,
    postalCode: snapshot.postalCode,
    country: snapshot.country || "RO",
    email: snapshot.email,
    phone: snapshot.phone,
    iban: snapshot.iban,
    bank: snapshot.bank,
  };
}

export function invoiceToUbl(invoice: InvoiceForView): UblInvoice {
  return {
    fullNumber: invoice.fullNumber,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    supplyDate: invoice.supplyDate,
    currency: invoice.currency,
    supplier: toParty(invoice.supplierSnapshot as unknown as PartySnapshot),
    customer: toParty(invoice.clientSnapshot as unknown as PartySnapshot),
    notes: invoice.notes,
    reversalOf: invoice.reversalOf?.fullNumber ?? null,
    lines: invoice.lines.map((line) => ({
      code: line.code,
      name: line.name,
      unit: line.unit,
      quantity: toNumber(line.quantity),
      unitPrice: toNumber(line.unitPrice),
      vatRate: toNumber(line.vatRate),
    })),
  };
}
