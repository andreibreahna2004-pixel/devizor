import { round2 } from "@/lib/money";

/**
 * Gruparea unei serii pe intervale de timp.
 *
 * Modul pur, fara `server-only` si fara Prisma: acelasi cod grupeaza documentele
 * de pe panou si observatiile de pret ale unui material, iar amindoua se pot
 * testa fara baza de date.
 *
 * Gruparea se face in memorie, nu cu `date_trunc` in SQL. La volumul unei firme
 * de constructii diferenta e sub o milisecunda, iar bucketarea ramine testabila.
 */

export type RangeKey = "1L" | "3L" | "6L" | "1A";

const LUNI = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "noi", "dec"];

/** Inceputul zilei, in ora locala a serverului. */
export function ziua(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export interface Bucket {
  start: Date;
  eticheta: string;
}

/**
 * Intervalele in care se aduna valorile.
 *
 * Granularitatea urmeaza lungimea perioadei: pe o luna se vad zilele, pe un an
 * lunile. Altfel un an ar avea 365 de puncte inghesuite in cinci sute de pixeli
 * si linia ar deveni zgomot.
 */
export function bucketsFor(range: RangeKey, acum: Date): Bucket[] {
  const azi = ziua(acum);

  if (range === "1L") {
    return Array.from({ length: 30 }, (_, i) => {
      const start = new Date(azi);
      start.setDate(start.getDate() - (29 - i));
      return { start, eticheta: `${start.getDate()} ${LUNI[start.getMonth()]}` };
    });
  }

  if (range === "3L") {
    // Saptamini, ca sa iasa 13 puncte in loc de 91.
    return Array.from({ length: 13 }, (_, i) => {
      const start = new Date(azi);
      start.setDate(start.getDate() - (12 - i) * 7);
      return { start, eticheta: `${start.getDate()} ${LUNI[start.getMonth()]}` };
    });
  }

  const luni = range === "6L" ? 6 : 12;
  return Array.from({ length: luni }, (_, i) => {
    const start = new Date(azi.getFullYear(), azi.getMonth() - (luni - 1 - i), 1);
    return { start, eticheta: LUNI[start.getMonth()] };
  });
}

export interface Doc {
  data: Date;
  valoare: number;
}

/** Aduna valorile in intervale. Ce cade inaintea primului interval se ignora. */
export function aduna(docs: Doc[], buckets: Bucket[]): number[] {
  const sume = new Array(buckets.length).fill(0);

  for (const doc of docs) {
    // Cautare de la coada: ultimul interval care incepe inaintea documentului.
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (doc.data >= buckets[i].start) {
        sume[i] += doc.valoare;
        break;
      }
    }
  }

  return sume.map(round2);
}

/**
 * Ultima valoare observata in fiecare interval, purtata mai departe peste
 * intervalele goale.
 *
 * Pentru bani se aduna (`aduna`); pentru un pret nu se aduna nimic — doua
 * observatii in aceeasi luna nu fac pretul dublu. Iar o luna fara observatii nu
 * inseamna pret zero: inseamna ca nimeni n-a masurat, si atunci se pastreaza
 * ultimul pret cunoscut. `null` inainte de prima observatie, ca sa nu se
 * deseneze o linie inaintea primei masuratori.
 */
export function ultima(docs: Doc[], buckets: Bucket[]): (number | null)[] {
  const sortate = [...docs].sort((a, b) => a.data.getTime() - b.data.getTime());
  const valori: (number | null)[] = new Array(buckets.length).fill(null);

  let idx = 0;
  // Ce e mai vechi decit primul interval da valoarea de pornire: pretul exista
  // dinainte, doar fereastra e mai scurta.
  let curenta: number | null = null;
  while (idx < sortate.length && sortate[idx].data < buckets[0].start) {
    curenta = sortate[idx].valoare;
    idx++;
  }

  for (let i = 0; i < buckets.length; i++) {
    const pina = i + 1 < buckets.length ? buckets[i + 1].start : null;
    while (idx < sortate.length && (pina === null || sortate[idx].data < pina)) {
      curenta = sortate[idx].valoare;
      idx++;
    }
    valori[i] = curenta === null ? null : round2(curenta);
  }

  return valori;
}

/** Crestere procentuala fata de perioada anterioara. */
export function delta(acum: number, inainte: number): number | null {
  if (inainte === 0) return acum === 0 ? 0 : null;
  return round2(((acum - inainte) / inainte) * 100);
}
