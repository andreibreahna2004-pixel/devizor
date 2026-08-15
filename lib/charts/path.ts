/**
 * Trasee SVG pentru graficele de pe panou.
 *
 * Modul pur: nicio referinta la DOM sau la baza de date, ca sa poata fi folosit
 * si pe server (sparkline randat direct in HTML) si in client (graficul
 * interactiv), si ca sa poata fi testat direct.
 */

export interface Punct {
  x: number;
  y: number;
}

/**
 * Curba neteda prin puncte, cu interpolare cubica MONOTONA (Fritsch-Carlson).
 *
 * Nu e o alegere estetica. O spline obisnuita (Catmull-Rom) trece prin puncte,
 * dar intre ele poate depasi: doua luni cu 0 si 40.000 lei ar desena o linie
 * care coboara sub zero inainte sa urce. Pe un grafic de bani, o valoare
 * negativa care nu exista in date e o minciuna desenata.
 *
 * Interpolarea monotona garanteaza ca segmentul dintre doua puncte ramine intre
 * valorile lor. Unde datele urca, curba urca; unde sint plate, e plata.
 */
export function smoothPath(puncte: Punct[]): string {
  if (puncte.length === 0) return "";
  if (puncte.length === 1) return `M ${puncte[0].x} ${puncte[0].y}`;
  if (puncte.length === 2) {
    return `M ${puncte[0].x} ${puncte[0].y} L ${puncte[1].x} ${puncte[1].y}`;
  }

  const n = puncte.length;

  // Pantele secantelor dintre puncte consecutive.
  const dx: number[] = [];
  const dy: number[] = [];
  const secante: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = puncte[i + 1].x - puncte[i].x;
    dx.push(h);
    dy.push(puncte[i + 1].y - puncte[i].y);
    secante.push(h === 0 ? 0 : (puncte[i + 1].y - puncte[i].y) / h);
  }

  // Tangenta in fiecare punct, pornind de la media secantelor vecine.
  const tangente: number[] = new Array(n);
  tangente[0] = secante[0];
  tangente[n - 1] = secante[n - 2];
  for (let i = 1; i < n - 1; i++) {
    // Un virf local (secantele au semne opuse) primeste tangenta zero: acolo
    // curba trebuie sa se aplatizeze, nu sa treaca peste.
    tangente[i] =
      secante[i - 1] * secante[i] <= 0 ? 0 : (secante[i - 1] + secante[i]) / 2;
  }

  // Limitarea Fritsch-Carlson: tine tangentele in cercul care garanteaza
  // monotonia pe fiecare segment.
  for (let i = 0; i < n - 1; i++) {
    if (secante[i] === 0) {
      tangente[i] = 0;
      tangente[i + 1] = 0;
      continue;
    }
    const a = tangente[i] / secante[i];
    const b = tangente[i + 1] / secante[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      tangente[i] = t * a * secante[i];
      tangente[i + 1] = t * b * secante[i];
    }
  }

  let d = `M ${round(puncte[0].x)} ${round(puncte[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    // Punctele de control ale bezierului cubic echivalent hermitului.
    const c1x = puncte[i].x + dx[i] / 3;
    const c1y = puncte[i].y + (tangente[i] * dx[i]) / 3;
    const c2x = puncte[i + 1].x - dx[i] / 3;
    const c2y = puncte[i + 1].y - (tangente[i + 1] * dx[i]) / 3;
    d += ` C ${round(c1x)} ${round(c1y)}, ${round(c2x)} ${round(c2y)}, ${round(puncte[i + 1].x)} ${round(puncte[i + 1].y)}`;
  }

  return d;
}

/** Traseul inchis sub curba, pentru umplerea in degrade. */
export function areaPath(puncte: Punct[], baza: number): string {
  if (puncte.length === 0) return "";
  const linie = smoothPath(puncte);
  const primul = puncte[0];
  const ultimul = puncte[puncte.length - 1];
  return `${linie} L ${round(ultimul.x)} ${round(baza)} L ${round(primul.x)} ${round(baza)} Z`;
}

/**
 * Aseaza valorile intr-o caseta de desen.
 *
 * Baza e mereu zero, nu minimul seriei. Pe un grafic de bani, o baza mutata pe
 * minim transforma o variatie de 2% intr-un munte: doua luni de 100.000 si
 * 102.000 ar umple toata inaltimea. Cu baza la zero, marimea desenata e
 * proportionala cu suma.
 *
 * Cind nu exista interval — toata seria e zero — linia se aseaza JOS, pe zero,
 * nu la mijlocul casetei: o linie prin mijloc pentru o luna fara documente
 * arata ca o valoare care nu exista.
 */
export function scaleaza(
  valori: number[],
  latime: number,
  inaltime: number,
  padding = 0,
  maximImpus?: number,
): Punct[] {
  if (valori.length === 0) return [];

  const max = maximImpus ?? Math.max(...valori);
  const min = Math.min(0, ...valori);
  const interval = max - min;

  const utila = inaltime - padding * 2;
  const pas = valori.length > 1 ? latime / (valori.length - 1) : 0;
  const jos = padding + utila;

  return valori.map((v, i) => ({
    x: round(i * pas),
    y: round(interval === 0 ? jos : jos - ((v - min) / interval) * utila),
  }));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
