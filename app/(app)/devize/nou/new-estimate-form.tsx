"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ConfidenceBadge } from "@/components/status-badge";
import { COUNTIES } from "@/lib/counties";
import { consumeEventStream } from "@/lib/event-stream";
import { formatLei, formatQty } from "@/lib/money";

/**
 * Formularul de generare si vizualizarea in timp real a devizului.
 *
 * Liniile apar pe masura ce AI-ul le produce, fiecare cu calculul cantitatii
 * langa ea. Devizul e deja salvat ca ciorna in baza de date pe parcursul
 * generarii, deci un refresh nu pierde nimic — de aceea afisam numarul lui
 * imediat ce sosesc primele evenimente.
 */

interface Option {
  id: string;
  name: string;
}

type EstimateMode = "COMBINAT" | "SEPARAT";

interface StreamedLine {
  id?: string;
  section: string;
  name: string;
  unit: string;
  quantity: number;
  materialUnitPrice: number;
  laborUnitPrice: number;
  unitPrice: number;
  total: number;
  justification: string;
  confidence: "MARE" | "MEDIE" | "MICA";
}

const WORK_TYPES = [
  "Constructie noua locuinta",
  "Constructie hala / spatiu comercial",
  "Extindere / mansardare",
  "Renovare completa apartament",
  "Renovare completa casa",
  "Reabilitare termica / fatada",
  "Amenajari interioare",
  "Reparatii si zugraveli",
  "Instalatii (sanitare / electrice / termice)",
  "Lucrari exterioare (imprejmuiri, alei, terase)",
];

const FINISH_LEVELS = ["Economic", "Mediu", "Premium"];

const FLOORS = ["Parter", "P+1", "P+1+M", "P+2", "Demisol + P+1", "Apartament"];

const EXAMPLE = `Casa noua P+1, amprenta la sol 120 mp, teren plat in Snagov.
Fundatie continua din beton armat, placa pe sol.
Structura din zidarie de BCA 30 cm cu stalpisori si centuri din beton armat, planseu din beton armat peste parter.
Sarpanta din lemn cu invelitoare din tigla ceramica, jgheaburi si burlane.
Termosistem 10 cm polistiren pe toata fatada, cu tencuiala decorativa.
Tamplarie PVC cu geam tripan.
La interior: tencuieli mecanizate, gletuiri, zugraveli lavabile, gresie in bai si bucatarie, parchet laminat in rest.
Instalatii complete: sanitare cu 2 bai, electrice, incalzire in pardoseala la parter si calorifere la etaj, centrala termica.`;

export function NewEstimateForm({
  clients,
  projects,
  aiConfigured,
  defaultMode,
}: {
  clients: Option[];
  projects: (Option & { clientId: string | null })[];
  aiConfigured: boolean;
  defaultMode: EstimateMode;
}) {
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);

  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [lines, setLines] = useState<StreamedLine[]>([]);
  const [estimateId, setEstimateId] = useState<string | null>(null);
  const [fullNumber, setFullNumber] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [priceMode, setPriceMode] = useState<EstimateMode>(defaultMode);

  const runningTotal = lines.reduce((sum, line) => sum + line.total, 0);
  const lowConfidence = lines.filter((l) => l.confidence === "MICA").length;

  async function handleSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const form = new FormData(formEvent.currentTarget);

    const areaRaw = String(form.get("builtArea") ?? "").trim();
    const body = {
      title: String(form.get("title") ?? "").trim(),
      brief: String(form.get("brief") ?? "").trim(),
      clientId: emptyToNull(form.get("clientId")),
      projectId: emptyToNull(form.get("projectId")),
      workType: emptyToNull(form.get("workType")),
      builtArea: areaRaw ? Number(areaRaw.replace(",", ".")) : null,
      floors: emptyToNull(form.get("floors")),
      finishLevel: emptyToNull(form.get("finishLevel")),
      county: emptyToNull(form.get("county")),
      retrospective: form.get("kind") === "executat",
      mode: String(form.get("priceMode") ?? defaultMode) as EstimateMode,
    };

    setPriceMode(body.mode);

    setRunning(true);
    setFinished(false);
    setError(null);
    setQuestion(null);
    setSummary(null);
    setLines([]);
    setEstimateId(null);
    setFullNumber(null);
    setStatus("Se porneste generarea...");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/ai/deviz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const problem = await response.json().catch(() => null);
        setError(problem?.error ?? "Generarea nu a putut porni.");
        setRunning(false);
        return;
      }

      await consumeEventStream(response.body, (event) => {
        switch (event.type) {
          case "created":
            setEstimateId(event.estimateId as string);
            setFullNumber(event.fullNumber as string);
            break;
          case "status":
            setStatus(event.message as string);
            break;
          case "section":
            setStatus(`Lucrez la: ${event.name as string}`);
            break;
          case "line":
            setLines((prev) => [...prev, event.line as StreamedLine]);
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
            setFinished(true);
            break;
        }
      });
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        setError(
          "Conexiunea s-a intrerupt. Liniile generate pana acum sunt salvate in deviz.",
        );
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
    setRunning(false);
    setStatus(null);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <form onSubmit={handleSubmit} className="card h-fit p-5">
        {!aiConfigured && (
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
            Generarea cu AI nu e configurata. Adauga <code>ANTHROPIC_API_KEY</code> in
            fisierul <code>.env</code> si reporneste aplicatia.
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="title">
              Titlul devizului
            </label>
            <input
              id="title"
              name="title"
              className="input"
              placeholder="Casa P+1 Snagov — structura si finisaje"
              required
              disabled={running}
            />
          </div>

          <fieldset disabled={running}>
            <legend className="label">Ce fel de deviz</legend>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] p-3 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                <input type="radio" name="kind" value="oferta" defaultChecked className="mt-0.5" />
                <span>
                  <span className="font-medium">De construit</span>
                  <span className="mt-0.5 block text-xs text-ink-500">deviz oferta</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] p-3 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                <input type="radio" name="kind" value="executat" className="mt-0.5" />
                <span>
                  <span className="font-medium">Deja construit</span>
                  <span className="mt-0.5 block text-xs text-ink-500">pentru facturare</span>
                </span>
              </label>
            </div>
          </fieldset>

          <fieldset disabled={running}>
            <legend className="label">Cum se scriu preturile</legend>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] p-3 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                <input
                  type="radio"
                  name="priceMode"
                  value="COMBINAT"
                  defaultChecked={defaultMode === "COMBINAT"}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Un singur pret</span>
                  <span className="mt-0.5 block text-xs text-ink-500">
                    material si manopera la un loc
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] p-3 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                <input
                  type="radio"
                  name="priceMode"
                  value="SEPARAT"
                  defaultChecked={defaultMode === "SEPARAT"}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Separat</span>
                  <span className="mt-0.5 block text-xs text-ink-500">
                    doua devize: materiale si manopera
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          <div>
            <label className="label" htmlFor="brief">
              Descrierea lucrarii
            </label>
            <textarea
              id="brief"
              name="brief"
              className="textarea min-h-56"
              placeholder={EXAMPLE}
              required
              minLength={20}
              disabled={running}
            />
            <p className="mt-1.5 text-xs text-ink-500">
              Cu cat dai mai multe dimensiuni si detalii, cu atat cantitatile sunt
              mai apropiate de realitate.
            </p>
          </div>

          <details className="rounded-lg border border-[var(--border)] p-3">
            <summary className="cursor-pointer text-sm font-medium text-ink-700">
              Detalii suplimentare (optional)
            </summary>

            <div className="mt-4 space-y-4">
              <div>
                <label className="label" htmlFor="workType">
                  Tip lucrare
                </label>
                <select id="workType" name="workType" className="input" defaultValue="" disabled={running}>
                  <option value="">—</option>
                  {WORK_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="builtArea">
                    Suprafata (mp)
                  </label>
                  <input
                    id="builtArea"
                    name="builtArea"
                    type="text"
                    inputMode="decimal"
                    className="input"
                    placeholder="120"
                    disabled={running}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="floors">
                    Regim inaltime
                  </label>
                  <select id="floors" name="floors" className="input" defaultValue="" disabled={running}>
                    <option value="">—</option>
                    {FLOORS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="finishLevel">
                    Nivel finisaje
                  </label>
                  <select id="finishLevel" name="finishLevel" className="input" defaultValue="" disabled={running}>
                    <option value="">—</option>
                    {FINISH_LEVELS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="county">
                    Judet
                  </label>
                  <select id="county" name="county" className="input" defaultValue="" disabled={running}>
                    <option value="">—</option>
                    {COUNTIES.map((c) => (
                      <option key={c.code} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="label" htmlFor="clientId">
                  Beneficiar
                </label>
                <select id="clientId" name="clientId" className="input" defaultValue="" disabled={running}>
                  <option value="">—</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label" htmlFor="projectId">
                  Proiect
                </label>
                <select id="projectId" name="projectId" className="input" defaultValue="" disabled={running}>
                  <option value="">—</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </details>
        </div>

        <div className="mt-5 flex gap-2">
          {running ? (
            <button type="button" onClick={handleStop} className="btn-secondary w-full">
              Opreste generarea
            </button>
          ) : (
            <button type="submit" className="btn-primary w-full" disabled={!aiConfigured}>
              Genereaza devizul
            </button>
          )}
        </div>

        <p className="mt-3 text-xs text-ink-500">
          Preturile propuse sunt orientative, la nivelul pietei. Le corectezi pe
          fiecare in editor inainte de a trimite oferta.
        </p>
      </form>

      <div className="min-w-0 space-y-4">
        {!running && lines.length === 0 && !error && (
          <div className="card flex min-h-64 flex-col items-center justify-center p-8 text-center">
            <p className="text-sm text-ink-500">
              Devizul apare aici, linie cu linie, pe masura ce AI-ul il construieste.
            </p>
          </div>
        )}

        {fullNumber && (
          <div className="card flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
            <div>
              <p className="text-sm font-medium text-ink-900">{fullNumber}</p>
              <p className="text-xs text-ink-500">
                {lines.length} linii · salvat automat ca ciorna
              </p>
            </div>
            <div className="text-right">
              <p className="tabular text-lg font-semibold text-ink-900">
                {formatLei(runningTotal)} lei
              </p>
              <p className="text-xs text-ink-500">fara TVA</p>
            </div>
          </div>
        )}

        {status && (
          <div
            role="status"
            className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-ink-600"
          >
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-brand-500" />
            {status}
          </div>
        )}

        {question && (
          <div className="card border-blue-200 bg-blue-50 p-5">
            <h3 className="font-semibold text-blue-900">AI-ul are o intrebare</h3>
            <p className="mt-1.5 text-sm text-blue-900/90">{question}</p>
            <p className="mt-3 text-xs text-blue-900/70">
              Completeaza raspunsul in descriere si genereaza din nou, sau continua
              manual din editor.
            </p>
          </div>
        )}

        {error && (
          <div role="alert" className="card border-red-200 bg-red-50 p-5">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {lines.length > 0 && <LinesPreview lines={lines} separat={priceMode === "SEPARAT"} />}

        {summary && (
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-ink-900">Nota AI</h3>
            <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-600">
              {summary}
            </p>
          </div>
        )}

        {finished && estimateId && (
          <div className="card flex flex-wrap items-center justify-between gap-3 border-emerald-200 bg-emerald-50 p-5">
            <div>
              <p className="font-medium text-emerald-900">
                Deviz generat — {lines.length} linii
              </p>
              <p className="mt-0.5 text-sm text-emerald-900/80">
                {lowConfidence > 0
                  ? `${lowConfidence} linii sunt marcate pentru verificare atenta.`
                  : "Verifica cantitatile inainte de a trimite oferta."}
              </p>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => router.push(`/devize/${estimateId}`)}
            >
              Deschide editorul
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function LinesPreview({
  lines,
  separat,
}: {
  lines: StreamedLine[];
  separat: boolean;
}) {
  const sections = groupBySection(lines);

  return (
    <div className="space-y-4">
      {sections.map(([section, sectionLines]) => (
        <section key={section} className="card overflow-hidden">
          <header className="flex items-center justify-between border-b border-[var(--border)] bg-ink-50 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-ink-900">{section}</h3>
            <span className="tabular text-sm font-medium text-ink-700">
              {formatLei(sectionLines.reduce((s, l) => s + l.total, 0))} lei
            </span>
          </header>

          <ul className="divide-y divide-[var(--border)]">
            {sectionLines.map((line, index) => (
              <li key={line.id ?? `${section}-${index}`} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-900">{line.name}</p>
                    <p className="tabular mt-0.5 text-xs text-ink-500">
                      {formatQty(line.quantity)} {line.unit} ×{" "}
                      {formatLei(line.unitPrice)} lei
                      {separat &&
                        ` (material ${formatLei(line.materialUnitPrice)} + manopera ${formatLei(line.laborUnitPrice)})`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ConfidenceBadge confidence={line.confidence} />
                    <span className="tabular w-28 text-right text-sm font-medium text-ink-900">
                      {formatLei(line.total)}
                    </span>
                  </div>
                </div>

                <p className="mt-1.5 border-l-2 border-ink-200 pl-2.5 text-xs leading-relaxed text-ink-500">
                  {line.justification}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function groupBySection(lines: StreamedLine[]): [string, StreamedLine[]][] {
  const map = new Map<string, StreamedLine[]>();
  for (const line of lines) {
    const bucket = map.get(line.section);
    if (bucket) bucket.push(line);
    else map.set(line.section, [line]);
  }
  return [...map.entries()];
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
}
