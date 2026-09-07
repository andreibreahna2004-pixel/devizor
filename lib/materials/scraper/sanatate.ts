/**
 * Ce magazine merita intrebate acum.
 *
 * Cu patru magazine, unul care nu da niciodata nimic nu e doar inutil: costa la
 * fiecare cautare un robots.txt, o pagina, un timeout de opt secunde si — daca a
 * ajuns pana la ultimul strat — un apel de model. Dupa cateva incercari la rand
 * fara rezultat, magazinul se lasa in pace un timp.
 *
 * Starea sta in memorie, nu in baza. E ieftin de reconstruit, si un tabel ar cere
 * o migrare si o curatare pentru o informatie care oricum nu supravietuieste unui
 * deploy. Consecinta, spusa pe fata: pe mai multe instante, fiecare isi tine
 * socoteala ei.
 */

/** Dupa atatea incercari la rand fara niciun produs, magazinul se sare. */
const PRAG_ESECURI = 3;
const RACIRE_IMPLICITA_MS = 6 * 3_600_000;

interface Stare {
  esecuri: number;
  panaLa: number;
  /** Ca interdictia din robots.txt sa se scrie in log o data, nu la fiecare cautare. */
  robotsAnuntat: boolean;
}

const stari = new Map<string, Stare>();

function stareaLui(cheie: string): Stare {
  let s = stari.get(cheie);
  if (!s) {
    s = { esecuri: 0, panaLa: 0, robotsAnuntat: false };
    stari.set(cheie, s);
  }
  return s;
}

function racireMs(): number {
  const din = Number(process.env.SCRAPER_RACIRE_MS);
  return Number.isFinite(din) && din > 0 ? din : RACIRE_IMPLICITA_MS;
}

export function poateFiIntrebat(cheie: string, acum = Date.now()): boolean {
  return acum >= stareaLui(cheie).panaLa;
}

/**
 * Se noteaza cum a mers.
 *
 * Un `blocat` (403 sau 429) intra direct in racire, fara sa mai astepte pragul: cand
 * magazinul spune raspicat nu, insistenta n-aduce produse, aduce blocare.
 */
export function noteazaRezultat(
  cheie: string,
  rezultat: "reusit" | "gol" | "blocat",
  acum = Date.now(),
): void {
  const s = stareaLui(cheie);

  if (rezultat === "reusit") {
    s.esecuri = 0;
    s.panaLa = 0;
    return;
  }

  if (rezultat === "blocat") {
    s.esecuri = PRAG_ESECURI;
    s.panaLa = acum + racireMs();
    return;
  }

  s.esecuri++;
  if (s.esecuri >= PRAG_ESECURI) s.panaLa = acum + racireMs();
}

/** Adevarat o singura data per magazin: pentru mesajul despre robots.txt. */
export function deAnuntatRobots(cheie: string): boolean {
  const s = stareaLui(cheie);
  if (s.robotsAnuntat) return false;
  s.robotsAnuntat = true;
  return true;
}

/** Doar pentru teste. */
export function reseteazaSanatate(): void {
  stari.clear();
}
