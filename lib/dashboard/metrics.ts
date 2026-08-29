import "server-only";
import { type Doc, type RangeKey, aduna, bucketsFor, delta } from "@/lib/charts/buckets";
import { prisma } from "@/lib/db";
import { round2, toNumber } from "@/lib/money";

/**
 * Cifrele de pe panou.
 *
 * Totul se calculeaza din documentele firmei, nu din contoare tinute separat:
 * un contor care se actualizeaza la emitere ar fi a doua sursa de adevar
 * pentru bani, exact lucrul pe care aplicatia il refuza.
 *
 * Seriile se grupeaza in memorie, nu cu `date_trunc` in SQL. La volumul unei
 * firme de constructii — sute de documente pe an, nu milioane — diferenta e
 * sub o milisecunda, iar bucketarea ramine testabila fara baza de date.
 */

export type { RangeKey };

export const RANGES: { key: RangeKey; eticheta: string; zile: number }[] = [
  { key: "1L", eticheta: "1L", zile: 30 },
  { key: "3L", eticheta: "3L", zile: 91 },
  { key: "6L", eticheta: "6L", zile: 182 },
  { key: "1A", eticheta: "1A", zile: 365 },
];

export interface SeriesPoint {
  /** Eticheta de pe axa, gata formatata: "12 mar" sau "mar". */
  eticheta: string;
  devize: number;
  facturi: number;
}

export interface MiniMetric {
  cheie: string;
  eticheta: string;
  valoare: number;
  /** Diferenta procentuala fata de perioada anterioara, null cind n-are baza. */
  delta: number | null;
  /** Serie scurta pentru sparkline — valori brute, scalate in componenta. */
  puncte: number[];
  /** Cifra e o suma de bani (se formateaza cu zecimale) sau un numar simplu. */
  bani: boolean;
}

export interface ActivityItem {
  id: string;
  fel: "DEVIZ" | "FACTURA" | "PLATA" | "STORNO";
  titlu: string;
  subtitlu: string;
  suma: number;
  data: Date;
  href: string;
}

export interface DashboardData {
  valoareDevize: number;
  deIncasat: number;
  documenteNeincasate: number;
  liniiDeVerificat: number;
  mini: MiniMetric[];
  serii: Record<RangeKey, SeriesPoint[]>;
  activitate: ActivityItem[];
}

export async function getDashboardData(orgId: string): Promise<DashboardData> {
  const acum = new Date();
  const deLaUnAn = new Date(acum);
  deLaUnAn.setFullYear(deLaUnAn.getFullYear() - 1);
  deLaUnAn.setDate(deLaUnAn.getDate() - 7);

  const [estimates, invoices, liniiDeVerificat, ultimeleDevize, ultimeleFacturi] =
    await Promise.all([
      prisma.estimate.findMany({
        where: { orgId, createdAt: { gte: deLaUnAn } },
        select: { createdAt: true, grandTotal: true, status: true },
      }),
      prisma.invoice.findMany({
        where: { orgId, issueDate: { gte: deLaUnAn } },
        select: { issueDate: true, grandTotal: true, status: true },
      }),
      prisma.estimateLine.count({
        where: {
          aiGenerated: true,
          reviewed: false,
          estimate: { orgId, status: "CIORNA" },
        },
      }),
      prisma.estimate.findMany({
        where: { orgId },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { id: true, fullNumber: true, title: true, grandTotal: true, createdAt: true },
      }),
      prisma.invoice.findMany({
        where: { orgId },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          id: true,
          fullNumber: true,
          grandTotal: true,
          createdAt: true,
          status: true,
          reversalOfId: true,
          client: { select: { name: true } },
        },
      }),
    ]);

  const docDevize: Doc[] = estimates.map((e) => ({
    data: e.createdAt,
    valoare: toNumber(e.grandTotal),
  }));
  const docFacturi: Doc[] = invoices.map((f) => ({
    data: f.issueDate,
    valoare: toNumber(f.grandTotal),
  }));
  const docIncasate: Doc[] = invoices
    .filter((f) => f.status === "PLATITA")
    .map((f) => ({ data: f.issueDate, valoare: toNumber(f.grandTotal) }));

  const serii = {} as Record<RangeKey, SeriesPoint[]>;
  for (const { key } of RANGES) {
    const buckets = bucketsFor(key, acum);
    const d = aduna(docDevize, buckets);
    const f = aduna(docFacturi, buckets);
    serii[key] = buckets.map((b, i) => ({
      eticheta: b.eticheta,
      devize: d[i],
      facturi: f[i],
    }));
  }

  // Sparkline-urile arata ultimele douasprezece luni, indiferent de perioada
  // aleasa pentru graficul mare: sint un context stabil, nu un al doilea filtru.
  const lunare = bucketsFor("1A", acum);
  const sparkDevize = aduna(docDevize, lunare);
  const sparkFacturi = aduna(docFacturi, lunare);
  const sparkIncasate = aduna(docIncasate, lunare);
  const sparkNumarDevize = aduna(
    docDevize.map((d) => ({ data: d.data, valoare: 1 })),
    lunare,
  );

  const ultima = <T,>(a: T[]) => a[a.length - 1];
  const penultima = <T,>(a: T[]) => a[a.length - 2];

  const neincasate = invoices.filter((f) => f.status === "EMISA" || f.status === "TRIMISA");
  const deIncasat = round2(
    neincasate.reduce((s, f) => s + toNumber(f.grandTotal), 0),
  );

  const mini: MiniMetric[] = [
    {
      cheie: "devize",
      eticheta: "Devize emise",
      valoare: ultima(sparkNumarDevize),
      delta: delta(ultima(sparkNumarDevize), penultima(sparkNumarDevize)),
      puncte: sparkNumarDevize,
      bani: false,
    },
    {
      cheie: "valoare",
      eticheta: "Valoare devize",
      valoare: ultima(sparkDevize),
      delta: delta(ultima(sparkDevize), penultima(sparkDevize)),
      puncte: sparkDevize,
      bani: true,
    },
    {
      cheie: "facturat",
      eticheta: "Facturat",
      valoare: ultima(sparkFacturi),
      delta: delta(ultima(sparkFacturi), penultima(sparkFacturi)),
      puncte: sparkFacturi,
      bani: true,
    },
    {
      cheie: "incasat",
      eticheta: "Incasat",
      valoare: ultima(sparkIncasate),
      delta: delta(ultima(sparkIncasate), penultima(sparkIncasate)),
      puncte: sparkIncasate,
      bani: true,
    },
  ];

  const activitate: ActivityItem[] = [
    ...ultimeleDevize.map((e) => ({
      id: `d-${e.id}`,
      fel: "DEVIZ" as const,
      titlu: e.title,
      subtitlu: e.fullNumber,
      suma: toNumber(e.grandTotal),
      data: e.createdAt,
      href: `/devize/${e.id}`,
    })),
    ...ultimeleFacturi.map((f) => ({
      id: `f-${f.id}`,
      fel: f.reversalOfId ? ("STORNO" as const) : f.status === "PLATITA" ? ("PLATA" as const) : ("FACTURA" as const),
      titlu: f.client.name,
      subtitlu: f.fullNumber,
      suma: toNumber(f.grandTotal),
      data: f.createdAt,
      href: `/facturi/${f.id}`,
    })),
  ]
    .sort((a, b) => b.data.getTime() - a.data.getTime())
    .slice(0, 6);

  return {
    valoareDevize: round2(estimates.reduce((s, e) => s + toNumber(e.grandTotal), 0)),
    deIncasat,
    documenteNeincasate: neincasate.length,
    liniiDeVerificat,
    mini,
    serii,
    activitate,
  };
}
