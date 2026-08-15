"use client";

import { useMemo, useRef, useState } from "react";
import { areaPath, scaleaza, smoothPath } from "@/lib/charts/path";
import { formatLei } from "@/lib/money";
import type { RangeKey, SeriesPoint } from "@/lib/dashboard/metrics";

/**
 * Graficul de evolutie: devize emise fata de facturi emise.
 *
 * Desenat de mina in SVG, fara librarie de grafice. Are nevoie de doua linii,
 * patru butoane si un tooltip; o librarie ar aduce zeci de kilobyte si un al
 * doilea sistem de teme peste cel din globals.css.
 *
 * Latimea vine din `preserveAspectRatio="none"`, care intinde doar orizontala.
 * Grosimea liniei ramine constanta prin `vector-effect`, altfel s-ar ingrosa
 * odata cu intinderea.
 */

const W = 640;
const H = 240;
const PAD = 16;

const SERII = [
  { cheie: "devize" as const, eticheta: "Devize", culoare: "var(--chart-devize)" },
  { cheie: "facturi" as const, eticheta: "Facturi", culoare: "var(--chart-facturi)" },
];

export function EvolutionChart({
  serii,
  intervale,
}: {
  serii: Record<RangeKey, SeriesPoint[]>;
  intervale: { key: RangeKey; eticheta: string }[];
}) {
  const [range, setRange] = useState<RangeKey>("6L");
  const [ascunse, setAscunse] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const zona = useRef<HTMLDivElement>(null);

  const puncte = serii[range] ?? [];
  const vizibile = SERII.filter((s) => !ascunse.has(s.cheie));

  const desen = useMemo(() => {
    // Ambele serii se scaleaza pe acelasi maxim, altfel graficul ar sugera ca
    // devizele si facturile sint comparabile ca marime cind nu sint.
    const toate = vizibile.flatMap((s) => puncte.map((p) => p[s.cheie]));
    const max = toate.length > 0 ? Math.max(...toate) : 0;

    return SERII.map((s) => {
      const coords = scaleaza(
        puncte.map((p) => p[s.cheie]),
        W,
        H,
        PAD,
        max > 0 ? max : undefined,
      );
      return { ...s, coords, linie: smoothPath(coords), arie: areaPath(coords, H) };
    });
  }, [puncte, vizibile]);

  const gol = puncte.every((p) => p.devize === 0 && p.facturi === 0);

  function pozitie(e: React.MouseEvent | React.TouchEvent) {
    const el = zona.current;
    if (!el || puncte.length < 2) return;
    const r = el.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX : e.clientX;
    const raport = Math.min(1, Math.max(0, (x - r.left) / r.width));
    setHover(Math.round(raport * (puncte.length - 1)));
  }

  const activ = hover !== null ? puncte[hover] : null;
  const procentX = hover !== null && puncte.length > 1 ? (hover / (puncte.length - 1)) * 100 : 0;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {intervale.map((i) => (
            <button
              key={i.key}
              type="button"
              onClick={() => {
                setRange(i.key);
                setHover(null);
              }}
              aria-pressed={range === i.key}
              className={`chip-interval ${range === i.key ? "chip-interval-activ" : ""}`}
            >
              {i.eticheta}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {SERII.map((s) => {
            const pornit = !ascunse.has(s.cheie);
            return (
              <button
                key={s.cheie}
                type="button"
                aria-pressed={pornit}
                title={pornit ? `Ascunde ${s.eticheta}` : `Arata ${s.eticheta}`}
                onClick={() =>
                  setAscunse((prev) => {
                    const next = new Set(prev);
                    // Ultima serie vizibila nu se stinge: un grafic gol nu spune nimic.
                    if (next.has(s.cheie)) next.delete(s.cheie);
                    else if (prev.size < SERII.length - 1) next.add(s.cheie);
                    return next;
                  })
                }
                className={`chip-serie ${pornit ? "" : "chip-serie-stins"}`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: s.culoare }} />
                {s.eticheta}
              </button>
            );
          })}
        </div>
      </div>

      <div
        ref={zona}
        className="relative"
        onMouseMove={pozitie}
        onMouseLeave={() => setHover(null)}
        onTouchStart={pozitie}
        onTouchMove={pozitie}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="none"
          fill="none"
          role="img"
          aria-label={`Evolutia devizelor si a facturilor pe ultimele ${range}`}
          className="block"
        >
          <defs>
            {SERII.map((s) => (
              <linearGradient key={s.cheie} id={`ev-${s.cheie}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.culoare} stopOpacity="0.20" />
                <stop offset="100%" stopColor={s.culoare} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1="0"
              x2={W}
              y1={H * f}
              y2={H * f}
              stroke="var(--border)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {!gol &&
            desen.map((s) =>
              ascunse.has(s.cheie) ? null : (
                <g key={s.cheie}>
                  <path
                    d={s.arie}
                    fill={`url(#ev-${s.cheie})`}
                    className="ev-arie"
                    key={`a-${s.cheie}-${range}`}
                  />
                  <path
                    key={`l-${s.cheie}-${range}`}
                    d={s.linie}
                    stroke={s.culoare}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    className="ev-linie"
                  />
                </g>
              ),
            )}

          {hover !== null && !gol && (
            <>
              <line
                x1={desen[0].coords[hover]?.x ?? 0}
                x2={desen[0].coords[hover]?.x ?? 0}
                y1="0"
                y2={H}
                stroke="var(--border-strong)"
                strokeWidth="1"
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />
              {desen.map((s) =>
                ascunse.has(s.cheie) ? null : (
                  <circle
                    key={s.cheie}
                    cx={s.coords[hover]?.x ?? 0}
                    cy={s.coords[hover]?.y ?? 0}
                    r="4"
                    fill={s.culoare}
                    stroke="var(--surface)"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                ),
              )}
            </>
          )}
        </svg>

        {gol && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-ink-500">
            Nu sunt documente in perioada asta.
          </p>
        )}

        {activ && !gol && (
          <div
            className="chart-tooltip"
            style={{
              left: `${procentX}%`,
              transform: `translate(-${procentX}%, 0)`,
            }}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500">
              {activ.eticheta}
            </p>
            {SERII.filter((s) => !ascunse.has(s.cheie)).map((s) => (
              <p key={s.cheie} className="mt-1 flex items-center gap-2 text-xs">
                <span className="h-2 w-2 rounded-full" style={{ background: s.culoare }} />
                <span className="text-ink-600">{s.eticheta}</span>
                <span className="tabular ml-auto font-semibold text-ink-900">
                  {formatLei(activ[s.cheie])}
                </span>
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="mt-2 flex justify-between text-[11px] text-ink-500">
        <span>{puncte[0]?.eticheta}</span>
        <span>{puncte[puncte.length - 1]?.eticheta}</span>
      </div>
    </div>
  );
}
