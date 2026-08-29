"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { PriceTrend } from "@/components/charts/price-trend";
import { formatLei } from "@/lib/money";

/**
 * Cautarea materialelor si reperele lor de pret.
 *
 * Fiecare pret isi poarta provenienta: data la care a fost observat, furnizorul,
 * si daca e din judetul cerut sau o medie pe tara. Un reper national prezentat ca
 * local ar minti despre piata omului.
 */

export interface MaterialRow {
  id: string;
  name: string;
  unit: string;
  pret: number | null;
  national: boolean;
  observedAt: string | null;
  supplier: string | null;
  sourceUrl: string | null;
  evolutie: (number | null)[];
}

const DATA = new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "short", year: "numeric" });

export function MaterialSearch({
  q,
  judet,
  judete,
  materiale,
}: {
  q: string;
  judet: string;
  judete: { code: string; name: string }[];
  materiale: MaterialRow[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(q);

  function cauta(nextQ: string, nextJudet: string) {
    const p = new URLSearchParams(params.toString());
    if (nextQ) p.set("q", nextQ);
    else p.delete("q");
    if (nextJudet) p.set("judet", nextJudet);
    else p.delete("judet");
    startTransition(() => router.push(`/materiale?${p.toString()}`));
  }

  return (
    <div className="space-y-5">
      <form
        className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          cauta(text.trim(), judet);
        }}
      >
        <div className="flex-1">
          <label className="label" htmlFor="q">
            Cauta un material
          </label>
          <input
            id="q"
            className="input"
            value={text}
            placeholder="ciment, adeziv gresie, polistiren"
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <div className="sm:w-56">
          <label className="label" htmlFor="judet">
            Judetul lucrarii
          </label>
          <select
            id="judet"
            className="input"
            value={judet}
            onChange={(e) => cauta(text.trim(), e.target.value)}
          >
            <option value="">Toata tara</option>
            {judete.map((j) => (
              <option key={j.code} value={j.code}>
                {j.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary sm:w-auto" disabled={pending}>
          {pending ? "Se cauta..." : "Cauta"}
        </button>
      </form>

      {materiale.length === 0 ? (
        <div className="card p-8 text-center sm:p-12">
          <p className="text-sm text-ink-500">
            {q
              ? "Niciun material care sa se potriveasca."
              : "Catalogul e gol. Incarca o lista de preturi de la furnizor ca sa apara ceva aici."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {materiale.map((m) => (
            <li key={m.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-900">{m.name}</p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    lei / {m.unit}
                    {m.supplier && ` · ${m.supplier}`}
                    {m.observedAt && ` · ${DATA.format(new Date(m.observedAt))}`}
                  </p>
                  {m.national && m.pret !== null && (
                    // Se spune raspicat: nu e pretul zonei, e media pe tara.
                    <p className="mt-1 text-xs text-amber-700">
                      Judetul n-are observatii — pret pe toata tara.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <PriceTrend valori={m.evolutie} id={`t-${m.id}`} />
                  <span className="tabular w-24 text-right text-sm font-semibold text-ink-900">
                    {m.pret === null ? "—" : formatLei(m.pret)}
                  </span>
                </div>
              </div>

              {m.sourceUrl && (
                <a
                  href={m.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link mt-2 inline-block text-xs"
                >
                  vezi pretul la sursa
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
