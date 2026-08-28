"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  createInvoice,
  createReversal,
  estimateLinesToInvoiceLines,
} from "@/lib/invoices/service";
import { toNumber } from "@/lib/money";
import { requireUser } from "@/lib/tenant";

export interface InvoiceActionResult {
  ok: boolean;
  invoiceId?: string;
  error?: string;
}

const fromEstimateSchema = z.object({
  estimateId: z.string().min(1),
});

/**
 * Emite o factura pentru un deviz.
 *
 * Dintr-un deviz iese o singura factura, pe toata valoarea lui: cele patru
 * componente ale liniei se aduna intr-un pret unitar.
 */
export async function createInvoiceFromEstimate(
  payload: unknown,
): Promise<InvoiceActionResult> {
  const parsed = fromEstimateSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Date invalide" };

  const user = await requireUser();

  const estimate = await prisma.estimate.findFirst({
    where: { id: parsed.data.estimateId, orgId: user.orgId },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });

  if (!estimate) return { ok: false, error: "Devizul nu a fost gasit" };
  if (!estimate.clientId) {
    return {
      ok: false,
      error: "Devizul nu are beneficiar. Alege unul inainte de a factura.",
    };
  }
  if (estimate.lines.length === 0) {
    return { ok: false, error: "Devizul nu are linii" };
  }
  const lines = estimateLinesToInvoiceLines(
    estimate.lines,
    toNumber(estimate.vatRate),
  );

  if (lines.length === 0) {
    return { ok: false, error: "Nicio linie din deviz nu are pret." };
  }

  try {
    const invoice = await createInvoice(user.orgId, {
      clientId: estimate.clientId,
      projectId: estimate.projectId,
      estimateId: estimate.id,
      notes: `Conform devizului ${estimate.fullNumber} — ${estimate.title}`,
      lines,
    });

    await prisma.estimate.update({
      where: { id: estimate.id },
      data: { status: "ACCEPTAT" },
    });

    revalidatePath("/facturi");
    revalidatePath(`/devize/${estimate.id}`);
    return { ok: true, invoiceId: invoice.id };
  } catch (error) {
    console.error("Emiterea facturii a esuat", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Emiterea facturii a esuat",
    };
  }
}

const statusSchema = z.object({
  invoiceId: z.string().min(1),
  status: z.enum(["EMISA", "TRIMISA", "PLATITA", "ANULATA"]),
});

export async function setInvoiceStatus(
  payload: unknown,
): Promise<InvoiceActionResult> {
  const parsed = statusSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Stare invalida" };

  const user = await requireUser();

  // O factura stornata si-a incheiat drumul; nu mai schimba stare.
  const updated = await prisma.invoice.updateMany({
    where: {
      id: parsed.data.invoiceId,
      orgId: user.orgId,
      status: { notIn: ["STORNATA"] },
    },
    data: { status: parsed.data.status },
  });

  if (updated.count === 0) {
    return { ok: false, error: "Factura nu a fost gasita sau este stornata" };
  }

  revalidatePath(`/facturi/${parsed.data.invoiceId}`);
  revalidatePath("/facturi");
  return { ok: true, invoiceId: parsed.data.invoiceId };
}

const reversalSchema = z.object({ invoiceId: z.string().min(1) });

export async function reverseInvoice(payload: unknown): Promise<InvoiceActionResult> {
  const parsed = reversalSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Date invalide" };

  const user = await requireUser();

  try {
    const reversal = await createReversal(user.orgId, parsed.data.invoiceId);
    revalidatePath("/facturi");
    revalidatePath(`/facturi/${parsed.data.invoiceId}`);
    return { ok: true, invoiceId: reversal.id };
  } catch (error) {
    console.error("Stornarea a esuat", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Stornarea a esuat",
    };
  }
}
