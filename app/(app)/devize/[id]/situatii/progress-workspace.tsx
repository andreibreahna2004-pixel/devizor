"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { invoiceProgressReport, saveProgress } from "@/app/actions/progress";
import { FormError, FormSuccess } from "@/components/form-feedback";
import { formatLei, formatQty, round2, round4 } from "@/lib/money";
import { computeEstimateLine } from "@/lib/pricing/calculator";

/**
 * Introducerea unei situatii de lucrari.
 *
 * Cantitatile se pot da in doua feluri: direct, sau ca procent din restul de
 * executat. Pe santier se masoara si asa, si asa — un zidar spune "am terminat
 * fundatia", nu "am turnat 18,5 mc".
 */

interface LineState {
  estimateLineId: string;
  code: string | null;
  name: string;
  unit: string;
  contracted: number;
  previouslyDone: number;
  currentQuantity: number;
  /**
   * Componentele se tin separat, nu doar suma lor: valoarea liniei e suma
   * materialului si a manoperei rotunjite fiecare in parte, nu produsul
   * cantitatii cu pretul intreg. Vezi `valoareLinie`.
   */
  materialUnitPrice: number;
  laborUnitPrice: number;
  unitPrice: number;
}

/**
 * Valoarea unei linii de situatie, prin acelasi motor ca serverul.
 *
 * `cantitate × unitPrice` pare acelasi lucru si nu este: motorul rotunjeste
 * material si manopera separat, apoi le aduna, iar pretul intreg e deja rotunjit
 * la patru zecimale. Pe preturi cu zecimale (12,345 + 7,895 la trei bucati) cele
 * doua formule dau 60,73 fata de 60,72 — un ban pe linie, care se aduna peste
 * toate liniile. Omul ar vedea in ecran un total, iar in situatia salvata altul.
 */
function valoareLinie(line: LineState, cantitate: number): number {
  return computeEstimateLine({
    quantity: cantitate,
    materialUnitPrice: line.materialUnitPrice,
    laborUnitPrice: line.laborUnitPrice,
  }).total;
}

interface PendingReport {
  id: string;
  fullNumber: string;
  netTotal: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStart(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

export function ProgressWorkspace({
  estimateId,
  hasClient,
  separat,
  lines,
  pendingReport,
}: {
  estimateId: string;
  hasClient: boolean;
  separat: boolean;
  lines: LineState[];
  pendingReport: PendingReport | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [periodStart, setPeriodStart] = useState(monthStart());
  const [periodEnd, setPeriodEnd] = useState(today());
  const [notes, setNotes] = useState("");
  const [scope, setScope] = useState<"TOT" | "MATERIALE" | "MANOPERA">("TOT");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Aceeasi insumare ca pe server: valori de linie din motor, adunate si
  // rotunjite la final.
  const total = useMemo(
    () =>
      round2(
        lines.reduce(
          (sum, line) => sum + valoareLinie(line, quantities[line.estimateLineId] ?? 0),
          0,
        ),
      ),
    [lines, quantities],
  );

  const entered = Object.values(quantities).filter((q) => q > 0).length;

  function setQuantity(line: LineState, value: number) {
    const remaining = round4(line.contracted - line.previouslyDone);
    const clamped = Math.max(0, Math.min(value, remaining));
    setQuantities((prev) => ({ ...prev, [line.estimateLineId]: clamped }));
    setMessage(null);
  }

  /** Completeaza toate liniile cu acelasi procent din restul de executat. */
  function fillPercent(percent: number) {
    const next: Record<string, number> = {};
    for (const line of lines) {
      const remaining = round4(line.contracted - line.previouslyDone);
      if (remaining > 0) next[line.estimateLineId] = round4((remaining * percent) / 100);
    }
    setQuantities(next);
    setMessage(null);
  }

  function save(thenInvoice: boolean) {
    setError(null);
    setMessage(null);

    startTransition(async () => {
      const result = await saveProgress({
        estimateId,
        periodStart,
        periodEnd,
        notes: notes.trim() || null,
        lines: Object.entries(quantities)
          .filter(([, q]) => q > 0)
          .map(([estimateLineId, quantity]) => ({ estimateLineId, quantity })),
      });

      if (!result.ok || !result.reportId) {
        setError(result.error ?? "Salvarea a esuat");
        return;
      }

      if (!thenInvoice) {
        setQuantities({});
        setOpen(false);
        setMessage("Situatia a fost salvata.");
        router.refresh();
        return;
      }

      const invoiced = await invoiceProgressReport({
        reportId: result.reportId,
        scope,
      });
      if (!invoiced.ok || !invoiced.invoiceId) {
        setError(
          `Situatia s-a salvat, dar factura nu a putut fi emisa: ${invoiced.error ?? "eroare necunoscuta"}`,
        );
        router.refresh();
        return;
      }

      router.push(`/facturi/${invoiced.invoiceId}`);
    });
  }

  if (!open) {
    return (
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-ink-900">Situatie noua</h2>
            <p className="mt-0.5 text-sm text-ink-500">
              Introdu cantitatile executate in perioada curenta.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary w-full sm:w-auto"
            onClick={() => setOpen(true)}
          >
            Adauga situatie
          </button>
        </div>
        {message && <div className="mt-3"><FormSuccess message={message} /></div>}
        {pendingReport && (
          <p className="mt-3 text-sm text-amber-800">
            Situatia {pendingReport.fullNumber} e inca ciorna, in valoare de{" "}
            {formatLei(pendingReport.netTotal)} lei.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3.5 sm:px-5">
        <h2 className="font-semibold text-ink-900">Situatie noua</h2>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Renunta
        </button>
      </header>

      <div className="space-y-4 p-4 sm:p-5">
        {error && <FormError message={error} />}

        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="grid grid-cols-2 gap-3 sm:contents">
            <div>
              <label className="label" htmlFor="periodStart">
                De la
              </label>
              <input
                id="periodStart"
                type="date"
                className="input"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="periodEnd">
                Pana la
              </label>
              <input
                id="periodEnd"
                type="date"
                className="input"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>

          <div className="sm:ml-auto sm:flex sm:items-end sm:gap-2">
            <span className="block pb-2 text-sm text-ink-500">
              Completeaza rapid:
            </span>
            {/* Pe telefon cele trei procente stau intr-un rand de butoane egale;
                "din rest" pica, ca sa incapa toate trei fara sa se rupa randul. */}
            <div className="grid grid-cols-3 gap-2 sm:contents">
              {[25, 50, 100].map((percent) => (
                <button
                  key={percent}
                  type="button"
                  className="btn-secondary"
                  onClick={() => fillPercent(percent)}
                >
                  {percent}%<span className="hidden sm:inline"> din rest</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn-ghost mt-2 w-full sm:mt-0 sm:w-auto"
              onClick={() => setQuantities({})}
            >
              Goleste
            </button>
          </div>
        </div>
      </div>

      {/* Pe telefon fiecare articol e un card: contractat / executat / rest sunt
          cifrele dupa care omul decide cat scrie acum, deci raman toate trei
          langa campul de introdus, nu la capatul unei derulari orizontale. */}
      <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)] md:hidden">
        {lines.map((line) => {
          const remaining = round4(line.contracted - line.previouslyDone);
          const current = quantities[line.estimateLineId] ?? 0;
          const done = remaining <= 0;

          return (
            <li
              key={line.estimateLineId}
              className={`p-4 ${done ? "opacity-50" : ""}`}
            >
              <p className="text-sm text-ink-900">{line.name}</p>
              {line.code && (
                <p className="tabular mt-0.5 text-xs text-ink-500">{line.code}</p>
              )}

              <dl className="mt-2.5 space-y-1">
                <div className="camp">
                  <dt>Contractat</dt>
                  <dd>
                    {formatQty(line.contracted)} {line.unit}
                  </dd>
                </div>
                <div className="camp">
                  <dt>Executat</dt>
                  <dd>{formatQty(line.previouslyDone)}</dd>
                </div>
                <div className="camp">
                  <dt>Rest</dt>
                  <dd>{formatQty(remaining)}</dd>
                </div>
              </dl>

              <div className="mt-3 flex items-end justify-between gap-3">
                <label className="min-w-0 flex-1">
                  <span className="mb-0.5 block text-xs text-ink-500">
                    Executat acum
                  </span>
                  {done ? (
                    <span className="block text-sm text-ink-400">executat</span>
                  ) : (
                    <QuantityInput
                      value={current}
                      max={remaining}
                      disabled={false}
                      className="w-full"
                      onChange={(value) => setQuantity(line, value)}
                    />
                  )}
                </label>
                <p className="tabular shrink-0 pb-2 text-sm font-semibold text-ink-900">
                  {current > 0 ? `${formatLei(valoareLinie(line, current))} lei` : "—"}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto border-t border-[var(--border)] md:block">
        <table className="w-full min-w-[860px]">
          <thead className="border-b border-[var(--border)] bg-ink-50">
            <tr>
              <th className="th">Articol</th>
              <th className="th w-16">U.M.</th>
              <th className="th w-24 text-right">Contractat</th>
              <th className="th w-24 text-right">Executat</th>
              <th className="th w-24 text-right">Rest</th>
              <th className="th w-28 text-right">Acum</th>
              <th className="th w-28 text-right">Valoare</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {lines.map((line) => {
              const remaining = round4(line.contracted - line.previouslyDone);
              const current = quantities[line.estimateLineId] ?? 0;
              const done = remaining <= 0;

              return (
                <tr key={line.estimateLineId} className={done ? "opacity-50" : undefined}>
                  <td className="td">
                    <span className="text-ink-900">{line.name}</span>
                    {line.code && (
                      <span className="ml-2 text-xs text-ink-500">{line.code}</span>
                    )}
                  </td>
                  <td className="td text-ink-600">{line.unit}</td>
                  <td className="td tabular text-right text-ink-600">
                    {formatQty(line.contracted)}
                  </td>
                  <td className="td tabular text-right text-ink-600">
                    {formatQty(line.previouslyDone)}
                  </td>
                  <td className="td tabular text-right text-ink-600">
                    {formatQty(remaining)}
                  </td>
                  <td className="td text-right">
                    <QuantityInput
                      value={current}
                      max={remaining}
                      disabled={done}
                      onChange={(value) => setQuantity(line, value)}
                    />
                  </td>
                  <td className="td tabular text-right font-medium">
                    {current > 0 ? formatLei(valoareLinie(line, current)) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-4 border-t border-[var(--border)] p-4 sm:p-5 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
        <div className="lg:min-w-64 lg:flex-1">
          <label className="label" htmlFor="notes">
            Observatii
          </label>
          <input
            id="notes"
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex: receptionat de dirigintele de santier pe 28.03"
          />
        </div>

        <div className="lg:text-right">
          <p className="text-sm text-ink-500">
            {entered} {entered === 1 ? "linie" : "linii"} · valoare fara TVA
          </p>
          <p className="tabular text-2xl font-semibold text-ink-900">
            {formatLei(total)} lei
          </p>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
          {separat && (
            <div>
              <label className="label" htmlFor="invoiceScope">
                Factura pentru
              </label>
              <select
                id="invoiceScope"
                className="input"
                value={scope}
                onChange={(e) =>
                  setScope(e.target.value as "TOT" | "MATERIALE" | "MANOPERA")
                }
              >
                <option value="TOT">tot</option>
                <option value="MATERIALE">materiale</option>
                <option value="MANOPERA">manopera</option>
              </select>
            </div>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => save(false)}
            disabled={pending || entered === 0}
          >
            {pending ? "Se salveaza..." : "Salveaza situatia"}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => save(true)}
            disabled={pending || entered === 0 || !hasClient}
            title={hasClient ? undefined : "Devizul nu are beneficiar"}
          >
            Salveaza si factureaza
          </button>
        </div>
      </div>
    </div>
  );
}

function QuantityInput({
  value,
  max,
  disabled,
  className,
  onChange,
}: {
  value: number;
  max: number;
  disabled: boolean;
  className?: string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  if (disabled) {
    return <span className="text-sm text-ink-400">executat</span>;
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      className={`cell-input tabular text-right ${className ?? "w-24"} ${
        value > 0 ? "border-brand-400 bg-brand-50" : ""
      }`}
      value={draft ?? (value > 0 ? formatQty(value) : "")}
      placeholder="0"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft === null) return;
        const text = draft.trim();
        if (text === "") {
          onChange(0);
        } else {
          const parsed = Number(text.replace(/\./g, "").replace(",", "."));
          if (Number.isFinite(parsed) && parsed >= 0) onChange(Math.min(parsed, max));
        }
        setDraft(null);
      }}
    />
  );
}
