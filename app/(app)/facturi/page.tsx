import type { Metadata } from "next";
import Link from "next/link";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/db";
import { formatLei, toNumber } from "@/lib/money";
import { requireUser } from "@/lib/tenant";

export const metadata: Metadata = { title: "Facturi" };

const DATE = new Intl.DateTimeFormat("ro-RO", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export default async function InvoicesPage() {
  const user = await requireUser();

  const [invoices, unpaid] = await Promise.all([
    prisma.invoice.findMany({
      where: { orgId: user.orgId },
      orderBy: [{ issueDate: "desc" }, { number: "desc" }],
      take: 100,
      select: {
        id: true,
        fullNumber: true,
        status: true,
        issueDate: true,
        dueDate: true,
        grandTotal: true,
        efacturaStatus: true,
        client: { select: { name: true } },
        estimate: { select: { id: true, fullNumber: true } },
      },
    }),
    prisma.invoice.aggregate({
      where: { orgId: user.orgId, status: { in: ["EMISA", "TRIMISA"] } },
      _sum: { grandTotal: true },
    }),
  ]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink-900">Facturi</h1>
        {toNumber(unpaid._sum.grandTotal) > 0 && (
          <p className="text-sm text-ink-600">
            De incasat:{" "}
            <span className="tabular font-semibold text-ink-900">
              {formatLei(toNumber(unpaid._sum.grandTotal))} lei
            </span>
          </p>
        )}
      </div>

      {invoices.length === 0 ? (
        <div className="card p-8 text-center sm:p-12">
          <h2 className="font-semibold text-ink-900">Nicio factura emisa</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-500">
            Facturile se emit dintr-un deviz acceptat.
          </p>
          <Link href="/devize" className="btn-secondary mt-4">
            Vezi devizele
          </Link>
        </div>
      ) : (
        <>
          <ul className="space-y-2.5 md:hidden">
            {invoices.map((invoice) => {
              const overdue =
                invoice.dueDate < today &&
                ["EMISA", "TRIMISA"].includes(invoice.status);

              return (
                <li key={invoice.id}>
                  <Link
                    href={`/facturi/${invoice.id}`}
                    className="card block p-4 active:border-brand-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="tabular truncate font-medium text-ink-900">
                          {invoice.fullNumber}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-ink-500">
                          {invoice.client.name}
                        </p>
                      </div>
                      <InvoiceStatusBadge status={invoice.status} />
                    </div>

                    <dl className="mt-3 space-y-1 border-t border-[var(--border)] pt-3">
                      <div className="camp">
                        <dt>Emisa</dt>
                        <dd>{DATE.format(invoice.issueDate)}</dd>
                      </div>
                      <div className="camp">
                        <dt>Scadenta</dt>
                        <dd
                          className={
                            overdue ? "font-medium text-red-700" : undefined
                          }
                        >
                          {DATE.format(invoice.dueDate)}
                          {overdue && " (depasita)"}
                        </dd>
                      </div>
                      <div className="camp">
                        <dt>e-Factura</dt>
                        <dd>
                          {invoice.efacturaStatus === "NEGENERATA"
                            ? "—"
                            : "XML generat"}
                        </dd>
                      </div>
                      <div className="camp">
                        <dt>Total</dt>
                        <dd className="font-semibold text-ink-900">
                          {formatLei(invoice.grandTotal)} lei
                        </dd>
                      </div>
                    </dl>
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="card hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="border-b border-[var(--border)] bg-ink-50">
                  <tr>
                    <th className="th">Numar</th>
                    <th className="th">Client</th>
                    <th className="th">Emisa</th>
                    <th className="th">Scadenta</th>
                    <th className="th text-right">Total</th>
                    <th className="th">Stare</th>
                    <th className="th">e-Factura</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {invoices.map((invoice) => {
                    const overdue =
                      invoice.dueDate < today &&
                      ["EMISA", "TRIMISA"].includes(invoice.status);

                    return (
                      <tr key={invoice.id} className="hover:bg-ink-50">
                        <td className="td whitespace-nowrap font-medium">
                          <Link href={`/facturi/${invoice.id}`} className="link">
                            {invoice.fullNumber}
                          </Link>
                        </td>
                        <td className="td text-ink-800">{invoice.client.name}</td>
                        <td className="td whitespace-nowrap text-ink-600">
                          {DATE.format(invoice.issueDate)}
                        </td>
                        <td
                          className={`td whitespace-nowrap ${
                            overdue ? "font-medium text-red-700" : "text-ink-600"
                          }`}
                        >
                          {DATE.format(invoice.dueDate)}
                          {overdue && " (depasita)"}
                        </td>
                        <td className="td tabular whitespace-nowrap text-right font-medium">
                          {formatLei(invoice.grandTotal)} lei
                        </td>
                        <td className="td">
                          <InvoiceStatusBadge status={invoice.status} />
                        </td>
                        <td className="td text-xs text-ink-500">
                          {invoice.efacturaStatus === "NEGENERATA"
                            ? "—"
                            : "XML generat"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
