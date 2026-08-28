"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteEstimate, setEstimateStatus } from "@/app/actions/estimates";
import { createInvoiceFromEstimate } from "@/app/actions/invoices";

/**
 * Actiunile care schimba starea devizului.
 *
 * Emiterea facturii e ireversibila (consuma un numar din serie), deci cere
 * confirmare explicita. Dintr-un deviz iese o singura factura, pe toata
 * valoarea lui.
 */
export function EstimateActions({
  estimateId,
  status,
  hasClient,
  hasLines,
  canDelete,
}: {
  estimateId: string;
  status: string;
  hasClient: boolean;
  hasLines: boolean;
  /** Fals cind devizul are factura sau situatii — vezi `deleteEstimate`. */
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingInvoice, setConfirmingInvoice] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteEstimate(estimateId);
      if (!result.ok) {
        setError(result.error ?? "Stergerea a esuat");
        setConfirmingDelete(false);
        return;
      }
      router.push("/devize");
    });
  }

  function changeStatus(next: string) {
    setError(null);
    startTransition(async () => {
      const result = await setEstimateStatus({ estimateId, status: next });
      if (!result.ok) setError(result.error ?? "Actiunea a esuat");
      else router.refresh();
    });
  }

  function issueInvoice() {
    setError(null);
    startTransition(async () => {
      const result = await createInvoiceFromEstimate({ estimateId });
      if (!result.ok || !result.invoiceId) {
        setError(result.error ?? "Factura nu a putut fi emisa");
        setConfirmingInvoice(false);
        return;
      }
      router.push(`/facturi/${result.invoiceId}`);
    });
  }

  const canInvoice = status === "ACCEPTAT" || status === "TRIMIS";

  return (
    <div className="flex w-full flex-col gap-2 lg:w-auto lg:items-end">
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <a
          href={`/api/devize/${estimateId}/pdf`}
          target="_blank"
          rel="noopener"
          className="btn-secondary"
        >
          PDF
        </a>

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
          (confirmingInvoice ? (
            <span className="flex items-center gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setConfirmingInvoice(false)}
                disabled={pending}
              >
                Renunta
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={issueInvoice}
                disabled={pending}
              >
                {pending ? "Se emite..." : "Confirm emiterea"}
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setConfirmingInvoice(true)}
              disabled={pending || !hasClient || !hasLines}
              title={
                hasClient
                  ? undefined
                  : "Devizul trebuie sa aiba un beneficiar pentru a putea fi facturat"
              }
            >
              Emite factura
            </button>
          ))}

        {/* Stergerea sta la capatul rindului, dupa actiunile de zi cu zi: nu e
            una dintre ele. Dispare cu totul cind devizul are factura sau
            situatii — un buton care oricum ar refuza doar incurca. */}
        {canDelete &&
          (confirmingDelete ? (
            <span className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setConfirmingDelete(false)}
                disabled={pending}
              >
                Renunta
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={remove}
                disabled={pending}
              >
                {pending ? "Se sterge..." : "Confirm stergerea"}
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="btn-danger"
              onClick={() => setConfirmingDelete(true)}
              disabled={pending}
            >
              Sterge devizul
            </button>
          ))}
      </div>

      {confirmingDelete && !error && (
        <p className="text-xs text-ink-500 lg:max-w-xs lg:text-right">
          Se sterg devizul, liniile si propunerile lui, definitiv. Numarul din
          serie ramine consumat. Daca vrei doar sa-l scoti din lucru, marcheaza-l
          respins — ramine in evidenta.
        </p>
      )}

      {confirmingInvoice && !error && (
        <p className="text-xs text-ink-500 lg:max-w-xs lg:text-right">
          Se emite factura pentru tot devizul. Primeste un numar din serie si nu
          mai poate fi stearsa, doar stornata.
        </p>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
