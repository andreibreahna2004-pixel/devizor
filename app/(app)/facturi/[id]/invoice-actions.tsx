"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reverseInvoice, setInvoiceStatus } from "@/app/actions/invoices";

export function InvoiceActions({
  invoiceId,
  status,
  canExportXml,
}: {
  invoiceId: string;
  status: string;
  canExportXml: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingReversal, setConfirmingReversal] = useState(false);

  const closed = status === "STORNATA" || status === "ANULATA";

  function changeStatus(next: string) {
    setError(null);
    startTransition(async () => {
      const result = await setInvoiceStatus({ invoiceId, status: next });
      if (!result.ok) setError(result.error ?? "Actiunea a esuat");
      else router.refresh();
    });
  }

  function storno() {
    setError(null);
    startTransition(async () => {
      const result = await reverseInvoice({ invoiceId });
      if (!result.ok || !result.invoiceId) {
        setError(result.error ?? "Stornarea a esuat");
        setConfirmingReversal(false);
        return;
      }
      router.push(`/facturi/${result.invoiceId}`);
    });
  }

  return (
    <div className="flex w-full flex-col gap-2 lg:w-auto lg:items-end">
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <a
          href={`/api/facturi/${invoiceId}/pdf`}
          target="_blank"
          rel="noopener"
          className="btn-secondary"
        >
          PDF
        </a>

        <a
          href={canExportXml ? `/api/facturi/${invoiceId}/xml` : undefined}
          className={canExportXml ? "btn-secondary" : "btn-secondary opacity-50"}
          title={
            canExportXml
              ? "Descarca XML-ul pentru incarcare in SPV"
              : "Completeaza datele semnalate mai jos inainte de export"
          }
          aria-disabled={!canExportXml}
          onClick={(e) => {
            if (!canExportXml) e.preventDefault();
          }}
        >
          XML e-Factura
        </a>

        {!closed && status === "EMISA" && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => changeStatus("TRIMISA")}
            disabled={pending}
          >
            Marcheaza trimisa
          </button>
        )}

        {!closed && status !== "PLATITA" && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => changeStatus("PLATITA")}
            disabled={pending}
          >
            Marcheaza incasata
          </button>
        )}

        {!closed &&
          (confirmingReversal ? (
            <span className="flex items-center gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setConfirmingReversal(false)}
                disabled={pending}
              >
                Renunta
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={storno}
                disabled={pending}
              >
                {pending ? "Se storneaza..." : "Confirm stornarea"}
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="btn-danger"
              onClick={() => setConfirmingReversal(true)}
              disabled={pending}
            >
              Storneaza
            </button>
          ))}
      </div>

      {confirmingReversal && (
        <p className="text-xs text-ink-500 lg:max-w-xs lg:text-right">
          Se emite o factura noua, cu valori negative si numar propriu. Factura
          curenta ramane in evidenta, marcata ca stornata.
        </p>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
