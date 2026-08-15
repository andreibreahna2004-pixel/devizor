/**
 * Emite o factura din devizul demo, apoi tipareste id-ul ei.
 *
 * Accepta un argument cu ce se factureaza: `materiale`, `manopera` sau nimic
 * pentru tot devizul. Devizul demo e in modul SEPARAT, deci se pot emite si
 * cele doua facturi, una dupa alta.
 *
 * Ruleaza cu conditia `react-server`, ca modulele marcate `server-only` sa se
 * incarce si in afara serverului Next:
 *   node --conditions=react-server --import tsx scripts/demo-factura.ts
 * sau, mai simplu: npm run demo:factura
 */
import { PrismaClient } from "@prisma/client";
import { createInvoice, estimateLinesToInvoiceLines } from "../lib/invoices/service";

const prisma = new PrismaClient();

const SCOPES = { materiale: "MATERIALE", manopera: "MANOPERA" } as const;

async function main() {
  const argument = (process.argv[2] ?? "").toLowerCase();
  const scope = SCOPES[argument as keyof typeof SCOPES] ?? "TOT";

  const estimate = await prisma.estimate.findFirstOrThrow({
    include: { lines: { orderBy: { sortOrder: "asc" } } },
    orderBy: { createdAt: "asc" },
  });

  if (!estimate.clientId) throw new Error("Devizul demo nu are beneficiar.");

  const existing = await prisma.invoice.findFirst({
    where: { estimateId: estimate.id, scope },
  });
  if (existing) {
    console.log("INVOICE_ID=" + existing.id);
    return;
  }

  const invoice = await createInvoice(estimate.orgId, {
    clientId: estimate.clientId,
    projectId: estimate.projectId,
    estimateId: estimate.id,
    scope,
    notes: `Conform devizului ${estimate.fullNumber} — ${estimate.title}`,
    lines: estimateLinesToInvoiceLines(
      estimate.lines,
      scope,
      Number(estimate.vatRate),
    ),
  });

  console.log("INVOICE_ID=" + invoice.id);
  console.log("NUMBER=" + invoice.fullNumber);
  console.log("NET=" + invoice.netTotal.toString());
  console.log("VAT=" + invoice.vatAmount.toString());
  console.log("TOTAL=" + invoice.grandTotal.toString());
}

main().finally(() => prisma.$disconnect());
