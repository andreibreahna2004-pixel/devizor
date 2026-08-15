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
  scope: z.enum(["TOT", "MATERIALE", "MANOPERA"]).default("TOT"),
});

/**
 * Emite o factura pentru un deviz.
 *
 * Pentru devizele cu materialele si manopera separate, `scope` alege ce se
 * factureaza — se pot emite doua facturi, fiecare cu numarul ei.
 */
export async function createInvoiceFromEstimate(
  payload: unknown,
): Promise<InvoiceActionResult> {
  const parsed = fromEstimateSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Date invalide" };

  const user = await requireUser();
  const scope = parsed.data.scope;

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
  if (scope !== "TOT" && estimate.mode !== "SEPARAT") {
    return {
      ok: false,
      error:
        "Devizul are un singur pret pe linie. Treci-l pe materiale si manopera separat ca sa poti factura separat.",
    };
  }

  const lines = estimateLinesToInvoiceLines(
    estimate.lines,
    scope,
    toNumber(estimate.vatRate),
  );

  if (lines.length === 0) {
    return {
      ok: false,
      error:
        scope === "MATERIALE"
          ? "Nicio linie din deviz nu are cost de material."
          : "Nicio linie din deviz nu are cost de manopera.",
    };
  }

  const scopeNote =
    scope === "TOT" ? "" : ` — ${scope === "MATERIALE" ? "materiale" : "manopera"}`;

  try {
    const invoice = await createInvoice(user.orgId, {
      clientId: estimate.clientId,
      projectId: estimate.projectId,
      estimateId: estimate.id,
      scope,
      notes: `Conform devizului ${estimate.fullNumber} — ${estimate.title}${scopeNote}`,
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
