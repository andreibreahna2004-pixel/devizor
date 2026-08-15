import type { Metadata } from "next";
import Link from "next/link";
import { EstimateStatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/db";
import { formatLei } from "@/lib/money";
import { requireUser } from "@/lib/tenant";

export const metadata: Metadata = { title: "Devize" };

const DATE_FORMAT = new Intl.DateTimeFormat("ro-RO", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export default async function EstimatesPage() {
  const user = await requireUser();

  const estimates = await prisma.estimate.findMany({
    where: { orgId: user.orgId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      fullNumber: true,
      title: true,
      status: true,
      issueDate: true,
      grandTotal: true,
      aiBrief: true,
      client: { select: { name: true } },
      project: { select: { name: true } },
      _count: { select: { lines: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink-900">Devize</h1>
        <Link href="/devize/nou" className="btn-primary">
          Deviz nou cu AI
        </Link>
      </div>

      {estimates.length === 0 ? (
        <div className="card p-8 text-center sm:p-12">
          <h2 className="font-semibold text-ink-900">Niciun deviz inca</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-500">
            Descrie prima lucrare in cuvinte si AI-ul iti construieste devizul,
            cu cantitatile calculate si preturi de pornire.
          </p>
          <Link href="/devize/nou" className="btn-primary mt-4">
            Creeaza primul deviz
          </Link>
        </div>
      ) : (
        <>
          {/* Pe telefon, cele sapte coloane devin un card pe deviz: tot cardul e
              legatura spre document, deci tinta de atingere e cat randul. */}
          <ul className="space-y-2.5 md:hidden">
            {estimates.map((estimate) => (
              <li key={estimate.id}>
                <Link
                  href={`/devize/${estimate.id}`}
                  className="card block p-4 active:border-brand-300"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink-900">
                        {estimate.title}
                      </p>
                      <p className="tabular mt-0.5 text-xs text-ink-500">
                        {estimate.fullNumber} · {DATE_FORMAT.format(estimate.issueDate)}
                      </p>
                    </div>
                    <EstimateStatusBadge status={estimate.status} />
                  </div>

                  <dl className="mt-3 space-y-1 border-t border-[var(--border)] pt-3">
                    <div className="camp">
                      <dt>Beneficiar</dt>
                      <dd className="truncate">{estimate.client?.name ?? "—"}</dd>
                    </div>
                    {estimate.project && (
                      <div className="camp">
                        <dt>Proiect</dt>
                        <dd className="truncate">{estimate.project.name}</dd>
                      </div>
                    )}
                    <div className="camp">
                      <dt>Linii</dt>
                      <dd>
                        {estimate._count.lines}
                        {estimate.aiBrief && (
                          <span className="ml-1.5 text-xs text-brand-600">AI</span>
                        )}
                      </dd>
                    </div>
                    <div className="camp">
                      <dt>Total cu TVA</dt>
                      <dd className="font-semibold text-ink-900">
                        {formatLei(estimate.grandTotal)} lei
                      </dd>
                    </div>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>

          <div className="card hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead className="border-b border-[var(--border)] bg-ink-50">
                  <tr>
                    <th className="th">Numar</th>
                    <th className="th">Lucrare</th>
                    <th className="th">Beneficiar</th>
                    <th className="th">Data</th>
                    <th className="th text-right">Linii</th>
                    <th className="th text-right">Total cu TVA</th>
                    <th className="th">Stare</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {estimates.map((estimate) => (
                    <tr key={estimate.id} className="hover:bg-ink-50">
                      <td className="td whitespace-nowrap font-medium">
                        <Link href={`/devize/${estimate.id}`} className="link">
                          {estimate.fullNumber}
                        </Link>
                      </td>
                      <td className="td">
                        <Link
                          href={`/devize/${estimate.id}`}
                          className="block max-w-xs truncate font-medium text-ink-900"
                        >
                          {estimate.title}
                        </Link>
                        {estimate.project && (
                          <span className="text-xs text-ink-500">
                            {estimate.project.name}
                          </span>
                        )}
                      </td>
                      <td className="td text-ink-600">{estimate.client?.name ?? "—"}</td>
                      <td className="td whitespace-nowrap text-ink-600">
                        {DATE_FORMAT.format(estimate.issueDate)}
                      </td>
                      <td className="td tabular text-right text-ink-600">
                        {estimate._count.lines}
                        {estimate.aiBrief && (
                          <span
                            title="Generat cu AI"
                            className="ml-1.5 text-xs text-brand-600"
                          >
                            AI
                          </span>
                        )}
                      </td>
                      <td className="td tabular whitespace-nowrap text-right font-medium">
                        {formatLei(estimate.grandTotal)} lei
                      </td>
                      <td className="td">
                        <EstimateStatusBadge status={estimate.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
