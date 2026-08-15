"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isEditable, lockReason, recalculateEstimate } from "@/lib/estimates/service";
import { toDecimal } from "@/lib/money-db";
import { type Norma, getNorma, searchNorme } from "@/lib/norme";
import { computeEstimateLine } from "@/lib/pricing/calculator";
import { requireUser } from "@/lib/tenant";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Devizul cerut, verificat ca apartine firmei din sesiune si ca e editabil. */
async function loadEditable(estimateId: string) {
  const user = await requireUser();
  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, orgId: user.orgId },
    select: {
      id: true,
      status: true,
      _count: { select: { invoices: true, progressReports: true } },
    },
  });

  if (!estimate) return { error: "Devizul nu a fost gasit" as const };
  if (
    !isEditable({
      status: estimate.status,
      invoiceCount: estimate._count.invoices,
      progressCount: estimate._count.progressReports,
    })
  ) {
    return { error: lockReason(estimate) };
  }
  return { estimate, orgId: user.orgId };
}

const lineUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(300),
  unit: z.string().min(1).max(16),
  code: z.string().max(40).nullable(),
  quantity: z.number().nonnegative().finite(),
  materialUnitPrice: z.number().nonnegative().finite(),
  laborUnitPrice: z.number().nonnegative().finite(),
});

const saveLinesSchema = z.object({
  estimateId: z.string().min(1),
  lines: z.array(lineUpdateSchema),
});

/** Salveaza modificarile facute in tabelul de linii si recalculeaza totalurile. */
export async function saveEstimateLines(payload: unknown): Promise<ActionResult> {
  const parsed = saveLinesSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Date invalide" };

  const guard = await loadEditable(parsed.data.estimateId);
  if ("error" in guard) return { ok: false, error: guard.error };

  // Verificam ca toate liniile apartin acestui deviz inainte de a scrie ceva.
  const owned = await prisma.estimateLine.findMany({
    where: {
      id: { in: parsed.data.lines.map((l) => l.id) },
      estimateId: parsed.data.estimateId,
    },
    select: { id: true },
  });
  if (owned.length !== parsed.data.lines.length) {
    return { ok: false, error: "Unele linii nu apartin acestui deviz" };
  }

  await prisma.$transaction(
    parsed.data.lines.map((line) => {
      const totals = computeEstimateLine(line);
      // Codul vine din browser — la fel ca la adaugarea manuala, il pastram doar
      // daca exista in indicator. Un cod oficial inventat e citit de beneficiar
      // ca un angajament asupra a ce se executa.
      const norma = line.code ? getNorma(line.code) : null;

      return prisma.estimateLine.update({
        where: { id: line.id },
        data: {
          name: line.name,
          unit: line.unit,
          code: norma?.cod ?? null,
          quantity: toDecimal(line.quantity, 4),
          materialUnitPrice: toDecimal(line.materialUnitPrice, 4),
          laborUnitPrice: toDecimal(line.laborUnitPrice, 4),
          unitPrice: toDecimal(totals.unitPrice, 4),
          total: toDecimal(totals.total, 2),
          // O linie atinsa de om nu mai e o propunere neverificata.
          reviewed: true,
        },
      });
    }),
  );

  await recalculateEstimate(parsed.data.estimateId);
  revalidatePath(`/devize/${parsed.data.estimateId}`);
  return { ok: true };
}

export async function deleteEstimateLine(
  estimateId: string,
  lineId: string,
): Promise<ActionResult> {
  const guard = await loadEditable(estimateId);
  if ("error" in guard) return { ok: false, error: guard.error };

  const deleted = await prisma.estimateLine.deleteMany({
    where: { id: lineId, estimateId },
  });
  if (deleted.count === 0) return { ok: false, error: "Linia nu a fost gasita" };

  await recalculateEstimate(estimateId);
  revalidatePath(`/devize/${estimateId}`);
  return { ok: true };
}

/**
 * Cauta in indicatorul de norme de deviz C.
 *
 * Indicatorul e o lista fixa dintr-un fisier, nu date ale firmei, deci nu are
 * ce verifica pe apartenenta — dar ramane in spatele sesiunii, ca orice altceva.
 */
export async function searchNormeAction(query: string): Promise<Norma[]> {
  await requireUser();
  return searchNorme(query, 15);
}

const addLineSchema = z.object({
  estimateId: z.string().min(1),
  sectionId: z.string().nullable().optional(),
  code: z.string().trim().max(12).nullable().optional(),
  name: z.string().min(2, "Scrie denumirea lucrarii").max(300),
  unit: z.string().min(1, "Completeaza unitatea de masura").max(16),
  quantity: z.number().positive().finite(),
  materialUnitPrice: z.number().nonnegative().finite(),
  laborUnitPrice: z.number().nonnegative().finite(),
});

/** Adauga in deviz o linie scrisa de mana. */
export async function addEstimateLineManual(
  payload: unknown,
): Promise<ActionResult> {
  const parsed = addLineSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Date invalide" };
  }

  const guard = await loadEditable(parsed.data.estimateId);
  if ("error" in guard) return { ok: false, error: guard.error };

  // Sectiunea vine din browser — verificam ca e a acestui deviz.
  if (parsed.data.sectionId) {
    const owned = await prisma.estimateSection.count({
      where: { id: parsed.data.sectionId, estimateId: parsed.data.estimateId },
    });
    if (owned === 0) return { ok: false, error: "Sectiunea nu exista" };
  }

  const last = await prisma.estimateLine.findFirst({
    where: { estimateId: parsed.data.estimateId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const totals = computeEstimateLine(parsed.data);

  // Codul vine din browser: il pastram doar daca chiar exista in indicator, ca
  // o linie sa nu poarte un cod oficial inventat.
  const norma = parsed.data.code ? getNorma(parsed.data.code) : null;

  await prisma.estimateLine.create({
    data: {
      estimateId: parsed.data.estimateId,
      sectionId: parsed.data.sectionId ?? null,
      code: norma?.cod ?? null,
      name: parsed.data.name,
      unit: parsed.data.unit,
      quantity: toDecimal(parsed.data.quantity, 4),
      materialUnitPrice: toDecimal(parsed.data.materialUnitPrice, 4),
      laborUnitPrice: toDecimal(parsed.data.laborUnitPrice, 4),
      unitPrice: toDecimal(totals.unitPrice, 4),
      total: toDecimal(totals.total, 2),
      sortOrder: (last?.sortOrder ?? -1) + 1,
      reviewed: true,
    },
  });

  await recalculateEstimate(parsed.data.estimateId);
  revalidatePath(`/devize/${parsed.data.estimateId}`);
  return { ok: true };
}

const vatSchema = z.object({
  estimateId: z.string().min(1),
  vatRate: z.number().min(0).max(100),
});

export async function updateEstimateVatRate(
  payload: unknown,
): Promise<ActionResult> {
  const parsed = vatSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: "Cota de TVA trebuie sa fie intre 0 si 100" };
  }

  const guard = await loadEditable(parsed.data.estimateId);
  if ("error" in guard) return { ok: false, error: guard.error };

  await prisma.estimate.update({
    where: { id: parsed.data.estimateId },
    data: { vatRate: toDecimal(parsed.data.vatRate, 2) },
  });

  await recalculateEstimate(parsed.data.estimateId);
  revalidatePath(`/devize/${parsed.data.estimateId}`);
  return { ok: true };
}

const modeSchema = z.object({
  estimateId: z.string().min(1),
  mode: z.enum(["COMBINAT", "SEPARAT"]),
});

/**
 * Comuta devizul intre un pret pe linie si preturi separate.
 *
 * Trecerea SEPARAT -> COMBINAT aduna manopera peste material, ca totalul sa
 * ramana acelasi. Invers nu se poate ghici nimic: valorile existente stau in
 * continuare pe coloana de materiale, iar omul le desface cum vrea.
 */
export async function updateEstimateMode(payload: unknown): Promise<ActionResult> {
  const parsed = modeSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Mod invalid" };

  const guard = await loadEditable(parsed.data.estimateId);
  if ("error" in guard) return { ok: false, error: guard.error };

  if (parsed.data.mode === "COMBINAT") {
    const lines = await prisma.estimateLine.findMany({
      where: { estimateId: parsed.data.estimateId, laborUnitPrice: { gt: 0 } },
      select: { id: true, materialUnitPrice: true, laborUnitPrice: true },
    });

    await prisma.$transaction(
      lines.map((line) =>
        prisma.estimateLine.update({
          where: { id: line.id },
          data: {
            materialUnitPrice: line.materialUnitPrice.add(line.laborUnitPrice),
            laborUnitPrice: toDecimal(0, 4),
          },
        }),
      ),
    );
  }

  await prisma.estimate.update({
    where: { id: parsed.data.estimateId },
    data: { mode: parsed.data.mode },
  });

  await recalculateEstimate(parsed.data.estimateId);
  revalidatePath(`/devize/${parsed.data.estimateId}`);
  return { ok: true };
}

const statusSchema = z.object({
  estimateId: z.string().min(1),
  status: z.enum(["CIORNA", "TRIMIS", "ACCEPTAT", "RESPINS", "ANULAT"]),
});

export async function setEstimateStatus(payload: unknown): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Stare invalida" };

  const user = await requireUser();
  const updated = await prisma.estimate.updateMany({
    where: { id: parsed.data.estimateId, orgId: user.orgId },
    data: { status: parsed.data.status },
  });
  if (updated.count === 0) return { ok: false, error: "Devizul nu a fost gasit" };

  revalidatePath(`/devize/${parsed.data.estimateId}`);
  revalidatePath("/devize");
  return { ok: true };
}

const detailsSchema = z.object({
  estimateId: z.string().min(1),
  title: z.string().min(2).max(200),
  clientId: z.string().nullable(),
  projectId: z.string().nullable(),
  notes: z.string().max(4000).nullable(),
});

export async function updateEstimateDetails(payload: unknown): Promise<ActionResult> {
  const parsed = detailsSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Date invalide" };

  const guard = await loadEditable(parsed.data.estimateId);
  if ("error" in guard) return { ok: false, error: guard.error };

  // Id-urile vin din browser — verificam apartenenta la firma.
  if (parsed.data.clientId) {
    const owned = await prisma.client.count({
      where: { id: parsed.data.clientId, orgId: guard.orgId },
    });
    if (owned === 0) return { ok: false, error: "Beneficiarul nu exista" };
  }
  if (parsed.data.projectId) {
    const owned = await prisma.project.count({
      where: { id: parsed.data.projectId, orgId: guard.orgId },
    });
    if (owned === 0) return { ok: false, error: "Proiectul nu exista" };
  }

  await prisma.estimate.update({
    where: { id: parsed.data.estimateId },
    data: {
      title: parsed.data.title,
      clientId: parsed.data.clientId,
      projectId: parsed.data.projectId,
      notes: parsed.data.notes,
    },
  });

  revalidatePath(`/devize/${parsed.data.estimateId}`);
  return { ok: true };
}
