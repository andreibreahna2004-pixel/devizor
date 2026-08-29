"use client";

import { useMemo, useState } from "react";
import { calculeazaConsum, cereAlegere } from "@/lib/consum/calcul";
import { type Reteta, cautaRetete } from "@/lib/consum";
import { formatQty } from "@/lib/money";

/**
 * Calculul ruleaza in browser, cu acelasi modul ca serverul: ce vezi in timp ce
 * tastezi e ce iese. Acelasi tipar ca editorul de deviz.
 */

export function ConsumCalculator({
  retete,
  categorii,
}: {
  retete: Reteta[];
  categorii: string[];
}) {
  const [cautare, setCautare] = useState("");
  const [alesId, setAlesId] = useState<string | null>(null);
  const [cantitate, setCantitate] = useState("10");
  const [grosime, setGrosime] = useState("");
  const [varianta, setVarianta] = useState("");
  const [rezerva, setRezerva] = useState("");

  const gasite = useMemo(() => cautaRetete(cautare, 200), [cautare]);
  const ales = useMemo(() => retete.find((r) => r.id === alesId) ?? null, [retete, alesId]);

  function alege(reteta: Reteta) {
    setAlesId(reteta.id);
    setVarianta(reteta.parametru?.optiuni?.[0] ?? "");
    setGrosime(reteta.parametru?.implicit ? String(reteta.parametru.implicit) : "");
    setRezerva(String(reteta.rezervaImplicita));
  }

  const optiuni = {
    cantitate: Number(cantitate.replace(",", ".")) || 0,
    grosime: grosime ? Number(grosime.replace(",", ".")) : undefined,
    varianta: varianta || undefined,
    rezervaProcent: Number(rezerva.replace(",", ".")) || 0,
  };

  const rezultate = ales ? calculeazaConsum(ales, optiuni) : [];
  const lipsesteAlegerea = ales ? cereAlegere(ales, optiuni) : false;

  return (
    <div className="space-y-5">
      <div className="card p-4">
        <label className="label" htmlFor="cautare">Cauta lucrarea</label>
        <input
          id="cautare"
          className="input"
          placeholder="gresie, tencuiala, termosistem, zidarie..."
          value={cautare}
          onChange={(e) => setCautare(e.target.value)}
        />
        <p className="mt-2 text-xs text-ink-500">
          {gasite.length} din {retete.length} lucrari, in {categorii.length} capitole.
        </p>
      </div>

      {!ales && (
        <ul className="space-y-2">
          {gasite.map((reteta) => (
            <li key={reteta.id}>
              <button
                type="button"
                onClick={() => alege(reteta)}
                className="card flex w-full items-center justify-between gap-4 p-3 text-left transition-colors hover:border-brand-600"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink-900">{reteta.denumire}</span>
                  <span className="block text-xs text-ink-500">
                    {reteta.categorie} · {reteta.materiale.length} materiale
                  </span>
                  {/* Termenii de santier, scrisi la vedere: asa se recunoaste
                      lucrarea dintr-o privire, fara sa descifrezi titlul oficial.
                      Treapta 500, nu 400: e text care se citeste. */}
                  <span className="mt-0.5 block truncate text-xs text-ink-500">
                    {reteta.sinonime.slice(0, 4).join(", ")}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-ink-500">per {reteta.um}</span>
              </button>
            </li>
          ))}
          {gasite.length === 0 && (
            <li className="card p-8 text-center text-sm text-ink-500">
              Nicio lucrare pentru &quot;{cautare}&quot;. Incearca alt cuvint.
            </li>
          )}
        </ul>
      )}

      {ales && (
        <div className="space-y-5">
          <div className="card space-y-4 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-ink-900">{ales.denumire}</h2>
                <p className="mt-0.5 text-xs text-ink-500">
                  {ales.categorie} · {ales.sinonime.join(", ")}
                </p>
              </div>
              <button type="button" className="link text-sm" onClick={() => setAlesId(null)}>
                alege alta lucrare
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="cantitate">Cantitate ({ales.um})</label>
                <input
                  id="cantitate"
                  className="input tabular"
                  inputMode="decimal"
                  value={cantitate}
                  onChange={(e) => setCantitate(e.target.value)}
                />
              </div>

              {ales.parametru?.cheie === "grosime" && (
                <div>
                  <label className="label" htmlFor="grosime">
                    {ales.parametru.eticheta} ({ales.parametru.sufix ?? "mm"})
                  </label>
                  <input
                    id="grosime"
                    className="input tabular"
                    inputMode="decimal"
                    value={grosime}
                    onChange={(e) => setGrosime(e.target.value)}
                  />
                </div>
              )}

              {ales.parametru?.cheie === "varianta" && (
                <div>
                  <label className="label" htmlFor="varianta">{ales.parametru.eticheta}</label>
                  <select
                    id="varianta"
                    className="input"
                    value={varianta}
                    onChange={(e) => setVarianta(e.target.value)}
                  >
                    <option value="">alege</option>
                    {ales.parametru.optiuni?.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="label" htmlFor="rezerva">Rezerva (%)</label>
                <input
                  id="rezerva"
                  className="input tabular"
                  inputMode="decimal"
                  value={rezerva}
                  onChange={(e) => setRezerva(e.target.value)}
                />
              </div>
            </div>

            {ales.nota && <p className="text-xs text-ink-500">{ales.nota}</p>}
          </div>

          {lipsesteAlegerea ? (
            <div className="card p-6 text-center text-sm text-ink-500">
              Alege {ales.parametru?.eticheta.toLowerCase()} ca sa se poata calcula.
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs text-ink-500">
                    <th className="p-3 font-medium">Material</th>
                    <th className="p-3 text-right font-medium">Necesar</th>
                    <th className="p-3 text-right font-medium">De cumparat</th>
                    <th className="p-3 font-medium">Sursa</th>
                  </tr>
                </thead>
                <tbody>
                  {rezultate.map((m) => (
                    <tr key={m.denumire} className="border-b border-[var(--border)] last:border-0">
                      <td className="p-3">
                        <span className="block text-ink-900">{m.denumire}</span>
                        {m.nota && <span className="mt-0.5 block text-xs text-ink-500">{m.nota}</span>}
                      </td>
                      <td className="tabular whitespace-nowrap p-3 text-right text-ink-900">
                        {formatQty(m.min)}
                        {m.max !== m.min && <> – {formatQty(m.max)}</>} {m.um}
                      </td>
                      <td className="tabular whitespace-nowrap p-3 text-right font-medium text-ink-900">
                        {m.ambalajeMin === null ? (
                          <span className="text-ink-400">—</span>
                        ) : (
                          <>
                            {m.ambalajeMin}
                            {m.ambalajeMax !== m.ambalajeMin && <> – {m.ambalajeMax}</>}
                            <span className="block text-xs font-normal text-ink-500">{m.ambalajUm}</span>
                          </>
                        )}
                      </td>
                      <td className="p-3">
                        {m.sursa.startsWith("https://") ? (
                          <a className="link text-xs" href={m.sursa} target="_blank" rel="noreferrer noopener">
                            fisa producatorului
                          </a>
                        ) : (
                          <span className="text-xs text-amber-700">practica curenta</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-ink-500">
            Cantitatile includ rezerva de {optiuni.rezervaProcent}%. Ambalajele se
            rotunjesc in sus. Cifrele sunt repere: fisa tehnica a produsului
            cumparat are ultimul cuvint.
          </p>
        </div>
      )}
    </div>
  );
}
