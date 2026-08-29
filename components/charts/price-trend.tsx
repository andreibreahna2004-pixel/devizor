import { scaleaza, smoothPath } from "@/lib/charts/path";

/**
 * Evolutia pretului unui material.
 *
 * Nu e `Sparkline`, desi seamana, si diferenta e in axa. Sparkline-ul de pe panou
 * are baza la zero, fiindca acolo se deseneaza o marime — cati bani. Aici se
 * deseneaza o miscare: intre 320 si 340 lei sunt 6%, iar cu baza la zero cele
 * doua puncte ar fi lipite si graficul n-ar spune nimic.
 *
 * De aceea axa se stringe in jurul valorilor, cu un pic de aer. Pretul cerut de
 * regula "graficele nu deseneaza valori care nu exista in date" se plateste
 * altfel: golurile chiar lipsesc din linie, nu se deseneaza ca zero.
 */
export function PriceTrend({
  valori,
  id,
  latime = 120,
  inaltime = 36,
}: {
  /** `null` unde n-a existat masuratoare. */
  valori: (number | null)[];
  id: string;
  latime?: number;
  inaltime?: number;
}) {
  const cunoscute = valori.filter((v): v is number => v !== null);

  // Sub doua masuratori nu exista panta de aratat. Un punct singur desenat ca
  // linie ar sugera o stabilitate care n-a fost observata.
  if (cunoscute.length < 2) {
    return <div style={{ width: latime, height: inaltime }} aria-hidden />;
  }

  const min = Math.min(...cunoscute);
  const max = Math.max(...cunoscute);
  // Aer de 10% din interval, ca linia sa nu atinga marginile casetei. Cand toate
  // valorile sunt egale, intervalul e zero si aerul se ia din valoare.
  const aer = max === min ? Math.max(max * 0.05, 1) : (max - min) * 0.1;

  // Golurile se umplu cu ultima valoare cunoscuta doar pentru desen: `ultima`
  // din buckets a decis deja unde exista pret si unde nu.
  const pentruDesen: number[] = [];
  for (const v of valori) {
    if (v !== null) pentruDesen.push(v);
    else pentruDesen.push(pentruDesen[pentruDesen.length - 1] ?? cunoscute[0]);
  }

  const puncte = scaleaza(pentruDesen, latime, inaltime, 2, max + aer, min - aer);
  const urca = cunoscute[cunoscute.length - 1] >= cunoscute[0];

  return (
    <svg
      width={latime}
      height={inaltime}
      viewBox={`0 0 ${latime} ${inaltime}`}
      role="img"
      aria-label={`Evolutia pretului, de la ${cunoscute[0]} la ${cunoscute[cunoscute.length - 1]} lei`}
      className="shrink-0"
    >
      <path
        id={id}
        d={smoothPath(puncte)}
        fill="none"
        stroke={urca ? "var(--spark-warn)" : "var(--spark-ok)"}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
