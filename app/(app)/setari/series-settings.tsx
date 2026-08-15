"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveSeries } from "@/app/actions/records";
import { FormError, FormSuccess } from "@/components/form-feedback";

const LABELS: Record<string, string> = {
  DEVIZ: "Devize",
  FACTURA: "Facturi",
  PROFORMA: "Proforme",
  SITUATIE: "Situatii de lucrari",
};

export function SeriesSettings({
  series,
  canManage,
}: {
  series: { kind: string; series: string; nextNumber: number }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    setSaved(null);
    startTransition(async () => {
      const result = await saveSeries(formData);
      if (!result.ok) {
        setError(result.error ?? Object.values(result.fieldErrors ?? {})[0] ?? "Salvarea a esuat");
        return;
      }
      setSaved("Seria a fost salvata.");
      router.refresh();
    });
  }

  return (
    <section className="card p-5">
      <h2 className="font-semibold text-ink-900">Serii si numerotare</h2>
      <p className="mt-0.5 max-w-2xl text-xs text-ink-500">
        Numerele se aloca automat, in ordine, fara goluri. Numarul urmator poate fi
        marit — de exemplu cand continui o numerotare dintr-un alt program — dar nu
        poate fi micsorat, pentru ca ar produce duplicate.
      </p>

      <div className="mt-4 space-y-3">
        <FormError message={error ?? undefined} />
        {saved && <FormSuccess message={saved} />}

        {series.map((entry) => (
          <form
            key={`${entry.kind}-${entry.series}`}
            action={submit}
            className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap"
          >
            <input type="hidden" name="kind" value={entry.kind} />
            <div className="sm:w-40">
              <label className="label">{LABELS[entry.kind] ?? entry.kind}</label>
              <input
                name="series"
                className="input"
                defaultValue={entry.series}
                disabled={!canManage}
              />
            </div>
            <div className="sm:w-32">
              <label className="label">Urmatorul nr.</label>
              <input
                name="nextNumber"
                inputMode="numeric"
                className="input tabular"
                defaultValue={entry.nextNumber}
                disabled={!canManage}
              />
            </div>
            {canManage && (
              <button
                type="submit"
                className="btn-secondary col-span-2 sm:col-span-1"
                disabled={pending}
              >
                Salveaza
              </button>
            )}
          </form>
        ))}
      </div>
    </section>
  );
}
