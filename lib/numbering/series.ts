import type { Prisma, PrismaClient, SeriesKind } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Numerotarea documentelor.
 *
 * Legea cere numerotare secventiala, fara goluri si fara duplicate, pe serie si
 * pe firma. Doi utilizatori care emit facturi in aceeasi secunda nu au voie sa
 * primeasca acelasi numar.
 *
 * Solutia e un singur `UPDATE ... RETURNING` atomic: Postgres blocheaza randul
 * pe durata update-ului, deci cererile concurente se serializeaza singure. Nu e
 * nevoie de `SELECT ... FOR UPDATE` separat si nu exista fereastra intre citire
 * si scriere in care doi sa vada acelasi `nextNumber`.
 */

export type DbClient = PrismaClient | Prisma.TransactionClient;

export interface AllocatedNumber {
  series: string;
  number: number;
  fullNumber: string;
}

/** "FCT-000042" */
export function formatFullNumber(series: string, number: number): string {
  return `${series}-${String(number).padStart(6, "0")}`;
}

const DEFAULT_SERIES: Record<SeriesKind, string> = {
  DEVIZ: "DVZ",
  FACTURA: "FCT",
  PROFORMA: "PRO",
  SITUATIE: "SIT",
};

/**
 * Aloca urmatorul numar dintr-o serie.
 *
 * Trebuie apelata IN INTERIORUL tranzactiei care creeaza documentul. Daca
 * inserarea documentului esueaza, rollback-ul da si numarul inapoi — altfel s-ar
 * pierde numere din secventa.
 */
export async function allocateDocumentNumber(
  db: DbClient,
  orgId: string,
  kind: SeriesKind,
  series?: string,
): Promise<AllocatedNumber> {
  const seriesCode = series ?? (await resolveDefaultSeries(db, orgId, kind));

  const rows = await db.$queryRaw<{ number: number }[]>`
    UPDATE "DocumentSeries"
       SET "nextNumber" = "nextNumber" + 1
     WHERE "orgId" = ${orgId}
       AND "kind" = ${kind}::"SeriesKind"
       AND "series" = ${seriesCode}
    RETURNING "nextNumber" - 1 AS number
  `;

  const allocated = rows[0];
  if (!allocated) {
    throw new Error(
      `Seria "${seriesCode}" nu exista pentru acest tip de document. Configureaza-o in Setari > Serii.`,
    );
  }

  const number = Number(allocated.number);
  return { series: seriesCode, number, fullNumber: formatFullNumber(seriesCode, number) };
}

/** Seria implicita a firmei pentru un tip de document. */
async function resolveDefaultSeries(
  db: DbClient,
  orgId: string,
  kind: SeriesKind,
): Promise<string> {
  const preferred = await db.documentSeries.findFirst({
    where: { orgId, kind, isDefault: true },
    select: { series: true },
  });
  if (preferred) return preferred.series;

  const any = await db.documentSeries.findFirst({
    where: { orgId, kind },
    orderBy: { createdAt: "asc" },
    select: { series: true },
  });
  if (any) return any.series;

  throw new Error(
    `Firma nu are nicio serie configurata pentru ${kind}. Adauga una in Setari > Serii.`,
  );
}

/** Creeaza seriile implicite la inregistrarea unei firme noi. */
export async function createDefaultSeries(
  db: DbClient,
  orgId: string,
): Promise<void> {
  await db.documentSeries.createMany({
    data: (Object.keys(DEFAULT_SERIES) as SeriesKind[]).map((kind) => ({
      orgId,
      kind,
      series: DEFAULT_SERIES[kind],
      nextNumber: 1,
      isDefault: true,
    })),
    skipDuplicates: true,
  });
}

/**
 * Verifica daca o serie are goluri sau duplicate. Rulata inaintea unui control
 * fiscal, nu in fluxul normal.
 */
export async function auditSeries(
  orgId: string,
  kind: "FACTURA" | "DEVIZ",
  series: string,
): Promise<{ missing: number[]; duplicates: number[] }> {
  const table = kind === "FACTURA" ? "Invoice" : "Estimate";

  const rows = await prisma.$queryRawUnsafe<{ number: number; count: bigint }[]>(
    `SELECT "number", COUNT(*) AS count
       FROM "${table}"
      WHERE "orgId" = $1 AND "series" = $2
      GROUP BY "number"
      ORDER BY "number"`,
    orgId,
    series,
  );

  const duplicates = rows.filter((r) => Number(r.count) > 1).map((r) => Number(r.number));
  const used = rows.map((r) => Number(r.number));
  const missing: number[] = [];

  if (used.length > 0) {
    for (let n = used[0]; n < used[used.length - 1]; n++) {
      if (!used.includes(n)) missing.push(n);
    }
  }

  return { missing, duplicates };
}
