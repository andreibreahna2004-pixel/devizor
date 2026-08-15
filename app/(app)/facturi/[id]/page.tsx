import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { countyLabel, validateForEfactura } from "@/lib/efactura/ubl";
import { invoiceToUbl } from "@/lib/efactura/from-invoice";
import { type PartySnapshot, getInvoiceForView } from "@/lib/invoices/service";
import { amountInWords, formatLei, formatQty, toNumber } from "@/lib/money";
import { requireUser } from "@/lib/tenant";
import { InvoiceActions } from "./invoice-actions";

export const metadata: Metadata = { title: "Factura" };

const DATE = new Intl.DateTimeFormat("ro-RO", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const invoice = await getInvoiceForView(user.orgId, id);
  if (!invoice) notFound();

  const supplier = invoice.supplierSnapshot as unknown as PartySnapshot;
  const customer = invoice.clientSnapshot as unknown as PartySnapshot;

  // Validam la fiecare afisare: daca lipseste ceva pentru e-Factura, omul
  // trebuie sa afle acum, nu cand incarca fisierul in SPV.
  const problems = validateForEfactura(invoiceToUbl(invoice));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/facturi" className="link text-sm">
            ← Facturi
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-ink-900">
              {invoice.reversalOfId ? "Factura storno " : "Factura "}
              {invoice.fullNumber}
            </h1>
            <InvoiceStatusBadge status={invoice.status} />
          </div>
          <p className="mt-1 text-sm text-ink-500">
            Emisa {DATE.format(invoice.issueDate)} · Scadenta{" "}
            {DATE.format(invoice.dueDate)}
          </p>
        </div>

        <InvoiceActions
          invoiceId={invoice.id}
          status={invoice.status}
          canExportXml={problems.filter((p) => !p.field.includes(".unit")).length === 0}
        />
      </div>

      {invoice.reversalOf && (
        <div className="card px-5 py-3.5">
          <p className="text-sm text-ink-600">
            Storneaza factura{" "}
            <Link href={`/facturi/${invoice.reversalOf.id}`} className="link">
              {invoice.reversalOf.fullNumber}
            </Link>
          </p>
        </div>
      )}

      {invoice.reversedBy && (
        <div className="card border-amber-200 bg-amber-50 px-5 py-3.5">
          <p className="text-sm text-amber-900">
            Factura a fost stornata prin{" "}
            <Link href={`/facturi/${invoice.reversedBy.id}`} className="link">
              {invoice.reversedBy.fullNumber}
            </Link>
          </p>
        </div>
      )}

      {problems.length > 0 && (
        <div className="card border-amber-200 bg-amber-50 p-5">
          <h2 className="font-semibold text-amber-900">
            De completat pentru e-Factura
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-amber-900/90">
            {problems.map((problem) => (
              <li key={problem.field}>— {problem.message}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-amber-900/70">
            Datele partilor sunt inghetate in factura la emitere. Corecteaza-le in
            Setari si la beneficiar, apoi storneaza si reemite factura.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PartyCard title="Furnizor" party={supplier} />
        <PartyCard title="Client" party={customer} />
      </div>

      <div className="card overflow-hidden">
        {/* Liniile facturii pe telefon: fiecare pozitie e un bloc, cu numarul de
            rand pastrat — pe factura, numarul liniei e reper in discutia cu
            beneficiarul, nu decor. */}
        <ul className="divide-y divide-[var(--border)] md:hidden">
          {invoice.lines.map((line, index) => (
            <li key={line.id} className="p-4">
              <div className="flex gap-2">
                <span className="tabular shrink-0 text-sm text-ink-500">
                  {index + 1}.
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900">{line.name}</p>
                  {line.code && (
                    <p className="mt-0.5 text-xs text-ink-500">{line.code}</p>
                  )}
                </div>
              </div>

              <dl className="mt-2.5 space-y-1 pl-6">
                <div className="camp">
                  <dt>Cantitate</dt>
                  <dd>
                    {formatQty(line.quantity)} {line.unit}
                  </dd>
                </div>
                <div className="camp">
                  <dt>Pret unitar</dt>
                  <dd>{formatLei(line.unitPrice)}</dd>
                </div>
                <div className="camp">
                  <dt>TVA</dt>
                  <dd>{toNumber(line.vatRate)}%</dd>
                </div>
                <div className="camp">
                  <dt>Valoare</dt>
                  <dd className="font-semibold text-ink-900">
                    {formatLei(line.netAmount)}
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
                <th className="th w-10">Nr.</th>
                <th className="th">Denumire</th>
                <th className="th w-16">U.M.</th>
                <th className="th w-24 text-right">Cantitate</th>
                <th className="th w-28 text-right">Pret unitar</th>
                <th className="th w-20 text-right">TVA</th>
                <th className="th w-32 text-right">Valoare</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {invoice.lines.map((line, index) => (
                <tr key={line.id}>
                  <td className="td text-ink-500">{index + 1}</td>
                  <td className="td">
                    <span className="font-medium text-ink-900">{line.name}</span>
                    {line.code && (
                      <span className="ml-2 text-xs text-ink-500">{line.code}</span>
                    )}
                  </td>
                  <td className="td text-ink-600">{line.unit}</td>
                  <td className="td tabular text-right">{formatQty(line.quantity)}</td>
                  <td className="td tabular text-right">{formatLei(line.unitPrice)}</td>
                  <td className="td tabular text-right text-ink-600">
                    {toNumber(line.vatRate)}%
                  </td>
                  <td className="td tabular text-right font-medium">
                    {formatLei(line.netAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-[var(--border)] p-5">
          <dl className="ml-auto max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-600">Total fara TVA</dt>
              <dd className="tabular">{formatLei(invoice.netTotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-600">Total TVA</dt>
              <dd className="tabular">{formatLei(invoice.vatAmount)}</dd>
            </div>
            <div className="flex justify-between border-t-2 border-ink-900 pt-2">
              <dt className="font-semibold text-ink-900">TOTAL DE PLATA</dt>
              <dd className="tabular text-xl font-semibold text-ink-900">
                {formatLei(invoice.grandTotal)} {invoice.currency}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-right text-xs text-ink-500">
            {amountInWords(toNumber(invoice.grandTotal))}
          </p>
        </div>
      </div>

      {invoice.estimate && (
        <p className="text-sm text-ink-500">
          Emisa din devizul{" "}
          <Link href={`/devize/${invoice.estimate.id}`} className="link">
            {invoice.estimate.fullNumber}
          </Link>
        </p>
      )}
    </div>
  );
}

function PartyCard({ title, party }: { title: string; party: PartySnapshot }) {
  const taxCode = party.cui
    ? `${party.vatPayer ? "RO" : ""}${party.cui.replace(/^RO/i, "")}`
    : null;

  return (
    <div className="card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
        {title}
      </p>
      <p className="mt-1.5 font-semibold text-ink-900">{party.name}</p>
      <div className="mt-1 space-y-0.5 text-sm text-ink-600">
        {taxCode && <p>CUI: {taxCode}</p>}
        {party.regCom && <p>Reg. Com.: {party.regCom}</p>}
        {party.address && <p>{party.address}</p>}
        {(party.city || party.countyCode) && (
          <p>{[party.city, countyLabel(party.countyCode)].filter(Boolean).join(", ")}</p>
        )}
        {party.iban && <p>IBAN: {party.iban}</p>}
      </div>
    </div>
  );
}
