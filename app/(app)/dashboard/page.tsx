import type { Metadata } from "next";
import Link from "next/link";
import { EvolutionChart } from "@/components/charts/evolution-chart";
import { Sparkline } from "@/components/charts/sparkline";
import {
  IconBifa,
  IconDeviz,
  IconIesire,
  IconIntrare,
  IconPlus,
  IconStorno,
  IconTrend,
} from "@/components/icons";
import { type ActivityItem, RANGES, getDashboardData } from "@/lib/dashboard/metrics";
import { formatLei } from "@/lib/money";
import { requireUser } from "@/lib/tenant";

export const metadata: Metadata = { title: "Panou" };

export default async function DashboardPage() {
  const user = await requireUser();
  const d = await getDashboardData(user.orgId);

  return (
    <div className="space-y-7">
      <header className="anim-intra">
        <h1 className="text-[30px] font-semibold leading-tight text-ink-900">
          Salut, {user.name.split(" ")[0]}!
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Uite unde stau devizele si facturile firmei.
        </p>
      </header>

      {/* Banda de cifre: context pe fundal, despartit de linii subtiri, cu
          actiunile la capat. Grila, nu flex — pe flex, cind a treia cifra trece
          pe rindul urmator, separatorul ei ramine atirnat in gol. */}
      <section
        className="anim-intra flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between"
        style={{ "--d": "0.06s" } as React.CSSProperties}
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-0 lg:flex-1">
          <Stat label="Valoare devize" value={formatLei(d.valoareDevize)} unit="lei" />
          <Stat
            label="De incasat"
            value={formatLei(d.deIncasat)}
            unit="lei"
            hint={`${d.documenteNeincasate} ${d.documenteNeincasate === 1 ? "document" : "documente"}`}
          />
          <Stat
            label="Linii de verificat"
            value={String(d.liniiDeVerificat)}
            hint={
              d.liniiDeVerificat === 0
                ? "toate ciornele sunt verificate"
                : "preturi propuse de AI"
            }
            accent={d.liniiDeVerificat > 0}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link href="/facturi" className="btn-secondary">
            <IconIntrare className="h-4 w-4" />
            Facturi
          </Link>
          <Link href="/devize/nou" className="btn-primary">
            <IconPlus className="h-4 w-4" />
            Deviz nou cu AI
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-3 flex justify-end">
          <Link href="/facturi" className="link text-sm">
            Vezi toate
          </Link>
        </div>

        <div
          className="banda anim-intra"
          style={{ "--d": "0.12s" } as React.CSSProperties}
        >
          {d.mini.map((m, i) => (
            <article key={m.cheie} className="banda-celula">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-titlu text-[13px] font-semibold text-ink-900">
                  {m.eticheta}
                </p>
                <Delta valoare={m.delta} />
              </div>

              <div className="mt-3 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="tabular whitespace-nowrap text-[15px] font-semibold text-ink-900">
                    {m.bani ? formatLei(m.valoare) : m.valoare}
                    {m.bani && (
                      <span className="ml-1 text-[11px] font-normal text-ink-500">lei</span>
                    )}
                  </p>
                  <p className="mt-0.5 whitespace-nowrap text-[11px] text-ink-500">
                    luna in curs
                  </p>
                </div>
                <Sparkline
                  id={m.cheie}
                  puncte={m.puncte}
                  ton={m.cheie === "incasat" ? "ok" : "brand"}
                  intirziere={0.35 + i * 0.1}
                  latime={88}
                  inaltime={36}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)]">
        <section
          className="anim-intra"
          style={{ "--d": "0.36s" } as React.CSSProperties}
        >
          <div className="sectiune-titlu">
            <h2>Miscari recente</h2>
            <Link href="/devize" className="link text-sm">
              Vezi toate
            </Link>
          </div>

          {d.activitate.length === 0 ? (
            <div className="card px-5 py-10 text-center">
              <p className="text-sm text-ink-500">Niciun document inca.</p>
              <Link href="/devize/nou" className="btn-secondary mt-4">
                Creeaza primul deviz
              </Link>
            </div>
          ) : (
            /* Fiecare miscare e cardul ei, nu un rind intr-un tabel: asa se
               vede ca sint documente separate, fiecare cu pagina lui. */
            <ul className="space-y-2.5">
              {d.activitate.map((item, i) => (
                <li
                  key={item.id}
                  className="anim-intra"
                  style={{ "--d": `${0.42 + i * 0.05}s` } as React.CSSProperties}
                >
                  <ActivityRow item={item} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className="anim-intra"
          style={{ "--d": "0.42s" } as React.CSSProperties}
        >
          <div className="sectiune-titlu">
            <h2>Evolutie</h2>
            <span className="text-xs text-ink-500">valori cu TVA</span>
          </div>
          <div className="card p-5">
            <EvolutionChart serii={d.serii} intervale={RANGES} />
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  unit,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  unit?: string;
  /** Cifra care cere ceva de la om — se scrie in culoarea de accent. */
  accent?: boolean;
}) {
  return (
    <div className="sm:pr-8 sm:not-first:border-l sm:not-first:border-[var(--border-strong)] sm:not-first:pl-8">
      <p className="text-sm text-ink-500">{label}</p>
      <p
        className={`tabular mt-1 text-2xl font-semibold ${
          accent ? "text-brand-700" : "text-ink-900"
        }`}
      >
        {value}
        {unit && <span className="ml-1 text-base font-normal text-ink-500">{unit}</span>}
      </p>
      {hint && <p className="mt-0.5 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

/** Cresterea fata de luna trecuta. Fara baza de comparatie nu se afiseaza nimic. */
function Delta({ valoare }: { valoare: number | null }) {
  if (valoare === null || valoare === 0) return null;

  const urca = valoare > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
        urca ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
      }`}
    >
      <IconTrend jos={!urca} className="h-2.5 w-2.5" />
      {Math.abs(valoare).toFixed(0)}%
    </span>
  );
}

const FEL = {
  DEVIZ: { Icon: IconDeviz, clasa: "bg-brand-50 text-brand-700", eticheta: "Deviz" },
  FACTURA: { Icon: IconIesire, clasa: "bg-blue-50 text-blue-800", eticheta: "Factura emisa" },
  PLATA: { Icon: IconBifa, clasa: "bg-emerald-50 text-emerald-800", eticheta: "Incasata" },
  STORNO: { Icon: IconStorno, clasa: "bg-amber-50 text-amber-800", eticheta: "Storno" },
} as const;

function ActivityRow({ item }: { item: ActivityItem }) {
  const { Icon, clasa, eticheta } = FEL[item.fel];

  return (
    <Link href={item.href} className="rind-card">
      <span className={`activity-icon ${clasa}`}>
        <Icon className="h-[18px] w-[18px]" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink-900">{item.titlu}</span>
        <span className="mt-0.5 block truncate text-xs text-ink-500">
          {eticheta} · {item.subtitlu}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className="tabular block text-sm font-semibold text-ink-900">
          {formatLei(item.suma)}
        </span>
        <span className="mt-0.5 block text-xs text-ink-500">
          {item.data.toLocaleDateString("ro-RO", { day: "numeric", month: "short" })}
        </span>
      </span>
    </Link>
  );
}
