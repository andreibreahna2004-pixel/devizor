"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createInvoice, estimateLinesToInvoiceLines } from "@/lib/invoices/service";
import { toNumber } from "@/lib/money";
import { getProgressReport, saveProgressReport } from "@/lib/progress/service";
import { requireUser } from "@/lib/tenant";

export interface ProgressResult {
  ok: boolean;
  reportId?: string;
  invoiceId?: string;
  error?: string;
}

const saveSchema = z.object({
  estimateId: z.string().min(1),
  reportId: z.string().nullable().optional(),
  periodStart: z.string().min(4),
  periodEnd: z.string().min(4),
  notes: z.string().max(2000).nullable().optional(),
  lines: z
    .array(
      z.object({
        estimateLineId: z.string().min(1),
        quantity: z.number().nonnegative().finite(),
      }),
    )
    .min(1),
});

export async function saveProgress(payload: unknown): Promise<ProgressResult> {
  const parsed = saveSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Date invalide" };
  }

  const user = await requireUser();
  const data = parsed.data;

  const owned = await prisma.estimate.count({
    where: { id: data.estimateId, orgId: user.orgId },
  });
  if (owned === 0) return { ok: false, error: "Devizul nu a fost gasit" };

  const periodStart = new Date(data.periodStart);
  const periodEnd = new Date(data.periodEnd);
  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
    return { ok: false, error: "Perioada nu e valida" };
  }
  if (periodEnd < periodStart) {
    return { ok: false, error: "Sfarsitul perioadei e inaintea inceputului" };
  }

  const result = await saveProgressReport(user.orgId, {
    estimateId: data.estimateId,
    reportId: data.reportId ?? null,
    periodStart,
    periodEnd,
    notes: data.notes ?? null,
    lines: data.lines,
  });

  if (result.ok) {
    revalidatePath(`/devize/${data.estimateId}/situatii`);
    revalidatePath(`/devize/${data.estimateId}`);
  }

  return result;
}

const invoiceSchema = z.object({
  reportId: z.string().min(1),
  scope: z.enum(["TOT", "MATERIALE", "MANOPERA"]).default("TOT"),
});

/** Emite factura pentru o situatie de lucrari. */
export async function invoiceProgressReport(
  payload: unknown,
): Promise<ProgressResult> {
  const parsed = invoiceSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Date invalide" };

  const user = await requireUser();
  const scope = parsed.data.scope;
  const report = await getProgressReport(user.orgId, parsed.data.reportId);

  if (!report) return { ok: false, error: "Situatia nu a fost gasita" };
  if (report.invoices.length > 0) {
    return { ok: false, error: "Situatia a fost deja facturata" };
  }
  if (!report.estimate.clientId) {
    return { ok: false, error: "Devizul nu are beneficiar" };
  }
  if (scope !== "TOT" && report.estimate.mode !== "SEPARAT") {
    return {
      ok: false,
      error: "Devizul are un singur pret pe linie, deci situatia nu se poate imparti.",
    };
  }

  const vatRate = toNumber(report.estimate.vatRate);

  const lines = estimateLinesToInvoiceLines(
    report.lines.map((line) => ({
      code: line.estimateLine.code,
      name: line.estimateLine.name,
      unit: line.estimateLine.unit,
      quantity: line.quantity,
      materialUnitPrice: line.materialUnitPrice,
      laborUnitPrice: line.laborUnitPrice,
    })),
    scope,
    vatRate,
  );

  if (lines.length === 0) {
    return { ok: false, error: "Situatia nu are nimic de facturat pe aceasta parte" };
  }

  try {
    const invoice = await createInvoice(user.orgId, {
      clientId: report.estimate.clientId,
      projectId: report.estimate.projectId,
      estimateId: report.estimate.id,
      progressReportId: report.id,
      scope,
      notes: `Situatia de lucrari ${report.fullNumber}, conform devizului ${report.estimate.fullNumber}`,
      lines,
    });

    await prisma.progressReport.update({
      where: { id: report.id },
      data: { status: "FACTURATA" },
    });

    revalidatePath(`/devize/${report.estimate.id}/situatii`);
    revalidatePath("/facturi");
    return { ok: true, invoiceId: invoice.id, reportId: report.id };
  } catch (error) {
    console.error("Facturarea situatiei a esuat", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Facturarea a esuat",
    };
  }
}

const deleteSchema = z.object({ reportId: z.string().min(1) });

export async function deleteProgressReport(
  payload: unknown,
): Promise<ProgressResult> {
  const parsed = deleteSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Date invalide" };

  const user = await requireUser();

  // O situatie facturata nu se sterge — factura ar ramane fara acoperire.
  const deleted = await prisma.progressReport.deleteMany({
    where: { id: parsed.data.reportId, orgId: user.orgId, status: "CIORNA" },
  });

  if (deleted.count === 0) {
    return {
      ok: false,
      error: "Situatia nu a fost gasita sau a fost deja aprobata/facturata",
    };
  }

  return { ok: true };
}
