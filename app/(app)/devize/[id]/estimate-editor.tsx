"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addEstimateLineManual,
  addSuggestedSteps,
  deleteEstimateLine,
  saveEstimateLines,
  searchNormeAction,
  updateEstimateMode,
  updateEstimateVatRate,
} from "@/app/actions/estimates";
import { ConfidenceBadge } from "@/components/status-badge";
import type { ProposedStep } from "@/lib/ai/map-tool-output";
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

export type EstimateMode = "COMBINAT" | "SEPARAT";

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
  /** In modul COMBINAT poarta pretul intreg al lucrarii. */
  materialUnitPrice: number;
  laborUnitPrice: number;
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

export function EstimateEditor({
  estimateId,
  editable,
  mode: initialMode,
  aiConfigured,
  sections,
  lines: initialLines,
  vatRate: initialVatRate,
}: {
  estimateId: string;
  editable: boolean;
  mode: EstimateMode;
  aiConfigured: boolean;
  sections: Section[];
  lines: EditorLine[];
  vatRate: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [lines, setLines] = useState(initialLines);
  const [mode, setMode] = useState(initialMode);
  const [vatRate, setVatRate] = useState(initialVatRate);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const separat = mode === "SEPARAT";
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

  function handleMode(next: EstimateMode) {
    if (next === mode) return;
    setError(null);
    setMode(next);

    // Aceeasi regula ca pe server: la revenirea pe un singur pret, manopera se
    // aduna peste material ca totalul sa nu se schimbe.
    if (next === "COMBINAT") {
      setLines((prev) =>
        prev.map((l) => ({
          ...l,
          materialUnitPrice: l.materialUnitPrice + l.laborUnitPrice,
          laborUnitPrice: 0,
        })),
      );
    }

    startTransition(async () => {
      const result = await updateEstimateMode({ estimateId, mode: next });
      if (!result.ok) setError(result.error ?? "Modul nu a putut fi schimbat");
      else router.refresh();
    });
  }

  const columnCount = (separat ? 7 : 6) + (editable ? 1 : 0);

  return (
    <div className="space-y-5">
      {editable && (
        /* Se opreste sub antetul de pe telefon (`top-14`), care e si el lipit;
           la `lg` antetul nu mai e lipit, deci bara urca la marginea de sus. */
        <div className="sticky top-14 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-glass)] px-4 py-2.5 backdrop-blur lg:top-0">
          <p className="text-sm text-ink-600">
            {dirty ? "Ai modificari nesalvate" : "Toate modificarile sunt salvate"}
          </p>
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

      <ModeSwitch mode={mode} editable={editable} onChange={handleMode} />

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

              {/* Pe telefon linia devine card. Tabelul are sapte coloane in
                  modul separat; la 375px asta inseamna sa derulezi lateral
                  peste fiecare linie ca sa ajungi la pretul pe care il
                  corectezi — adica exact lucrul pentru care ai deschis
                  editorul. */}
              <ul className="divide-y divide-[var(--border)] md:hidden">
                {sectionLines.map((line) => (
                  <li key={line.id}>
                    <LineCard
                      line={line}
                      separat={separat}
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
                <table className="w-full min-w-[880px]">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="th w-full">Lucrare</th>
                      <th className="th w-24 text-right">Cantitate</th>
                      <th className="th w-20">U.M.</th>
                      {separat ? (
                        <>
                          <th className="th w-28 text-right">Material</th>
                          <th className="th w-28 text-right">Manopera</th>
                        </>
                      ) : (
                        <th className="th w-32 text-right">Pret unitar</th>
                      )}
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

                            <NumberCell
                              value={line.materialUnitPrice}
                              decimals={2}
                              editable={editable}
                              onChange={(materialUnitPrice) =>
                                patchLine(line.id, { materialUnitPrice })
                              }
                            />
                            {separat && (
                              <NumberCell
                                value={line.laborUnitPrice}
                                decimals={2}
                                editable={editable}
                                onChange={(laborUnitPrice) =>
                                  patchLine(line.id, { laborUnitPrice })
                                }
                              />
                            )}

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

                          {isOpen &&
                            (line.aiJustification ||
                              line.alternatives.length > 0) && (
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

      {editable && (
        <>
          <SpokenWork
            estimateId={estimateId}
            aiConfigured={aiConfigured}
            sections={sections}
            onFinished={() => router.refresh()}
          />
          <AddLineForm
            estimateId={estimateId}
            separat={separat}
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
        separat={separat}
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
  const hasDetails = Boolean(line.aiJustification) || line.alternatives.length > 0;
  if (!line.code && !hasDetails && (line.reviewed || !line.aiGenerated)) return null;

  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-500">
      {line.code && <span className="tabular">{line.code}</span>}
      {line.aiGenerated && !line.reviewed && (
        <ConfidenceBadge confidence={line.aiConfidence} />
      )}
      {hasDetails && (
        <button type="button" onClick={onToggle} className="link">
          {open
            ? "ascunde"
            : line.alternatives.length > 0
              ? "vezi calculul si variantele"
              : "vezi calculul"}
        </button>
      )}
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
  return (
    <>
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
  separat,
  editable,
  pending,
  open,
  onToggle,
  onPatch,
  onDelete,
}: {
  line: EditorLine;
  separat: boolean;
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

        <CardField label={separat ? "Material" : "Pret unitar"}>
          <NumberInput
            value={line.materialUnitPrice}
            decimals={2}
            editable={editable}
            className="w-full text-right"
            onChange={(materialUnitPrice) => onPatch({ materialUnitPrice })}
          />
        </CardField>

        {separat && (
          <CardField label="Manopera">
            <NumberInput
              value={line.laborUnitPrice}
              decimals={2}
              editable={editable}
              className="w-full text-right"
              onChange={(laborUnitPrice) => onPatch({ laborUnitPrice })}
            />
          </CardField>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-2.5">
        <span className="text-xs text-ink-500">Valoare</span>
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

      {open && (Boolean(line.aiJustification) || line.alternatives.length > 0) && (
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

function ModeSwitch({
  mode,
  editable,
  onChange,
}: {
  mode: EstimateMode;
  editable: boolean;
  onChange: (mode: EstimateMode) => void;
}) {
  const options: { value: EstimateMode; label: string; hint: string }[] = [
    {
      value: "COMBINAT",
      label: "Un singur pret",
      hint: "material si manopera la un loc, un PDF, o factura",
    },
    {
      value: "SEPARAT",
      label: "Materiale si manopera separat",
      hint: "doua PDF-uri si, daca vrei, doua facturi",
    },
  ];

  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
      <div>
        <p className="text-sm font-medium text-ink-900">Cum se scriu preturile</p>
        <p className="mt-0.5 text-xs text-ink-500">
          {mode === "SEPARAT"
            ? "Devizul se tipareste ca doua documente si poate fi facturat separat."
            : "Pretul de pe linie e pretul final catre beneficiar."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={!editable}
            onClick={() => onChange(option.value)}
            title={option.hint}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              mode === option.value
                ? "border-brand-500 bg-brand-50 font-medium text-brand-800"
                : "border-[var(--border)] text-ink-700 hover:bg-ink-50 disabled:hover:bg-transparent"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const EMPTY_LINE = {
  code: null as string | null,
  name: "",
  unit: "mp",
  quantity: "",
  materialUnitPrice: "",
  laborUnitPrice: "",
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
  sections,
  onFinished,
}: {
  estimateId: string;
  aiConfigured: boolean;
  sections: Section[];
  onFinished: () => void;
}) {
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [steps, setSteps] = useState<ProposedStep[]>([]);
  const [question, setQuestion] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setRunning(true);
    setStatus("AI-ul cauta lucrarile in indicator...");
    setAdded([]);
    setSteps([]);
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
          case "steps":
            setSteps(event.steps as ProposedStep[]);
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

      {steps.length > 0 && (
        <StepsBox
          estimateId={estimateId}
          steps={steps}
          sections={sections}
          onAdded={() => {
            setSteps([]);
            onFinished();
          }}
          onDismiss={() => setSteps([])}
        />
      )}
    </div>
  );
}

/**
 * Ordinea lucrarilor: pasii pe care AI-ul i-a dedus, dar pe care omul nu i-a
 * spus.
 *
 * Nimic de aici nu e in deviz. Sint propuneri, in ordinea in care se executa pe
 * santier, si intra doar cele bifate — de aceea nimic nu e bifat de la inceput.
 * Un pas dedus gresit care ar intra singur in deviz ar deveni munca facturata
 * si neexecutata.
 */
function StepsBox({
  estimateId,
  steps,
  sections,
  onAdded,
  onDismiss,
}: {
  estimateId: string;
  steps: ProposedStep[];
  sections: Section[];
  onAdded: () => void;
  onDismiss: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [sectionId, setSectionId] = useState("");
  const [error, setError] = useState<string | null>(null);

  function toggle(index: number) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
    setError(null);
  }

  function handleAdd() {
    setError(null);
    const alese = [...chosen].sort((a, b) => a - b);

    startTransition(async () => {
      const result = await addSuggestedSteps({
        estimateId,
        sectionId: sectionId === "" ? null : sectionId,
        pasi: alese.map((i) => ({
          code: steps[i].code,
          name: steps[i].name,
          unit: steps[i].unit,
          quantity: parseDecimal(quantities[i] ?? "") || steps[i].quantity || 0,
        })),
      });

      if (!result.ok) {
        setError(result.error ?? "Pasii nu au putut fi adaugati");
        return;
      }
      onAdded();
    });
  }

  return (
    <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-blue-900">Ordinea lucrarilor</h3>
          <p className="mt-0.5 text-xs text-blue-900/80">
            Pasii astia fac parte din lucrare, dar nu i-ai spus. Bifeaza ce s-a
            executat — restul nu intra nicaieri.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-blue-900/70 underline-offset-2 hover:underline"
        >
          Nu-mi trebuie
        </button>
      </div>

      <ol className="mt-3 space-y-1.5">
        {steps.map((step, index) => {
          const bifat = chosen.has(index);

          return (
            <li key={`${step.name}-${index}`}>
              <div
                className={`rounded-lg border bg-[var(--surface)] p-3 transition-colors ${
                  bifat ? "border-brand-400" : "border-[var(--border)]"
                }`}
              >
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={bifat}
                    onChange={() => toggle(index)}
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink-900">
                      <span className="tabular text-ink-500">{index + 1}.</span>{" "}
                      {step.name}
                    </span>
                    {step.code && (
                      <span className="tabular mt-0.5 block text-xs text-brand-700">
                        {step.code}
                      </span>
                    )}
                    <span className="mt-0.5 block text-xs text-ink-500">
                      {step.reason}
                    </span>
                  </span>
                </label>

                {bifat && (
                  <div className="mt-2.5 flex items-center gap-2 border-t border-[var(--border)] pt-2.5">
                    <label className="text-xs text-ink-500">Cantitate</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="cell-input tabular w-24 text-right"
                      placeholder={step.quantity === null ? "de pus" : undefined}
                      value={
                        quantities[index] ??
                        (step.quantity === null ? "" : formatQty(step.quantity))
                      }
                      onChange={(e) =>
                        setQuantities((prev) => ({ ...prev, [index]: e.target.value }))
                      }
                    />
                    <span className="text-xs text-ink-500">{step.unit}</span>
                    {step.quantity === null && (
                      <span className="text-xs text-amber-800">
                        AI-ul n-a putut-o deduce
                      </span>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        {sections.length > 0 && (
          <div>
            <label className="label text-xs" htmlFor="steps-section">
              Sectiune
            </label>
            <select
              id="steps-section"
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

        <button
          type="button"
          className="btn-primary w-full sm:w-auto"
          onClick={handleAdd}
          disabled={pending || chosen.size === 0}
        >
          {pending
            ? "Se adauga..."
            : chosen.size === 0
              ? "Bifeaza pasii de adaugat"
              : `Adauga ${chosen.size} ${chosen.size === 1 ? "pas" : "pasi"} in deviz`}
        </button>

        {error && <span className="text-sm text-red-700">{error}</span>}
      </div>

      <p className="mt-2 text-xs text-ink-500">
        Intra fara pret, marcati pentru verificare. Pretul il scrii tu pe linie.
      </p>
    </div>
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
  separat,
  sections,
  onAdded,
}: {
  estimateId: string;
  separat: boolean;
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
        laborUnitPrice: separat ? parseDecimal(draft.laborUnitPrice) : 0,
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
            {separat ? "Material" : "Pret unitar"}
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
        {separat && (
          <div>
            <label className="label" htmlFor="add-labor">
              Manopera
            </label>
            <input
              id="add-labor"
              className="input tabular text-right"
              inputMode="decimal"
              value={draft.laborUnitPrice}
              onChange={(e) =>
                setDraft({ ...draft, laborUnitPrice: e.target.value })
              }
            />
          </div>
        )}
        {sections.length > 0 && (
          <div className={separat ? "col-span-2" : ""}>
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
  onChange,
}: {
  value: string;
  editable: boolean;
  className?: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  // `block` ca sa se poata alinia la dreapta in cardul de pe telefon, unde
  // eticheta e deasupra si valoarea sub ea, pe toata latimea coloanei.
  if (!editable) return <span className={`block ${className ?? ""}`}>{value}</span>;

  return (
    <input
      type="text"
      className={`cell-input w-full ${className ?? ""}`}
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft === null) return;
        const trimmed = draft.trim();
        if (trimmed !== "" && trimmed !== value) onChange(trimmed);
        setDraft(null);
      }}
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

function Recapitulation({
  totals,
  separat,
  vatRate,
  editable,
  onVatRateChange,
}: {
  totals: ReturnType<typeof computeEstimateTotals>;
  separat: boolean;
  vatRate: number;
  editable: boolean;
  onVatRateChange: (rate: number) => void;
}) {
  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-ink-900">Recapitulatie</h2>

      <dl className="mt-4 space-y-2 text-sm">
        {separat && (
          <>
            <Row label="Materiale" value={totals.totalMaterial} />
            <Row label="Manopera" value={totals.totalLabor} />
          </>
        )}

        <div className={separat ? "border-t border-[var(--border)] pt-2" : ""}>
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
