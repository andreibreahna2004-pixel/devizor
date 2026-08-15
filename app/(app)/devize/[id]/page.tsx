import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EstimateStatusBadge } from "@/components/status-badge";
import { isAiConfigured } from "@/lib/ai/client";
import { getEstimateForView, isDeletable, isEditable } from "@/lib/estimates/service";
import { toNumber } from "@/lib/money";
import { getNorma } from "@/lib/norme";
import { requireUser } from "@/lib/tenant";
import { EstimateEditor, type EditorLine } from "./estimate-editor";
import { EstimateActions } from "./estimate-actions";

export const metadata: Metadata = { title: "Deviz" };

export default async function EstimatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const estimate = await getEstimateForView(user.orgId, id);
  if (!estimate) notFound();

  const editable = isEditable({
    status: estimate.status,
    invoiceCount: estimate.invoices.length,
    progressCount: estimate._count.progressReports,
  });

  const lines: EditorLine[] = estimate.lines.map((line) => ({
    id: line.id,
    sectionId: line.sectionId,
    code: line.code,
    name: line.name,
    unit: line.unit,
    quantity: toNumber(line.quantity),
    materialUnitPrice: toNumber(line.materialUnitPrice),
    laborUnitPrice: toNumber(line.laborUnitPrice),
    aiGenerated: line.aiGenerated,
    aiJustification: line.aiJustification,
    aiConfidence: line.aiConfidence,
    reviewed: line.reviewed,
    // Indicatoarele sint trei fisiere JSON de citeva megabytes: se citesc aici,
    // pe server, nu in componenta din browser.
    alternatives: line.aiAlternativeCodes.flatMap((cod) => {
      const norma = getNorma(cod);
      return norma ? [{ cod: norma.cod, denumire: norma.denumire, um: norma.um }] : [];
    }),
  }));

  const unreviewed = lines.filter((l) => l.aiGenerated && !l.reviewed).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/devize" className="link text-sm">
            ← Devize
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-ink-900">{estimate.title}</h1>
            <EstimateStatusBadge status={estimate.status} />
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {estimate.fullNumber}
            {estimate.client && ` · ${estimate.client.name}`}
            {estimate.project && ` · ${estimate.project.name}`}
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 lg:w-auto lg:items-end">
          <EstimateActions
            estimateId={estimate.id}
            status={estimate.status}
            separat={estimate.mode === "SEPARAT"}
            hasClient={Boolean(estimate.clientId)}
            hasLines={lines.length > 0}
            canDelete={isDeletable({
              invoiceCount: estimate.invoices.length,
              progressCount: estimate._count.progressReports,
            })}
          />
          {lines.length > 0 && (
            <Link href={`/devize/${estimate.id}/situatii`} className="link text-sm">
              Situatii de lucrari — facturare in transe →
            </Link>
          )}
        </div>
      </div>

      {estimate.invoices.length > 0 && (
        <div className="card px-5 py-3.5">
          <p className="text-sm text-ink-600">
            Facturat prin:{" "}
            {estimate.invoices.map((invoice, index) => (
              <span key={invoice.id}>
                {index > 0 && ", "}
                <Link href={`/facturi/${invoice.id}`} className="link">
                  {invoice.fullNumber}
                </Link>
              </span>
            ))}
          </p>
        </div>
      )}

      {unreviewed > 0 && (
        <div className="card border-amber-200 bg-amber-50 px-5 py-3.5">
          <p className="text-sm text-amber-900">
            <strong>{unreviewed}</strong>{" "}
            {unreviewed === 1 ? "linie generata de AI nu a fost verificata" : "linii generate de AI nu au fost verificate"}
            . Deschide justificarea fiecarei linii si confirma cantitatea inainte de
            a trimite oferta.
          </p>
        </div>
      )}

      {estimate.aiBrief && (
        <details className="card p-5">
          <summary className="cursor-pointer text-sm font-medium text-ink-700">
            Descrierea din care a fost generat devizul
          </summary>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-600">
            {estimate.aiBrief}
          </p>
        </details>
      )}

      <EstimateEditor
        estimateId={estimate.id}
        editable={editable}
        mode={estimate.mode}
        aiConfigured={isAiConfigured()}
        sections={estimate.sections.map((s) => ({ id: s.id, name: s.name }))}
        lines={lines}
        suggestions={estimate.suggestions.map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          unit: s.unit,
          quantity: s.quantity === null ? null : toNumber(s.quantity),
          reason: s.reason,
        }))}
        vatRate={toNumber(estimate.vatRate)}
      />
    </div>
  );
}
