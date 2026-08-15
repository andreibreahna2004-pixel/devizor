import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProgressStatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/db";
import { formatLei, toNumber } from "@/lib/money";
import { getProgressState, listProgressReports } from "@/lib/progress/service";
import { requireUser } from "@/lib/tenant";
import { ProgressWorkspace } from "./progress-workspace";

export const metadata: Metadata = { title: "Situatii de lucrari" };

const DATE = new Intl.DateTimeFormat("ro-RO", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export default async function ProgressPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const estimate = await prisma.estimate.findFirst({
    where: { id, orgId: user.orgId },
    select: {
      id: true,
      fullNumber: true,
      title: true,
      netTotal: true,
      clientId: true,
      mode: true,
    },
  });
  if (!estimate) notFound();

  const [reports, state] = await Promise.all([
    listProgressReports(user.orgId, estimate.id),
    getProgressState(user.orgId, estimate.id, null),
  ]);

  const contractValue = toNumber(estimate.netTotal);
  const invoiced = reports.reduce((sum, r) => sum + r.netTotal, 0);
  const remaining = contractValue - invoiced;
  const percent = contractValue > 0 ? (invoiced / contractValue) * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/devize/${estimate.id}`} className="link text-sm">
          ← {estimate.fullNumber}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-ink-900">
          Situatii de lucrari
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {estimate.title} · facturare in transe, pe cantitatile executate
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-sm text-ink-500">Valoare contract</p>
          <p className="tabular mt-1 text-xl font-semibold text-ink-900">
            {formatLei(contractValue)} lei
          </p>
          <p className="mt-0.5 text-xs text-ink-500">fara TVA</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-ink-500">Executat pana acum</p>
          <p className="tabular mt-1 text-xl font-semibold text-ink-900">
            {formatLei(invoiced)} lei
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
            <div
              className="h-full rounded-full bg-brand-500"
              style={{ width: `${Math.min(100, percent)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-ink-500">{percent.toFixed(1)}% din contract</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-ink-500">Rest de executat</p>
          <p className="tabular mt-1 text-xl font-semibold text-ink-900">
            {formatLei(remaining)} lei
          </p>
          <p className="mt-0.5 text-xs text-ink-500">{reports.length} situatii emise</p>
        </div>
      </div>

      {reports.length > 0 && (
        <div className="card overflow-hidden">
          <header className="border-b border-[var(--border)] px-5 py-3.5">
            <h2 className="font-semibold text-ink-900">Situatii emise</h2>
          </header>
          <ul className="divide-y divide-[var(--border)] md:hidden">
            {reports.map((report) => (
              <li key={report.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="tabular font-medium text-ink-900">
                      {report.fullNumber}
                    </p>
                    <p className="tabular mt-0.5 text-xs text-ink-500">
                      {DATE.format(report.periodStart)} –{" "}
                      {DATE.format(report.periodEnd)}
                    </p>
                  </div>
                  <ProgressStatusBadge status={report.status} />
                </div>

                <dl className="mt-3 space-y-1">
                  <div className="camp">
                    <dt>Valoare</dt>
                    <dd className="font-semibold text-ink-900">
                      {formatLei(report.netTotal)}
                    </dd>
                  </div>
                  <div className="camp">
                    <dt>Cumulat</dt>
                    <dd>{formatLei(report.cumulative)}</dd>
                  </div>
                  <div className="camp">
                    <dt>Executat</dt>
                    <dd>{report.percentComplete.toFixed(1)}%</dd>
                  </div>
                  <div className="camp">
                    <dt>Factura</dt>
                    <dd>
                      {report.invoices.length > 0 ? (
                        <Link
                          href={`/facturi/${report.invoices[0].id}`}
                          className="link"
                        >
                          {report.invoices[0].fullNumber}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px]">
              <thead className="border-b border-[var(--border)] bg-ink-50">
                <tr>
                  <th className="th">Numar</th>
                  <th className="th">Perioada</th>
                  <th className="th text-right">Valoare</th>
                  <th className="th text-right">Cumulat</th>
                  <th className="th text-right">% executat</th>
                  <th className="th">Stare</th>
                  <th className="th">Factura</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {reports.map((report) => (
                  <tr key={report.id} className="hover:bg-ink-50">
                    <td className="td font-medium text-ink-900">{report.fullNumber}</td>
                    <td className="td whitespace-nowrap text-ink-600">
                      {DATE.format(report.periodStart)} – {DATE.format(report.periodEnd)}
                    </td>
                    <td className="td tabular text-right font-medium">
                      {formatLei(report.netTotal)}
                    </td>
                    <td className="td tabular text-right text-ink-600">
                      {formatLei(report.cumulative)}
                    </td>
                    <td className="td tabular text-right text-ink-600">
                      {report.percentComplete.toFixed(1)}%
                    </td>
                    <td className="td">
                      <ProgressStatusBadge status={report.status} />
                    </td>
                    <td className="td">
                      {report.invoices.length > 0 ? (
                        <Link
                          href={`/facturi/${report.invoices[0].id}`}
                          className="link text-sm"
                        >
                          {report.invoices[0].fullNumber}
                        </Link>
                      ) : (
                        <span className="text-sm text-ink-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ProgressWorkspace
        estimateId={estimate.id}
        hasClient={Boolean(estimate.clientId)}
        separat={estimate.mode === "SEPARAT"}
        lines={state}
        pendingReport={reports.find((r) => r.status === "CIORNA") ?? null}
      />
    </div>
  );
}
