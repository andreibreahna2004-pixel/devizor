/**
 * Emite o factura din devizul demo, apoi tipareste id-ul ei.
 *
 * Dintr-un deviz iese o singura factura, pe toata valoarea lui.
 *
 * Ruleaza cu conditia `react-server`, ca modulele marcate `server-only` sa se
 * incarce si in afara serverului Next:
 *   node --conditions=react-server --import tsx scripts/demo-factura.ts
 * sau, mai simplu: npm run demo:factura
 */
import { PrismaClient } from "@prisma/client";
import { createInvoice, estimateLinesToInvoiceLines } from "../lib/invoices/service";

const prisma = new PrismaClient();

async function main() {
  const estimate = await prisma.estimate.findFirstOrThrow({
    include: { lines: { orderBy: { sortOrder: "asc" } } },
    orderBy: { createdAt: "asc" },
  });

  if (!estimate.clientId) throw new Error("Devizul demo nu are beneficiar.");

  const existing = await prisma.invoice.findFirst({
    where: { estimateId: estimate.id },
  });
  if (existing) {
    console.log("INVOICE_ID=" + existing.id);
    return;
  }

  const invoice = await createInvoice(estimate.orgId, {
    clientId: estimate.clientId,
    projectId: estimate.projectId,
    estimateId: estimate.id,
    notes: `Conform devizului ${estimate.fullNumber} — ${estimate.title}`,
    lines: estimateLinesToInvoiceLines(estimate.lines, Number(estimate.vatRate)),
  });

  console.log("INVOICE_ID=" + invoice.id);
  console.log("NUMBER=" + invoice.fullNumber);
  console.log("NET=" + invoice.netTotal.toString());
  console.log("VAT=" + invoice.vatAmount.toString());
  console.log("TOTAL=" + invoice.grandTotal.toString());
}

main().finally(() => prisma.$disconnect());
