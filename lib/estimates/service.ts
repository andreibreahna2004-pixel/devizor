import "server-only";
import type { EstimateMode, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { toNumber } from "@/lib/money";
import { toDecimal } from "@/lib/money-db";
import { allocateDocumentNumber } from "@/lib/numbering/series";
import {
  type EstimateLineInput,
  computeEstimateLine,
  computeEstimateTotals,
} from "@/lib/pricing/calculator";

/**
 * Operatiile pe deviz, folosite deopotriva de editorul manual si de generarea
 * cu AI. Totalurile trec intotdeauna prin `recalculateEstimate`, ca sa nu
 * existe doua locuri care aduna coloane diferit.
 */

export interface CreateEstimateInput {
  title: string;
  mode?: EstimateMode;
  clientId?: string | null;
  projectId?: string | null;
  validUntil?: Date | null;
  notes?: string | null;
  aiBrief?: string | null;
}

export async function createDraftEstimate(
  orgId: string,
  input: CreateEstimateInput,
) {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { defaultVatRate: true, defaultMode: true },
  });

  return prisma.$transaction(async (tx) => {
    const allocated = await allocateDocumentNumber(tx, orgId, "DEVIZ");

    return tx.estimate.create({
      data: {
        orgId,
        series: allocated.series,
        number: allocated.number,
        fullNumber: allocated.fullNumber,
        title: input.title,
        mode: input.mode ?? org.defaultMode,
        clientId: input.clientId ?? null,
        projectId: input.projectId ?? null,
        validUntil: input.validUntil ?? null,
        notes: input.notes ?? null,
        aiBrief: input.aiBrief ?? null,
        // Cota se ingheata pe document: o schimbare ulterioara a setarilor
        // firmei nu trebuie sa rescrie un deviz deja trimis.
        vatRate: org.defaultVatRate,
      },
    });
  });
}

/** Creeaza sectiunea daca nu exista deja, si intoarce id-ul. */
export async function ensureSection(
  estimateId: string,
  name: string,
  sortOrder: number,
): Promise<string> {
  const existing = await prisma.estimateSection.findFirst({
    where: { estimateId, name },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.estimateSection.create({
    data: { estimateId, name, sortOrder },
    select: { id: true },
  });
  return created.id;
}

export interface AddLineInput {
  sectionId: string | null;
  code: string | null;
  name: string;
  unit: string;
  quantity: number;
  materialUnitPrice: number;
  laborUnitPrice: number;
  sortOrder: number;
  aiGenerated?: boolean;
  aiJustification?: string | null;
  aiConfidence?: "MARE" | "MEDIE" | "MICA" | null;
  aiAlternativeCodes?: string[];
}

export async function addEstimateLine(estimateId: string, input: AddLineInput) {
  const totals = computeEstimateLine(input);

  return prisma.estimateLine.create({
    data: {
      estimateId,
      sectionId: input.sectionId,
      code: input.code,
      name: input.name,
      unit: input.unit,
      quantity: toDecimal(input.quantity, 4),
      materialUnitPrice: toDecimal(input.materialUnitPrice, 4),
      laborUnitPrice: toDecimal(input.laborUnitPrice, 4),
      unitPrice: toDecimal(totals.unitPrice, 4),
      total: toDecimal(totals.total, 2),
      sortOrder: input.sortOrder,
      aiGenerated: input.aiGenerated ?? false,
      aiJustification: input.aiJustification ?? null,
      aiConfidence: input.aiConfidence ?? null,
      aiAlternativeCodes: input.aiAlternativeCodes ?? [],
    },
  });
}

/**
 * Recalculeaza si salveaza totalurile devizului din liniile lui.
 * De apelat dupa orice modificare de linii sau de cote.
 */
export async function recalculateEstimate(estimateId: string) {
  const estimate = await prisma.estimate.findUniqueOrThrow({
    where: { id: estimateId },
    select: {
      vatRate: true,
      lines: {
        select: {
          quantity: true,
          materialUnitPrice: true,
          laborUnitPrice: true,
        },
      },
    },
  });

  const lines: EstimateLineInput[] = estimate.lines.map((line) => ({
    quantity: toNumber(line.quantity),
    materialUnitPrice: toNumber(line.materialUnitPrice),
    laborUnitPrice: toNumber(line.laborUnitPrice),
  }));

  const totals = computeEstimateTotals(lines, toNumber(estimate.vatRate));

  await prisma.estimate.update({
    where: { id: estimateId },
    data: {
      totalMaterial: toDecimal(totals.totalMaterial),
      totalLabor: toDecimal(totals.totalLabor),
      netTotal: toDecimal(totals.netTotal),
      vatAmount: toDecimal(totals.vatAmount),
      grandTotal: toDecimal(totals.grandTotal),
    },
  });

  return totals;
}

/** Devizul complet, cu sectiuni si linii, pentru editor si PDF. */
export async function getEstimateForView(orgId: string, estimateId: string) {
  return prisma.estimate.findFirst({
    where: { id: estimateId, orgId },
    include: {
      client: true,
      project: true,
      sections: { orderBy: { sortOrder: "asc" } },
      lines: { orderBy: { sortOrder: "asc" } },
      org: true,
      invoices: {
        select: { id: true, fullNumber: true, status: true, grandTotal: true },
      },
    },
  });
}

export type EstimateForView = NonNullable<
  Awaited<ReturnType<typeof getEstimateForView>>
>;

/** Documentele emise nu se mai editeaza. */
export function isEditable(status: string): boolean {
  return status === "CIORNA";
}

export function estimateWhere(orgId: string, id: string): Prisma.EstimateWhereInput {
  return { id, orgId };
}
