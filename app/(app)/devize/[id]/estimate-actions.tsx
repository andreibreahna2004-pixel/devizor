"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setEstimateStatus } from "@/app/actions/estimates";
import { createInvoiceFromEstimate } from "@/app/actions/invoices";

type InvoiceScope = "TOT" | "MATERIALE" | "MANOPERA";

const SCOPE_LABEL: Record<InvoiceScope, string> = {
  TOT: "tot devizul",
  MATERIALE: "doar materialele",
  MANOPERA: "doar manopera",
};

/**
 * Actiunile care schimba starea devizului.
 *
 * Emiterea facturii e ireversibila (consuma un numar din serie), deci cere
 * confirmare explicita. Pentru un deviz cu materialele si manopera separate se
 * alege intai ce se factureaza — se pot emite doua facturi din acelasi deviz.
 */
export function EstimateActions({
  estimateId,
  status,
  separat,
  hasClient,
  hasLines,
}: {
  estimateId: string;
  status: string;
  separat: boolean;
  hasClient: boolean;
  hasLines: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingScope, setConfirmingScope] = useState<InvoiceScope | null>(null);

  function changeStatus(next: string) {
    setError(null);
    startTransition(async () => {
      const result = await setEstimateStatus({ estimateId, status: next });
      if (!result.ok) setError(result.error ?? "Actiunea a esuat");
      else router.refresh();
    });
  }

  function issueInvoice(scope: InvoiceScope) {
    setError(null);
    startTransition(async () => {
      const result = await createInvoiceFromEstimate({ estimateId, scope });
      if (!result.ok || !result.invoiceId) {
        setError(result.error ?? "Factura nu a putut fi emisa");
        setConfirmingScope(null);
        return;
      }
      router.push(`/facturi/${result.invoiceId}`);
    });
  }

  const canInvoice = status === "ACCEPTAT" || status === "TRIMIS";
  const scopes: InvoiceScope[] = separat ? ["MATERIALE", "MANOPERA", "TOT"] : ["TOT"];

  return (
    <div className="flex w-full flex-col gap-2 lg:w-auto lg:items-end">
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <a
          href={`/api/devize/${estimateId}/pdf`}
          target="_blank"
          rel="noopener"
          className="btn-secondary"
        >
          {separat ? "PDF complet" : "PDF"}
        </a>

        {separat && (
          <>
            <a
              href={`/api/devize/${estimateId}/pdf?parte=materiale`}
              target="_blank"
              rel="noopener"
              className="btn-secondary"
            >
              PDF materiale
            </a>
            <a
              href={`/api/devize/${estimateId}/pdf?parte=manopera`}
              target="_blank"
              rel="noopener"
              className="btn-secondary"
            >
              PDF manopera
            </a>
          </>
        )}

        {status === "CIORNA" && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => changeStatus("TRIMIS")}
            disabled={pending || !hasLines}
          >
            Marcheaza trimis
          </button>
        )}

        {status === "TRIMIS" && (
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => changeStatus("RESPINS")}
              disabled={pending}
            >
              Respins
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => changeStatus("ACCEPTAT")}
              disabled={pending}
            >
              Acceptat
            </button>
          </>
        )}

        {canInvoice &&
          (confirmingScope ? (
            <span className="flex items-center gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setConfirmingScope(null)}
                disabled={pending}
              >
                Renunta
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => issueInvoice(confirmingScope)}
                disabled={pending}
              >
                {pending ? "Se emite..." : "Confirm emiterea"}
              </button>
            </span>
          ) : (
            scopes.map((scope) => (
              <button
                key={scope}
                type="button"
                className={scope === "TOT" && !separat ? "btn-primary" : "btn-secondary"}
                onClick={() => setConfirmingScope(scope)}
                disabled={pending || !hasClient || !hasLines}
                title={
                  hasClient
                    ? undefined
                    : "Devizul trebuie sa aiba un beneficiar pentru a putea fi facturat"
                }
              >
                {separat ? `Factura ${SCOPE_LABEL[scope]}` : "Emite factura"}
              </button>
            ))
          ))}
      </div>

      {confirmingScope && !error && (
        <p className="text-xs text-ink-500 lg:max-w-xs lg:text-right">
          Se emite factura pentru {SCOPE_LABEL[confirmingScope]}. Primeste un numar
          din serie si nu mai poate fi stearsa, doar stornata.
        </p>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
