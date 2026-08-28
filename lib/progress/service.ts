import "server-only";
import { prisma } from "@/lib/db";
import { round2, round4, toNumber } from "@/lib/money";
import { toDecimal } from "@/lib/money-db";
import { allocateDocumentNumber } from "@/lib/numbering/series";
import { computeEstimateLine } from "@/lib/pricing/calculator";

/**
 * Situatii de lucrari — facturarea in transe, pe stadiu fizic.
 *
 * Pe un santier nu se factureaza tot devizul deodata: la sfarsitul fiecarei
 * luni se masoara ce s-a executat si se emite o situatie, apoi factura pentru
 * ea. Fiecare situatie tine cantitatile executate IN ACEA perioada; cumulatul
 * se obtine insumand situatiile anterioare.
 *
 * Regula care nu se incalca: cumulatul nu poate depasi cantitatea din deviz.
 * Un plus de lucrari se adauga in deviz, nu se strecoara intr-o situatie.
 */

export interface ProgressLineState {
  estimateLineId: string;
  code: string | null;
  name: string;
  unit: string;
  /** Cantitatea contractata, din deviz. */
  contracted: number;
  /** Executat in situatiile anterioare acesteia. */
  previouslyDone: number;
  /** Executat in situatia curenta (0 pentru una noua). */
  currentQuantity: number;
  /** Preturile din linia de deviz, pastrate defalcate pe cele patru componente. */
  materialUnitPrice: number;
  laborUnitPrice: number;
  equipmentUnitPrice: number;
  transportUnitPrice: number;
  /** Suma celor patru — pretul cu care se deconteaza cantitatea executata. */
  unitPrice: number;
}

/**
 * Starea liniilor pentru o situatie: cat s-a contractat, cat s-a facut deja,
 * cat mai e de facut.
 *
 * `reportId` null inseamna o situatie noua — atunci "anterior" include toate
 * situatiile existente.
 */
export async function getProgressState(
  orgId: string,
  estimateId: string,
  reportId: string | null,
): Promise<ProgressLineState[]> {
  const estimate = await prisma.estimate.findFirstOrThrow({
    where: { id: estimateId, orgId },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      progressReports: {
        orderBy: { number: "asc" },
        include: { lines: true },
      },
    },
  });

  // Situatiile care conteaza ca "anterior": toate, mai putin cea editata.
  const previous = estimate.progressReports.filter((r) => r.id !== reportId);
  const current = estimate.progressReports.find((r) => r.id === reportId);

  const doneBefore = new Map<string, number>();
  for (const report of previous) {
    for (const line of report.lines) {
      doneBefore.set(
        line.estimateLineId,
        round4((doneBefore.get(line.estimateLineId) ?? 0) + toNumber(line.quantity)),
      );
    }
  }

  const currentByLine = new Map(
    (current?.lines ?? []).map((l) => [l.estimateLineId, toNumber(l.quantity)]),
  );

  return estimate.lines.map((line) => ({
    estimateLineId: line.id,
    code: line.code,
    name: line.name,
    unit: line.unit,
    contracted: toNumber(line.quantity),
    previouslyDone: doneBefore.get(line.id) ?? 0,
    currentQuantity: currentByLine.get(line.id) ?? 0,
    materialUnitPrice: toNumber(line.materialUnitPrice),
    laborUnitPrice: toNumber(line.laborUnitPrice),
    equipmentUnitPrice: toNumber(line.equipmentUnitPrice),
    transportUnitPrice: toNumber(line.transportUnitPrice),
    unitPrice: toNumber(line.unitPrice),
  }));
}

export interface SaveProgressInput {
  estimateId: string;
  reportId?: string | null;
  periodStart: Date;
  periodEnd: Date;
  notes?: string | null;
  lines: { estimateLineId: string; quantity: number }[];
}

export interface SaveProgressResult {
  ok: boolean;
  reportId?: string;
  error?: string;
}

export async function saveProgressReport(
  orgId: string,
  input: SaveProgressInput,
): Promise<SaveProgressResult> {
  const state = await getProgressState(orgId, input.estimateId, input.reportId ?? null);
  const byId = new Map(state.map((s) => [s.estimateLineId, s]));

  // Validam inainte de a scrie ceva: o situatie care depaseste devizul ar
  // insemna ca facturam lucrari necontractate.
  const overruns: string[] = [];
  const kept: {
    estimateLineId: string;
    quantity: number;
    materialUnitPrice: number;
    laborUnitPrice: number;
    equipmentUnitPrice: number;
    transportUnitPrice: number;
    unitPrice: number;
    total: number;
  }[] = [];

  for (const line of input.lines) {
    const info = byId.get(line.estimateLineId);
    if (!info) return { ok: false, error: "O linie nu apartine acestui deviz" };
    if (line.quantity <= 0) continue;

    const cumulative = round4(info.previouslyDone + line.quantity);
    if (cumulative > round4(info.contracted) + 1e-6) {
      overruns.push(
        `${info.name}: cumulat ${cumulative} ${info.unit} peste cantitatea din deviz (${info.contracted} ${info.unit})`,
      );
      continue;
    }

    // Valoarea situatiei se calculeaza cu acelasi motor ca devizul, ca sa nu
    // apara diferente de rotunjire intre cele doua documente.
    const totals = computeEstimateLine({
      quantity: line.quantity,
      materialUnitPrice: info.materialUnitPrice,
      laborUnitPrice: info.laborUnitPrice,
      equipmentUnitPrice: info.equipmentUnitPrice,
      transportUnitPrice: info.transportUnitPrice,
    });

    kept.push({
      estimateLineId: line.estimateLineId,
      quantity: line.quantity,
      materialUnitPrice: info.materialUnitPrice,
      laborUnitPrice: info.laborUnitPrice,
      equipmentUnitPrice: info.equipmentUnitPrice,
      transportUnitPrice: info.transportUnitPrice,
      unitPrice: info.unitPrice,
      total: totals.total,
    });
  }

  if (overruns.length > 0) {
    return {
      ok: false,
      error: `Cantitatile depasesc devizul:\n${overruns.join("\n")}\nAdauga lucrarile suplimentare in deviz mai intai.`,
    };
  }

  if (kept.length === 0) {
    return { ok: false, error: "Situatia nu are nicio cantitate executata" };
  }

  const netTotal = round2(kept.reduce((sum, l) => sum + l.total, 0));

  const progressLineData = kept.map((l) => ({
    estimateLineId: l.estimateLineId,
    quantity: toDecimal(l.quantity, 4),
    materialUnitPrice: toDecimal(l.materialUnitPrice, 4),
    laborUnitPrice: toDecimal(l.laborUnitPrice, 4),
    equipmentUnitPrice: toDecimal(l.equipmentUnitPrice, 4),
    transportUnitPrice: toDecimal(l.transportUnitPrice, 4),
    unitPrice: toDecimal(l.unitPrice, 4),
    total: toDecimal(l.total),
  }));

  if (input.reportId) {
    const owned = await prisma.progressReport.findFirst({
      where: { id: input.reportId, orgId, status: "CIORNA" },
      select: { id: true },
    });
    if (!owned) {
      return { ok: false, error: "Situatia nu a fost gasita sau nu mai e ciorna" };
    }

    await prisma.$transaction([
      prisma.progressLine.deleteMany({ where: { progressReportId: input.reportId } }),
      prisma.progressReport.update({
        where: { id: input.reportId },
        data: {
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          notes: input.notes ?? null,
          netTotal: toDecimal(netTotal),
          lines: { create: progressLineData },
        },
      }),
    ]);

    return { ok: true, reportId: input.reportId };
  }

  const created = await prisma.$transaction(async (tx) => {
    const allocated = await allocateDocumentNumber(tx, orgId, "SITUATIE");

    return tx.progressReport.create({
      data: {
        orgId,
        estimateId: input.estimateId,
        series: allocated.series,
        number: allocated.number,
        fullNumber: allocated.fullNumber,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        notes: input.notes ?? null,
        netTotal: toDecimal(netTotal),
        lines: { create: progressLineData },
      },
    });
  });

  return { ok: true, reportId: created.id };
}

/** Situatiile unui deviz, cu procentul executat cumulat. */
export async function listProgressReports(orgId: string, estimateId: string) {
  const [reports, estimate] = await Promise.all([
    prisma.progressReport.findMany({
      where: { orgId, estimateId },
      orderBy: { number: "asc" },
      include: { invoices: { select: { id: true, fullNumber: true } } },
    }),
    prisma.estimate.findFirstOrThrow({
      where: { id: estimateId, orgId },
      select: { netTotal: true },
    }),
  ]);

  const contractValue = toNumber(estimate.netTotal);
  let cumulative = 0;

  return reports.map((report) => {
    cumulative = round2(cumulative + toNumber(report.netTotal));
    return {
      id: report.id,
      fullNumber: report.fullNumber,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      status: report.status,
      netTotal: toNumber(report.netTotal),
      cumulative,
      percentComplete:
        contractValue > 0 ? round2((cumulative / contractValue) * 100) : 0,
      invoices: report.invoices,
    };
  });
}

export async function getProgressReport(orgId: string, reportId: string) {
  return prisma.progressReport.findFirst({
    where: { id: reportId, orgId },
    include: {
      estimate: {
        select: {
          id: true,
          fullNumber: true,
          title: true,
          clientId: true,
          projectId: true,
          vatRate: true,
        },
      },
      lines: { include: { estimateLine: true } },
      invoices: { select: { id: true, fullNumber: true } },
    },
  });
}
