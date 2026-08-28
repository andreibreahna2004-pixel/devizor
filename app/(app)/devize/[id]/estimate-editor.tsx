"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addEstimateLineManual,
  addSuggestion,
  deleteEstimateLine,
  dismissSuggestion,
  saveEstimateLines,
  searchNormeAction,
  updateEstimateVatRate,
} from "@/app/actions/estimates";
import { ConfidenceBadge } from "@/components/status-badge";
import { consumeEventStream } from "@/lib/event-stream";
import { formatLei, formatQty } from "@/lib/money";
import type { Norma } from "@/lib/norme";
import { computeEstimateLine, computeEstimateTotals } from "@/lib/pricing/calculator";

/**
 * Editorul de deviz.
 *
 * Totul de pe linie se scrie de mana: denumirea, unitatea, cantitatea si
 * pretul. Nu exista catalog din care sa vina ceva, deci nu exista nici valori
 * care sa se schimbe in spatele omului.
 *
 * Totalurile se recalculeaza in browser cu exact acelasi motor ca pe server
 * (`lib/pricing/calculator`), deci ce vede omul in timp ce tasteaza este ce se
 * va salva. Salvarea e explicita, nu la fiecare tasta: un deviz e un document
 * financiar, iar omul trebuie sa stie cand a comis o modificare.
 */

/** O norma din indicator, rezolvata pe server pentru afisare. */
export interface NormaVariant {
  cod: string;
  denumire: string;
  /** null la Ts si RpC, unde sursa nu da unitatea. */
  um: string | null;
}

export interface EditorLine {
  id: string;
  sectionId: string | null;
  code: string | null;
  name: string;
  unit: string;
  quantity: number;
  materialUnitPrice: number;
  laborUnitPrice: number;
  equipmentUnitPrice: number;
  transportUnitPrice: number;
  aiGenerated: boolean;
  aiJustification: string | null;
  aiConfidence: "MARE" | "MEDIE" | "MICA" | null;
  reviewed: boolean;
  /**
   * Celelalte norme intre care descrierea nu departaja. Comutarea schimba doar
   * ce vine din indicator — cod, denumire, unitate — nu si cifrele.
   */
  alternatives: NormaVariant[];
}

interface Section {
  id: string;
  name: string;
}

/** O linie optionala propusa de AI. Traieste in baza de date, nu doar pe ecran. */
export interface Suggestion {
  id: string;
  code: string | null;
  name: string;
  unit: string;
  /** null cind AI-ul n-a putut-o deduce: o pune omul inainte de a adauga. */
  quantity: number | null;
  reason: string;
}

export function EstimateEditor({
  estimateId,
  editable,
  aiConfigured,
  sections,
  lines: initialLines,
  suggestions,
  vatRate: initialVatRate,
}: {
  estimateId: string;
  editable: boolean;
  aiConfigured: boolean;
  sections: Section[];
  lines: EditorLine[];
  suggestions: Suggestion[];
  vatRate: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [lines, setLines] = useState(initialLines);
  const [vatRate, setVatRate] = useState(initialVatRate);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const totals = useMemo(
    () => computeEstimateTotals(lines, vatRate),
    [lines, vatRate],
  );

  const grouped = useMemo(() => {
    const map = new Map<string | null, EditorLine[]>();
    for (const line of lines) {
      const bucket = map.get(line.sectionId);
      if (bucket) bucket.push(line);
      else map.set(line.sectionId, [line]);
    }
    return map;
  }, [lines]);

  const sectionOrder: (Section | null)[] = [
    ...sections.filter((s) => grouped.has(s.id)),
    ...(grouped.has(null) ? [null] : []),
  ];

  function patchLine(id: string, patch: Partial<EditorLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    setDirty(true);
    setMessage(null);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await saveEstimateLines({
        estimateId,
        lines: lines.map((l) => ({
          id: l.id,
          name: l.name,
          unit: l.unit,
          code: l.code,
          quantity: l.quantity,
          materialUnitPrice: l.materialUnitPrice,
          laborUnitPrice: l.laborUnitPrice,
          equipmentUnitPrice: l.equipmentUnitPrice,
          transportUnitPrice: l.transportUnitPrice,
        })),
      });

      if (!result.ok) {
        setError(result.error ?? "Salvarea a esuat");
        return;
      }
      setDirty(false);
      setMessage("Modificarile au fost salvate.");
      router.refresh();
    });
  }

  function handleDelete(lineId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteEstimateLine(estimateId, lineId);
      if (!result.ok) {
        setError(result.error ?? "Stergerea a esuat");
        return;
      }
      setLines((prev) => prev.filter((l) => l.id !== lineId));
      router.refresh();
    });
  }

  function handleVatRate(next: number) {
    setVatRate(next);
    setError(null);
    startTransition(async () => {
      const result = await updateEstimateVatRate({ estimateId, vatRate: next });
      if (!result.ok) setError(result.error ?? "Cota nu a putut fi salvata");
      else router.refresh();
    });
  }

  // Lucrare, Cantitate, U.M., Pret unitar, Valoare — plus coloana de stergere.
  const columnCount = 5 + (editable ? 1 : 0);

  return (
    <div className="space-y-5">
      {editable && (
        /* Se opreste sub antetul de pe telefon (`top-14`), care e si el lipit;
           la `lg` antetul nu mai e lipit, deci bara urca la marginea de sus. */
        <div className="sticky top-14 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-glass)] px-4 py-2.5 backdrop-blur lg:top-0">
          {/* Iesirea sta in bara lipita, nu doar in antetul paginii: pe un deviz
              de saizeci de linii, calea de intoarcere trebuie sa fie la vedere
              fara sa derulezi pina sus. */}
          <div className="flex items-center gap-3">
            <Link href="/devize" className="link text-sm whitespace-nowrap">
              ← Devize
            </Link>
            <p className="text-sm text-ink-600">
              {dirty ? "Ai modificari nesalvate" : "Toate modificarile sunt salvate"}
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
            {message && <span className="text-sm text-emerald-700">{message}</span>}
            {error && <span className="text-sm text-red-700">{error}</span>}
            <button
              type="button"
              className="btn-primary w-full sm:w-auto"
              onClick={handleSave}
              disabled={!dirty || pending}
            >
              {pending ? "Se salveaza..." : "Salveaza modificarile"}
            </button>
          </div>
        </div>
      )}

      {lines.length === 0 ? (
        <div className="card p-8 text-center sm:p-12">
          <p className="text-sm text-ink-500">
            Devizul nu are nicio linie. Adauga prima lucrare mai jos.
          </p>
        </div>
      ) : (
        sectionOrder.map((section) => {
          const sectionLines = grouped.get(section?.id ?? null) ?? [];
          const sectionTotal = sectionLines.reduce(
            (sum, line) => sum + computeEstimateLine(line).total,
            0,
          );

          return (
            <section key={section?.id ?? "fara-sectiune"} className="card overflow-hidden">
              <header className="flex items-center justify-between border-b border-[var(--border)] bg-ink-50 px-4 py-2.5">
                <h2 className="text-sm font-semibold text-ink-900">
                  {section?.name ?? "Alte lucrari"}
                </h2>
                <span className="tabular text-sm font-medium text-ink-700">
                  {formatLei(sectionTotal)} lei
                </span>
              </header>

              {/* Pe telefon linia devine card. Tabelul are noua coloane; la
                  375px asta inseamna sa derulezi lateral peste fiecare linie ca
                  sa ajungi la pretul pe care il corectezi — adica exact lucrul
                  pentru care ai deschis editorul. */}
              <ul className="divide-y divide-[var(--border)] md:hidden">
                {sectionLines.map((line) => (
                  <li key={line.id}>
                    <LineCard
                      line={line}
                      editable={editable}
                      pending={pending}
                      open={expanded === line.id}
                      onToggle={() =>
                        setExpanded(expanded === line.id ? null : line.id)
                      }
                      onPatch={(patch) => patchLine(line.id, patch)}
                      onDelete={() => handleDelete(line.id)}
                    />
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[1080px]">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="th w-full">Lucrare</th>
                      <th className="th w-24 text-right">Cantitate</th>
                      <th className="th w-20">U.M.</th>
                      <th className="th w-28 text-right">Pret unitar</th>
                      <th className="th w-32 text-right">Valoare</th>
                      {editable && <th className="th w-10" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {sectionLines.map((line) => {
                      const lineTotals = computeEstimateLine(line);
                      const isOpen = expanded === line.id;

                      return (
                        <Fragment key={line.id}>
                          <tr className="align-top">
                            <td className="td">
                              <TextCell
                                value={line.name}
                                editable={editable}
                                className="font-medium text-ink-900"
                                onChange={(name) => patchLine(line.id, { name })}
                              />
                              <LineMeta
                                line={line}
                                open={isOpen}
                                onToggle={() =>
                                  setExpanded(isOpen ? null : line.id)
                                }
                              />
                            </td>

                            <NumberCell
                              value={line.quantity}
                              decimals={3}
                              editable={editable}
                              onChange={(quantity) => patchLine(line.id, { quantity })}
                            />
                            <td className="td">
                              <TextCell
                                value={line.unit}
                                editable={editable}
                                className="text-ink-600"
                                onChange={(unit) => patchLine(line.id, { unit })}
                              />
                            </td>

                            {/* Suma celor patru, read-only: defalcarea se editeaza
                                in randul care se deschide sub linie. */}
                            <td className="td tabular text-right text-ink-600">
                              {formatLei(lineTotals.unitPrice)}
                            </td>

                            <td className="td tabular text-right font-medium">
                              {formatLei(lineTotals.total)}
                            </td>
                            {editable && (
                              <td className="td text-right">
                                <button
                                  type="button"
                                  onClick={() => handleDelete(line.id)}
                                  disabled={pending}
                                  title="Sterge linia"
                                  className="rounded px-1.5 py-0.5 text-ink-400 hover:bg-red-50 hover:text-red-700"
                                >
                                  ×
                                </button>
                              </td>
                            )}
                          </tr>

                          {isOpen && (
                              <tr className="bg-ink-50">
                                <td className="td" colSpan={columnCount}>
                                  <LineDetails
                                    line={line}
                                    editable={editable}
                                    onPatch={(patch) => patchLine(line.id, patch)}
                                  />
                                </td>
                              </tr>
                            )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}

      {/* Sub tot devizul, inainte de uneltele de adaugare: se citeste ca o
          prelungire a lucrarii, nu ca inca un formular. */}
      {editable && suggestions.length > 0 && (
        <OptionalLines
          estimateId={estimateId}
          suggestions={suggestions}
          sections={sections}
          onChanged={() => router.refresh()}
        />
      )}

      {editable && (
        <>
          <SpokenWork
            estimateId={estimateId}
            aiConfigured={aiConfigured}
            onFinished={() => router.refresh()}
          />
          <AddLineForm
            estimateId={estimateId}
            sections={sections}
            onAdded={() => {
              setMessage("Linia a fost adaugata.");
              router.refresh();
            }}
          />
        </>
      )}

      <Recapitulation
        totals={totals}
        vatRate={vatRate}
        editable={editable}
        onVatRateChange={handleVatRate}
      />
    </div>
  );
}

/** Codul din indicator, increderea AI-ului si comutatorul de justificare. */
function LineMeta({
  line,
  open,
  onToggle,
}: {
  line: EditorLine;
  open: boolean;
  onToggle: () => void;
}) {
  // Butonul e pe fiecare linie, nu doar pe cele venite de la AI: sub el stau
  // acum cele patru preturi, iar o linie scrisa de mina ar ramine needitabila.
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-500">
      {line.code && <span className="tabular">{line.code}</span>}
      {line.aiGenerated && !line.reviewed && (
        <ConfidenceBadge confidence={line.aiConfidence} />
      )}
      <button type="button" onClick={onToggle} className="link">
        {open ? "ascunde" : "preturi si detalii"}
      </button>
    </div>
  );
}

/** Justificarea cantitatii si normele intre care descrierea nu a departajat. */
function LineDetails({
  line,
  editable,
  onPatch,
}: {
  line: EditorLine;
  editable: boolean;
  onPatch: (patch: Partial<EditorLine>) => void;
}) {
  const hasNotes = Boolean(line.aiJustification) || line.alternatives.length > 0;

  return (
    <>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-4">
        <CardField label="Material">
          <NumberInput
            value={line.materialUnitPrice}
            decimals={2}
            editable={editable}
            className="w-full text-right"
            onChange={(materialUnitPrice) => onPatch({ materialUnitPrice })}
          />
        </CardField>
        <CardField label="Manopera">
          <NumberInput
            value={line.laborUnitPrice}
            decimals={2}
            editable={editable}
            className="w-full text-right"
            onChange={(laborUnitPrice) => onPatch({ laborUnitPrice })}
          />
        </CardField>
        <CardField label="Utilaj">
          <NumberInput
            value={line.equipmentUnitPrice}
            decimals={2}
            editable={editable}
            className="w-full text-right"
            onChange={(equipmentUnitPrice) => onPatch({ equipmentUnitPrice })}
          />
        </CardField>
        <CardField label="Transport">
          <NumberInput
            value={line.transportUnitPrice}
            decimals={2}
            editable={editable}
            className="w-full text-right"
            onChange={(transportUnitPrice) => onPatch({ transportUnitPrice })}
          />
        </CardField>
      </div>

      {hasNotes && <div className="mt-3 border-t border-[var(--border)] pt-3" />}

      {line.aiJustification && (
        <p className="text-xs leading-relaxed text-ink-600">
          <span className="font-medium text-ink-700">Cum a rezultat cantitatea:</span>{" "}
          {line.aiJustification}
        </p>
      )}

      {line.alternatives.length > 0 && (
        <NormaVariants
          variants={line.alternatives}
          current={line.code}
          editable={editable}
          onPick={(variant) =>
            onPatch({
              code: variant.cod,
              name: variant.denumire,
              // La Ts si RpC sursa nu da unitatea: ramane cea de pe linie.
              unit: variant.um ?? line.unit,
            })
          }
        />
      )}
    </>
  );
}

/**
 * Linia de deviz pe telefon.
 *
 * Ordinea campurilor e cea in care se corecteaza un deviz venit de la AI:
 * intai denumirea, apoi cantitatea, la urma pretul. Valoarea liniei sta jos, in
 * dreapta, unde ajunge ochiul dupa ce ai schimbat pretul — aceeasi pozitie ca
 * in coloana din tabel.
 */
function LineCard({
  line,
  editable,
  pending,
  open,
  onToggle,
  onPatch,
  onDelete,
}: {
  line: EditorLine;
  editable: boolean;
  pending: boolean;
  open: boolean;
  onToggle: () => void;
  onPatch: (patch: Partial<EditorLine>) => void;
  onDelete: () => void;
}) {
  const totals = computeEstimateLine(line);

  return (
    <div className="p-4">
      {/* Fara `text-sm` aici: marimea vine din `.cell-input`, care pe telefon
          urca la 16px. Un utilitar de marime pus pe element ar bate regula aia
          si campul asta singur ar mai declansa zoom-ul pe iOS. */}
      <TextCell
        value={line.name}
        editable={editable}
        multiline
        className="font-medium text-ink-900"
        onChange={(name) => onPatch({ name })}
      />
      <LineMeta line={line} open={open} onToggle={onToggle} />

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
        <CardField label="Cantitate">
          <NumberInput
            value={line.quantity}
            decimals={3}
            editable={editable}
            className="w-full text-right"
            onChange={(quantity) => onPatch({ quantity })}
          />
        </CardField>

        <CardField label="U.M.">
          <TextCell
            value={line.unit}
            editable={editable}
            className="w-full text-right text-ink-700"
            onChange={(unit) => onPatch({ unit })}
          />
        </CardField>
      </div>

      {/* Cu preturile mutate in expansiune, linia inchisa ar ramine fara nicio
          cifra de pret. Citirea clasica a unui rind de deviz o repune la loc. */}
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-2.5">
        <span className="tabular text-xs text-ink-500">
          {formatQty(line.quantity)} {line.unit} × {formatLei(totals.unitPrice)}
        </span>
        <div className="flex items-center gap-1">
          <span className="tabular text-sm font-semibold text-ink-900">
            {formatLei(totals.total)} lei
          </span>
          {editable && (
            <button
              type="button"
              onClick={onDelete}
              disabled={pending}
              aria-label={`Sterge linia ${line.name}`}
              className="-mr-2 flex h-10 w-10 items-center justify-center rounded-lg text-lg text-ink-400 active:bg-red-50 active:text-red-700"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-3 rounded-lg bg-ink-50 p-3">
          <LineDetails line={line} editable={editable} onPatch={onPatch} />
        </div>
      )}
    </div>
  );
}

/** Eticheta deasupra campului, in cardul de pe telefon. */
function CardField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-xs text-ink-500">{label}</span>
      {children}
    </label>
  );
}

const EMPTY_LINE = {
  code: null as string | null,
  name: "",
  unit: "mp",
  quantity: "",
  materialUnitPrice: "",
  laborUnitPrice: "",
  equipmentUnitPrice: "",
  transportUnitPrice: "",
};

/**
 * Adaugarea de linii pornind de la o fraza scrisa in cuvinte normale.
 *
 * Asa se lucreaza cand vii de pe santier: "am sapat 12 mc si am turnat beton",
 * nu cautand norma cu norma. Liniile se salveaza pe masura ce apar, deci o
 * intrerupere nu pierde ce a intrat pana atunci.
 */
function SpokenWork({
  estimateId,
  aiConfigured,
  onFinished,
}: {
  estimateId: string;
  aiConfigured: boolean;
  onFinished: () => void;
}) {
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [proposed, setProposed] = useState(0);
  const [question, setQuestion] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setRunning(true);
    setStatus("AI-ul cauta lucrarile in indicator...");
    setAdded([]);
    setProposed(0);
    setQuestion(null);
    setSummary(null);
    setError(null);

    try {
      const response = await fetch(`/api/devize/${estimateId}/linii`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });

      if (!response.ok || !response.body) {
        const problem = await response.json().catch(() => null);
        setError(problem?.error ?? "Adaugarea nu a putut porni.");
        return;
      }

      await consumeEventStream(response.body, (event) => {
        switch (event.type) {
          case "status":
            setStatus(event.message as string);
            break;
          case "section":
            setStatus(`Lucrez la: ${event.name as string}`);
            break;
          case "line": {
            const line = event.line as { name: string; code: string | null };
            setAdded((prev) => [
              ...prev,
              line.code ? `${line.code} · ${line.name}` : line.name,
            ]);
            break;
          }
          // Propunerile s-au salvat pe server; aici doar numaram, ca omul sa
          // stie ca il asteapta o lista sub deviz.
          case "steps":
            setProposed((event.steps as unknown[]).length);
            break;
          case "question":
            setQuestion(event.question as string);
            break;
          case "summary":
            setSummary(event.text as string);
            break;
          case "error":
            setError(event.message as string);
            break;
          case "done":
            setStatus(null);
            setText("");
            onFinished();
            break;
        }
      });
    } catch {
      setError("Conexiunea s-a intrerupt. Liniile intrate pana acum sunt salvate.");
    } finally {
      setRunning(false);
      setStatus(null);
    }
  }

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-ink-900">Spune ce ai lucrat</h2>
      <p className="mt-0.5 text-sm text-ink-500">
        Scrie in cuvintele tale, cu cantitatile pe care le stii. Lucrarile care au
        norma in indicator intra cu codul lor; restul, ca linii scrise liber.
      </p>

      <textarea
        className="textarea mt-3 min-h-24"
        value={text}
        disabled={running || !aiConfigured}
        placeholder="Am sapat 12 mc cu excavatorul si dupa am turnat beton in fundatie."
        onChange={(e) => setText(e.target.value)}
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          onClick={handleSubmit}
          disabled={running || !aiConfigured || text.trim().length < 5}
        >
          {running ? "Se adauga..." : "Adauga in deviz"}
        </button>

        {!aiConfigured && (
          <span className="text-xs text-ink-500">
            Nu merge fara <code>ANTHROPIC_API_KEY</code> in <code>.env</code>.
          </span>
        )}
        {status && <span className="text-sm text-ink-600">{status}</span>}
        {error && <span className="text-sm text-red-700">{error}</span>}
      </div>

      {added.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-ink-600">
          {added.map((label, index) => (
            <li key={`${label}-${index}`} className="flex gap-2">
              <span className="text-emerald-600">+</span>
              {label}
            </li>
          ))}
        </ul>
      )}

      {proposed > 0 && (
        <p className="mt-3 text-sm text-blue-800">
          {proposed === 1
            ? "Un pas in plus te asteapta in lista de sub deviz."
            : `Inca ${proposed} pasi te asteapta in lista de sub deviz.`}
        </p>
      )}

      {question && (
        <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-sm text-blue-900">
          {question}
        </p>
      )}

      {summary && (
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-600">
          {summary}
        </p>
      )}
    </div>
  );
}

/**
 * Liniile optionale: pasii pe care AI-ul i-a dedus, dar pe care omul nu i-a spus.
 *
 * Stau sub deviz, in ordinea in care se executa pe santier, si nu sint linii de
 * deviz: nu se aduna nicaieri si nu apar pe niciun PDF. Fiecare intra doar cind
 * omul apasa plusul de pe rindul ei.
 *
 * Din deviz iese o factura, iar un pas dedus gresit care ar intra singur ar fi
 * munca facturata si neexecutata. De aceea plusul e o apasare deliberata, si de
 * aceea o propunere fara cantitate nu poate fi adaugata pina nu o masoara omul.
 */
function OptionalLines({
  estimateId,
  suggestions,
  sections,
  onChanged,
}: {
  estimateId: string;
  suggestions: Suggestion[];
  sections: Section[];
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [sectionId, setSectionId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function cantitatea(s: Suggestion): string {
    return quantities[s.id] ?? (s.quantity === null ? "" : formatQty(s.quantity));
  }

  function handleAdd(s: Suggestion) {
    setError(null);
    setBusy(s.id);
    startTransition(async () => {
      const result = await addSuggestion({
        estimateId,
        suggestionId: s.id,
        sectionId: sectionId === "" ? null : sectionId,
        quantity: parseDecimal(cantitatea(s)),
      });
      setBusy(null);
      if (!result.ok) {
        setError(result.error ?? "Linia nu a putut fi adaugata");
        return;
      }
      onChanged();
    });
  }

  function handleDismiss(s: Suggestion) {
    setError(null);
    setBusy(s.id);
    startTransition(async () => {
      const result = await dismissSuggestion({ estimateId, suggestionId: s.id });
      setBusy(null);
      if (!result.ok) {
        setError(result.error ?? "Propunerea nu a putut fi stearsa");
        return;
      }
      onChanged();
    });
  }

  return (
    <section className="card overflow-hidden">
      <header className="border-b border-[var(--border)] bg-blue-50 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-blue-900">Linii optionale</h2>
            <p className="mt-0.5 text-xs text-blue-900/80">
              Pasii astia fac parte din lucrare, dar nu i-ai spus. Apasa plusul pe
              cei care s-au executat — nu intra nimic singur.
            </p>
          </div>

          {sections.length > 0 && (
            <select
              className="input w-auto"
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              title="In ce sectiune intra liniile adaugate"
            >
              <option value="">Alte lucrari</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      <ol className="divide-y divide-[var(--border)]">
        {suggestions.map((s, index) => {
          const text = cantitatea(s);
          const gata = parseDecimal(text) > 0;
          const lucreaza = busy === s.id && pending;

          return (
            <li key={s.id} className="p-4">
              <div className="flex items-start gap-3">
                <span className="tabular shrink-0 pt-0.5 text-sm text-ink-500">
                  {index + 1}.
                </span>

                {/* Denumirea curge pe cite rinduri ii trebuie: pe telefon, un
                    nume de norma taiat la jumatate nu spune ce s-a executat. */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug text-ink-900">
                    {s.name}
                  </p>
                  {s.code && (
                    <p className="tabular mt-0.5 text-xs text-brand-700">{s.code}</p>
                  )}
                  <p className="mt-1 text-xs leading-relaxed text-ink-500">
                    {s.reason}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleDismiss(s)}
                  disabled={lucreaza}
                  title="Nu s-a executat"
                  aria-label={`Scoate ${s.name} din propuneri`}
                  className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-50 hover:text-ink-700"
                >
                  ×
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 pl-6">
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label={`Cantitate pentru ${s.name}`}
                  className="cell-input tabular w-24 text-right"
                  placeholder={s.quantity === null ? "de pus" : undefined}
                  value={text}
                  onChange={(e) =>
                    setQuantities((prev) => ({ ...prev, [s.id]: e.target.value }))
                  }
                />
                <span className="text-xs text-ink-500">{s.unit}</span>

                {s.quantity === null && !gata && (
                  <span className="text-xs text-amber-800">
                    AI-ul n-a putut deduce cantitatea
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => handleAdd(s)}
                  disabled={!gata || lucreaza}
                  title={gata ? "Adauga in deviz" : "Pune intii cantitatea"}
                  className="btn-secondary ml-auto"
                >
                  {lucreaza ? "Se adauga..." : "+ Adauga in deviz"}
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      <footer className="border-t border-[var(--border)] px-4 py-3">
        {error ? (
          <p className="text-sm text-red-700">{error}</p>
        ) : (
          <p className="text-xs text-ink-500">
            Liniile adaugate intra la coada devizului, fara pret si marcate pentru
            verificare. Pretul il scrii tu pe linie.
          </p>
        )}
      </footer>
    </section>
  );
}

/**
 * Cautarea in indicatorul de norme de deviz C.
 *
 * Alegerea unei norme completeaza codul, denumirea si unitatea; toate raman
 * editabile dupa aceea, iar o lucrare care nu are norma se scrie pur si simplu
 * de mana, fara cod.
 */
function NormSearch({
  onPick,
}: {
  onPick: (norma: Norma) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Norma[]>([]);
  const [searching, startSearch] = useTransition();
  const [searched, setSearched] = useState(false);

  function runSearch() {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;

    startSearch(async () => {
      setResults(await searchNormeAction(trimmed));
      setSearched(true);
    });
  }

  return (
    <div>
      <label className="label" htmlFor="norm-search">
        Cauta in indicatorul de norme
      </label>
      <div className="flex gap-2">
        <input
          id="norm-search"
          className="input"
          value={query}
          placeholder="tencuieli interioare manual"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              runSearch();
            }
          }}
        />
        <button
          type="button"
          className="btn-secondary shrink-0"
          onClick={runSearch}
          disabled={searching || query.trim().length < 2}
        >
          {searching ? "Caut..." : "Cauta"}
        </button>
      </div>

      {searched && results.length === 0 && (
        <p className="mt-2 text-xs text-ink-500">
          Nicio norma pentru cuvintele astea. Indicatorul e scris in limbajul
          anilor &rsquo;80 — incearca &bdquo;timplarie&rdquo; in loc de
          &bdquo;tamplarie PVC&rdquo;. Daca lucrarea chiar nu are norma, scrie-o
          direct mai jos.
        </p>
      )}

      {results.length > 0 && (
        <ul className="mt-2 max-h-56 divide-y divide-[var(--border)] overflow-y-auto rounded-lg border border-[var(--border)]">
          {results.map((norma) => (
            <li key={norma.cod}>
              <button
                type="button"
                className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-ink-50"
                onClick={() => {
                  onPick(norma);
                  setResults([]);
                  setSearched(false);
                  setQuery("");
                }}
              >
                <span className="tabular shrink-0 text-xs font-medium text-brand-700">
                  {norma.cod}
                </span>
                <span className="min-w-0 flex-1 text-xs text-ink-700">
                  {norma.denumire}
                </span>
                <span className="shrink-0 text-xs text-ink-500">
                  {norma.um ?? "—"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddLineForm({
  estimateId,
  sections,
  onAdded,
}: {
  estimateId: string;
  sections: Section[];
  onAdded: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(EMPTY_LINE);
  const [sectionId, setSectionId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const result = await addEstimateLineManual({
        estimateId,
        sectionId: sectionId === "" ? null : sectionId,
        code: draft.code,
        name: draft.name.trim(),
        unit: draft.unit.trim(),
        quantity: parseDecimal(draft.quantity),
        materialUnitPrice: parseDecimal(draft.materialUnitPrice),
        laborUnitPrice: parseDecimal(draft.laborUnitPrice),
        equipmentUnitPrice: parseDecimal(draft.equipmentUnitPrice),
        transportUnitPrice: parseDecimal(draft.transportUnitPrice),
      });

      if (!result.ok) {
        setError(result.error ?? "Linia nu a putut fi adaugata");
        return;
      }
      setDraft(EMPTY_LINE);
      onAdded();
    });
  }

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-ink-900">Adauga o lucrare</h2>

      <div className="mt-3">
        <NormSearch
          onPick={(norma) =>
            setDraft({
              ...draft,
              code: norma.cod,
              name: norma.denumire,
              // Indicatorul Ts nu da unitatea in tabla de materii; pastram ce
              // era in formular si o corecteaza omul.
              unit: norma.um ?? draft.unit,
            })
          }
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <div className="col-span-2">
          <label className="label" htmlFor="add-name">
            Denumire
            {draft.code && (
              <span className="tabular ml-2 font-normal text-brand-700">
                {draft.code}
              </span>
            )}
          </label>
          <input
            id="add-name"
            className="input"
            value={draft.name}
            placeholder="Tencuiala interioara mecanizata"
            onChange={(e) =>
              // O denumire schimbata de om nu mai e norma din indicator, deci
              // linia isi pierde codul oficial.
              setDraft({ ...draft, code: null, name: e.target.value })
            }
          />
        </div>
        <div>
          <label className="label" htmlFor="add-qty">
            Cantitate
          </label>
          <input
            id="add-qty"
            className="input tabular text-right"
            inputMode="decimal"
            value={draft.quantity}
            onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="add-unit">
            U.M.
          </label>
          <input
            id="add-unit"
            className="input"
            value={draft.unit}
            onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="add-material">
            Material
          </label>
          <input
            id="add-material"
            className="input tabular text-right"
            inputMode="decimal"
            value={draft.materialUnitPrice}
            onChange={(e) =>
              setDraft({ ...draft, materialUnitPrice: e.target.value })
            }
          />
        </div>
        <div>
          <label className="label" htmlFor="add-labor">
            Manopera
          </label>
          <input
            id="add-labor"
            className="input tabular text-right"
            inputMode="decimal"
            value={draft.laborUnitPrice}
            onChange={(e) => setDraft({ ...draft, laborUnitPrice: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="add-equipment">
            Utilaj
          </label>
          <input
            id="add-equipment"
            className="input tabular text-right"
            inputMode="decimal"
            value={draft.equipmentUnitPrice}
            onChange={(e) =>
              setDraft({ ...draft, equipmentUnitPrice: e.target.value })
            }
          />
        </div>
        <div>
          <label className="label" htmlFor="add-transport">
            Transport
          </label>
          <input
            id="add-transport"
            className="input tabular text-right"
            inputMode="decimal"
            value={draft.transportUnitPrice}
            onChange={(e) =>
              setDraft({ ...draft, transportUnitPrice: e.target.value })
            }
          />
        </div>
        {sections.length > 0 && (
          <div className="col-span-2">
            <label className="label" htmlFor="add-section">
              Sectiune
            </label>
            <select
              id="add-section"
              className="input"
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
            >
              <option value="">Alte lucrari</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          className="btn-secondary"
          onClick={handleAdd}
          disabled={pending}
        >
          {pending ? "Se adauga..." : "Adauga linia"}
        </button>
        {error && <span className="text-sm text-red-700">{error}</span>}
      </div>
    </div>
  );
}

/**
 * Normele intre care descrierea nu departaja, ca butoane.
 *
 * Click-ul schimba doar ce vine din indicator — cod, denumire, unitate — si
 * lasa cantitatea si preturile neatinse: cifrele sint ale omului. Modificarea
 * intra in aceeasi salvare explicita ca orice altceva din editor.
 */
function NormaVariants({
  variants,
  current,
  editable,
  onPick,
}: {
  variants: NormaVariant[];
  current: string | null;
  editable: boolean;
  onPick: (variant: NormaVariant) => void;
}) {
  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-ink-700">
        AI-ul a gasit mai multe norme potrivite. Alege-o pe cea executata:
      </p>
      <div className="mt-1.5 flex flex-col gap-1">
        {variants.map((variant) => {
          const active = variant.cod === current;

          return (
            <button
              key={variant.cod}
              type="button"
              disabled={!editable || active}
              onClick={() => onPick(variant)}
              className={`rounded-lg border px-2.5 py-1.5 text-left text-xs ${
                active
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                  : "border-ink-200 bg-[var(--surface)] text-ink-700 hover:border-ink-300 hover:bg-ink-50 disabled:hover:bg-[var(--surface)]"
              }`}
            >
              <span className="font-medium">{variant.cod}</span>
              {variant.um && <span className="text-ink-500"> · {variant.um}</span>}
              {active && <span className="text-emerald-700"> · pe linie acum</span>}
              <span className="mt-0.5 block leading-snug">{variant.denumire}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TextCell({
  value,
  editable,
  className,
  multiline,
  onChange,
}: {
  value: string;
  editable: boolean;
  className?: string;
  /**
   * Creste pe verticala cu textul. Folosit pe telefon, unde denumirile de norma
   * — "Pardoseli din placi de gresie ceramica montate cu adeziv" — nu incap pe
   * un rind si un cimp de o linie ar arata din ele doar un sfert.
   */
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;

  /**
   * Inaltimea urmeaza continutul.
   *
   * Se face din callback-ul de `ref` si din `onChange`, nu dintr-un efect:
   * `useLayoutEffect` ar da avertisment la randarea pe server, iar `useEffect`
   * ar potrivi inaltimea abia dupa pictura, deci un nume lung ar clipi pe un
   * rind inainte sa se aseze.
   */
  function autosize(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  // `block` ca sa se poata alinia la dreapta in cardul de pe telefon, unde
  // eticheta e deasupra si valoarea sub ea, pe toata latimea coloanei.
  if (!editable) return <span className={`block ${className ?? ""}`}>{value}</span>;

  function commit() {
    if (draft === null) return;
    const trimmed = draft.trim();
    if (trimmed !== "" && trimmed !== value) onChange(trimmed);
    setDraft(null);
  }

  if (multiline) {
    return (
      <textarea
        ref={autosize}
        rows={1}
        className={`cell-input w-full resize-none leading-snug ${className ?? ""}`}
        value={shown}
        onChange={(e) => {
          setDraft(e.target.value);
          autosize(e.target);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          // Enter incheie editarea; denumirea unei lucrari e un rind, oricit de
          // lung ar fi, nu un paragraf.
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
    );
  }

  return (
    <input
      type="text"
      className={`cell-input w-full ${className ?? ""}`}
      value={shown}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
    />
  );
}

/**
 * Cifra editabila, fara celula in jurul ei: aceeasi in tabelul de pe ecran lat
 * si in cardul de pe telefon. Regula de parsare si de rotunjire la afisare sta
 * intr-un singur loc, ca sa nu ajunga cele doua forme sa accepte lucruri
 * diferite.
 */
function NumberInput({
  value,
  decimals,
  editable,
  className,
  onChange,
}: {
  value: number;
  decimals: number;
  editable: boolean;
  className?: string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = decimals === 3 ? formatQty(value) : formatLei(value);

  if (!editable) {
    return (
      <span className={`tabular block text-ink-700 ${className ?? ""}`}>{shown}</span>
    );
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      className={`cell-input tabular text-right ${className ?? ""}`}
      value={draft ?? shown}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft === null) return;
        const parsed = parseDecimal(draft);
        if (Number.isFinite(parsed) && parsed >= 0) onChange(parsed);
        setDraft(null);
      }}
    />
  );
}

function NumberCell(props: {
  value: number;
  decimals: number;
  editable: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <td className="td text-right">
      <NumberInput {...props} />
    </td>
  );
}

/** Acceptam si virgula zecimala; separatorul de mii se ignora. */
function parseDecimal(raw: string): number {
  const parsed = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Recapitulatia devizului.
 *
 * Totalizeaza cele patru componente si atat: nu se adauga nimic peste ele, nici
 * cheltuieli indirecte, nici profit. Suma celor patru rinduri e chiar "Total
 * fara TVA" — daca nu se inchide, e o eroare de rotunjire, nu o formula lipsa.
 */
function Recapitulation({
  totals,
  vatRate,
  editable,
  onVatRateChange,
}: {
  totals: ReturnType<typeof computeEstimateTotals>;
  vatRate: number;
  editable: boolean;
  onVatRateChange: (rate: number) => void;
}) {
  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-ink-900">Recapitulatie</h2>

      <dl className="mt-4 space-y-2 text-sm">
        <Row label="Materiale" value={totals.totalMaterial} />
        <Row label="Manopera" value={totals.totalLabor} />
        <Row label="Utilaj" value={totals.totalEquipment} />
        <Row label="Transport" value={totals.totalTransport} />

        <div className="border-t border-[var(--border)] pt-2">
          <Row label="Total fara TVA" value={totals.netTotal} strong />
        </div>

        <VatRow
          value={totals.vatAmount}
          pct={vatRate}
          editable={editable}
          onChange={onVatRateChange}
        />

        <div className="border-t-2 border-ink-900 pt-2">
          <div className="flex items-center justify-between">
            <dt className="font-semibold text-ink-900">TOTAL GENERAL</dt>
            <dd className="tabular text-xl font-semibold text-ink-900">
              {formatLei(totals.grandTotal)} lei
            </dd>
          </div>
        </div>
      </dl>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className={strong ? "font-medium text-ink-900" : "text-ink-600"}>{label}</dt>
      <dd className={`tabular ${strong ? "font-medium text-ink-900" : "text-ink-700"}`}>
        {formatLei(value)}
      </dd>
    </div>
  );
}

function VatRow({
  pct,
  value,
  editable,
  onChange,
}: {
  pct: number;
  value: number;
  editable: boolean;
  onChange: (pct: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div className="flex items-center justify-between">
      <dt className="flex items-center gap-2 text-ink-600">
        TVA
        {editable ? (
          <span className="inline-flex items-center gap-1">
            <input
              type="text"
              inputMode="decimal"
              className="cell-input tabular w-14 text-right"
              value={draft ?? String(pct).replace(".", ",")}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                if (draft === null) return;
                const parsed = Number(draft.replace(",", "."));
                if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) {
                  onChange(parsed);
                }
                setDraft(null);
              }}
            />
            <span className="text-ink-500">%</span>
          </span>
        ) : (
          <span className="text-ink-500">{pct}%</span>
        )}
      </dt>
      <dd className="tabular text-ink-700">{formatLei(value)}</dd>
    </div>
  );
}
