import { areaPath, scaleaza, smoothPath } from "@/lib/charts/path";

/**
 * Linia mica din cardurile de sus.
 *
 * Componenta de server, fara stare: traseul se calculeaza la randare si pleaca
 * gata desenat in HTML. Animatia de trasare e pur CSS, deci linia apare si
 * daca JavaScript-ul nu s-a incarcat inca.
 *
 * `id` trebuie sa fie unic in pagina — degradeul se refera prin `url(#...)`, si
 * doua sparkline-uri cu acelasi id ar folosi amindoua prima definitie.
 */
export function Sparkline({
  id,
  puncte,
  ton = "brand",
  latime = 132,
  inaltime = 40,
  intirziere = 0,
}: {
  id: string;
  puncte: number[];
  ton?: "brand" | "ok" | "warn";
  latime?: number;
  inaltime?: number;
  /** Secunde de asteptare inainte sa inceapa trasarea, pentru efectul in cascada. */
  intirziere?: number;
}) {
  if (puncte.length < 2) {
    return <div style={{ width: latime, height: inaltime }} aria-hidden="true" />;
  }

  const culoare = `var(--spark-${ton})`;
  const coords = scaleaza(puncte, latime, inaltime, 4);
  const linie = smoothPath(coords);
  const arie = areaPath(coords, inaltime);

  return (
    <svg
      viewBox={`0 0 ${latime} ${inaltime}`}
      width={latime}
      height={inaltime}
      fill="none"
      aria-hidden="true"
      className="overflow-visible"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={culoare} stopOpacity="0.22" />
          <stop offset="100%" stopColor={culoare} stopOpacity="0" />
        </linearGradient>
      </defs>

      <path
        d={arie}
        fill={`url(#grad-${id})`}
        className="spark-arie"
        style={{ animationDelay: `${intirziere + 0.5}s` }}
      />
      <path
        d={linie}
        stroke={culoare}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="spark-linie"
        style={{ animationDelay: `${intirziere}s` }}
      />
    </svg>
  );
}
