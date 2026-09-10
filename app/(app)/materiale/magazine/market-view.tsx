"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { formatLei } from "@/lib/money";

/**
 * Reperul de piata pe materialele unei lucrari.
 *
 * Regula de afisare, care e tot rostul paginii: **cifra nu apare niciodata
 * singura.** Langa ea stau intervalul, cate magazine au dat un pret, si cat de
 * vechi e cel mai vechi element. O mediana pe patru magazine, aratata fara
 * imprastiere, e exact media necinstita pe care modulul de agregare exista sa
 * n-o produca. Vezi antetul din `lib/materials/agregat.ts`.
 *
 * De aia tipurile de mai jos duc si `imprastiereMare`, si `nrMagazine`, si
 * `altaUnitate`: nu sunt podoabe de interfata, sunt contract.
 */

export interface FeliaMagazinRow {
  magazin: string;
  mediana: number;
  min: number;
  max: number;
  nr: number;
  observedAt: string;
  exemplu: { name: string; price: number; sourceUrl: string | null };
}

export interface AgregatRow {
  unit: string;
  /** Fals cand e alta unitate decat cea pe care o asteapta termenul. */
  asteptata: boolean;
  mediana: number;
  min: number;
  max: number;
  imprastiere: number;
  imprastiereMare: boolean;
  nrMagazine: number;
  nrObservatii: number;
  celMaiVechi: string;
  celMaiNou: string;
  altaUnitate: { unit: string; nr: number }[];
  magazine: FeliaMagazinRow[];
}

export interface RandTermen {
  termen: string;
  um: string;
  material: string;
  laMagazin: boolean;
  motiv?: string;
  /** Lucrarile care cer materialul asta. */
  lucrari: string[];
  agregate: AgregatRow[];
}

const DATA = new Intl.DateTimeFormat("ro-RO", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const zi = (iso: string) => DATA.format(new Date(iso));

export function MarketView({
  q,
  randuri,
  lucrari,
}: {
  q: string;
  randuri: RandTermen[];
  lucrari: string[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(q);
  const [deschis, setDeschis] = useState<string | null>(null);

  function cauta(next: string) {
    const p = new URLSearchParams(params.toString());
    if (next) p.set("q", next);
    else p.delete("q");
    startTransition(() => router.push(`/materiale/magazine?${p.toString()}`));
  }

  return (
    <div className="space-y-5">
      <form
        className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          cauta(text.trim());
        }}
      >
        <div className="flex-1">
          <label className="label" htmlFor="q">
            Ce lucrare faci
          </label>
          <input
            id="q"
            className="input"
            value={text}
            placeholder="gresie, termosistem, rigips, parchet"
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary sm:w-auto" disabled={pending}>
          {pending ? "Se cauta..." : "Cauta"}
        </button>
      </form>

      {lucrari.length > 0 && (
        <p className="text-xs text-ink-500">
          Materialele din: {lucrari.join(", ")}.
        </p>
      )}

      {randuri.length === 0 ? (
        <div className="card p-8 text-center sm:p-12">
          <p className="text-sm text-ink-500">
            {q
              ? "Nu s-a gasit nicio lucrare pentru cautarea asta. Scrie cum ii spui pe santier: rigips, termopan, termosistem."
              : "Scrie o lucrare si se arata cat cere piata pentru materialele care intra in ea."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {randuri.map((r) => {
            const cheie = `${r.termen}|${r.um}`;
            const principal = r.agregate[0];
            const esteDeschis = deschis === cheie;

            return (
              <li key={cheie} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-900">{r.material}</p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      cautat ca &quot;{r.termen}&quot; · lei / {r.um}
                    </p>

                    {!r.laMagazin ? (
                      // Nu un agregat gol: gol se citeste "n-am gasit azi", cand
                      // adevarul e "nu ne uitam acolo".
                      <p className="mt-1 text-xs text-ink-500">
                        Nu se urmareste la magazinele astea: {r.motiv}.
                      </p>
                    ) : !principal ? (
                      <p className="mt-1 text-xs text-ink-500">
                        Nicio observatie in fereastra de comparatie. Ruleaza
                        trecerea zilnica sau cauta materialul in tabul Preturi.
                      </p>
                    ) : (
                      <div className="mt-1 space-y-1">
                        {!principal.asteptata && (
                          <p className="text-xs text-amber-700">
                            Gasit pe {principal.unit}, nu pe {r.um}. E alta baza de
                            masura, nu un pret mai mare.
                          </p>
                        )}

                        {principal.nrMagazine === 1 ? (
                          // Un pret, de la un magazin, nu o piata.
                          <p className="text-xs text-amber-700">
                            Un singur magazin ({principal.magazine[0]?.magazin}):
                            e un pret, nu o piata.
                          </p>
                        ) : (
                          <p className="text-xs text-ink-500">
                            {principal.nrMagazine} magazine,{" "}
                            {principal.nrObservatii} produse
                          </p>
                        )}

                        {principal.imprastiereMare && (
                          // Peste prag, cifra din mijloc nu descrie nimic: se
                          // conduce cu intervalul.
                          <p className="text-xs text-amber-700">
                            Imprastiere {principal.imprastiere}x, deci termenul prinde
                            marfa prea diferita. Citeste intervalul, nu mijlocul.
                          </p>
                        )}

                        {principal.altaUnitate.length > 0 && (
                          <p className="text-xs text-ink-500">
                            N-au intrat, fiind pe alta unitate:{" "}
                            {principal.altaUnitate
                              .map((a) => `${a.nr} pe ${a.unit}`)
                              .join(", ")}
                            .
                          </p>
                        )}

                        <p className="text-xs text-ink-500">
                          observat {zi(principal.celMaiVechi)}
                          {principal.celMaiVechi !== principal.celMaiNou &&
                            ` ... ${zi(principal.celMaiNou)}`}
                        </p>
                      </div>
                    )}
                  </div>

                  {principal && (
                    <div className="text-right">
                      <p className="tabular text-sm font-semibold text-ink-900">
                        {formatLei(principal.mediana)}
                      </p>
                      <p className="tabular mt-0.5 text-xs text-ink-500">
                        {formatLei(principal.min)} … {formatLei(principal.max)}
                      </p>
                    </div>
                  )}
                </div>

                {principal && (
                  <>
                    <button
                      type="button"
                      className="mt-3 text-xs font-medium text-brand-700 hover:underline"
                      aria-expanded={esteDeschis}
                      onClick={() => setDeschis(esteDeschis ? null : cheie)}
                    >
                      {esteDeschis ? "Ascunde magazinele" : "Vezi pe magazine"}
                    </button>

                    {esteDeschis && (
                      <ul className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
                        {principal.magazine.map((m) => (
                          <li
                            key={m.magazin}
                            className="flex flex-wrap items-start justify-between gap-3"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-ink-800">
                                {m.magazin}
                                <span className="font-normal text-ink-500">
                                  {" "}
                                  · {m.nr} {m.nr === 1 ? "produs" : "produse"} ·{" "}
                                  {zi(m.observedAt)}
                                </span>
                              </p>
                              {/* Cifra trebuie sa se poata verifica pe un produs
                                  adevarat, cu link la sursa. */}
                              <p className="mt-0.5 truncate text-xs text-ink-500">
                                {m.exemplu.sourceUrl ? (
                                  <a
                                    href={m.exemplu.sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-brand-700 hover:underline"
                                  >
                                    {m.exemplu.name}
                                  </a>
                                ) : (
                                  m.exemplu.name
                                )}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="tabular text-xs font-semibold text-ink-900">
                                {formatLei(m.mediana)}
                              </p>
                              {m.nr > 1 && (
                                <p className="tabular text-xs text-ink-500">
                                  {formatLei(m.min)} … {formatLei(m.max)}
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
