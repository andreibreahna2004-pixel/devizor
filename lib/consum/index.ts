// Cale relativa, nu alias: modulul poate fi folosit si de scripturi care ruleaza
// in afara bundlerului, ca `lib/norme/index.ts`.
import raw from "../../data/consumuri.json";
import { normalizeForSearch } from "@/lib/norme";

/**
 * Consumurile specifice de materiale.
 *
 * Cite kg de adeziv intra intr-un mp de gresie, citi saci de mortar intr-un mp
 * de zidarie. E o reteta, in sensul din `.claude/skills/norma-deviz/`, dar cu
 * doua deosebiri care o fac legitima aici:
 *
 *  1. **sursa** — fise tehnice de producator si practica de azi, nu consumurile
 *     din indicatoarele din 1981, calibrate pe tehnologia de atunci;
 *  2. **la ce serveste** — cit material cumperi, nu cit costa lucrarea. Nu
 *     produce niciun leu si nu scrie in nicio linie de deviz, deci regula 1 din
 *     CLAUDE.md ramine neatinsa.
 *
 * Datele stau in fisier, nu in baza: sunt nationale, aceleasi pentru toate
 * firmele, si nu se schimba de la o zi la alta. In git se vede cine a schimbat o
 * cifra si cind — ceea ce la niste numere care ajung intr-o comanda de materiale
 * conteaza mai mult decit posibilitatea de a le edita din aplicatie.
 */

/** Intervalul in care cade consumul. Sursele reale dau intervale, nu cifre. */
export type Interval = [min: number, max: number];

export interface Ambalaj {
  /** Cum se vinde: sac, bidon, rola, colac. */
  um: string;
  /** Cit contine un ambalaj, in unitatea materialului. */
  continut: number;
}

export interface MaterialConsum {
  denumire: string;
  /** Unitatea materialului: kg, l, buc, mp, ml. */
  um: string;
  /** Consum fix pe unitatea lucrarii. Exclusiv cu `peMm` si `peVarianta`. */
  consum?: Interval;
  /** Consum pe milimetru de grosime. Se inmulteste cu grosimea ceruta. */
  peMm?: Interval;
  /** Consum care depinde de optiunea aleasa la parametrul retetei. */
  peVarianta?: Record<string, Interval>;
  ambalaj?: Ambalaj;
  /**
   * De unde vine cifra: un URL, sau eticheta `practica curenta` cind e un
   * interval din practica de santier si nu dintr-o fisa tehnica. Diferenta se
   * vede pe ecran — un interval din practica, spus ca atare, e util; acelasi
   * interval prezentat ca fisa tehnica ar fi o minciuna mica si greu de prins.
   */
  sursa: string;
  nota?: string;
}

export interface Parametru {
  cheie: "grosime" | "varianta";
  eticheta: string;
  /** Doar la `cheie: "varianta"`: optiunile intre care se alege. */
  optiuni?: string[];
  /** Doar la `cheie: "grosime"`: valoarea de pornire, in mm. */
  implicit?: number;
  sufix?: string;
}

export interface Reteta {
  id: string;
  denumire: string;
  categorie: string;
  /** Unitatea lucrarii: mp, mc, ml, buc, punct. */
  um: string;
  parametru?: Parametru;
  materiale: MaterialConsum[];
  /** Rezerva implicita pentru taieri si pierderi, in procente. */
  rezervaImplicita: number;
  nota?: string;
}

export const RETETE = raw as Reteta[];

/** Categoriile in ordinea in care se executa lucrarea pe santier. */
export const CATEGORII: string[] = RETETE.reduce<string[]>((acc, r) => {
  if (!acc.includes(r.categorie)) acc.push(r.categorie);
  return acc;
}, []);

const BY_ID = new Map(RETETE.map((r) => [r.id, r]));

export function getReteta(id: string): Reteta | null {
  return BY_ID.get(id) ?? null;
}

const SEARCH_INDEX = RETETE.map((r) => ({
  reteta: r,
  haystack: normalizeForSearch(
    `${r.denumire} ${r.categorie} ${r.materiale.map((m) => m.denumire).join(" ")}`,
  ),
}));

/**
 * Cautarea in retete.
 *
 * Trece prin `normalizeForSearch`, acelasi ca la norme, deci diacriticele nu
 * conteaza si "timplarie" gaseste "tamplarie". Se cauta si in denumirile
 * materialelor: cine scrie "adeziv" vrea sa vada unde intra adeziv, nu doar
 * lucrarile care au cuvintul in titlu.
 */
export function cautaRetete(interogare: string, limita = 50): Reteta[] {
  const cuvinte = normalizeForSearch(interogare).split(/\s+/).filter(Boolean);
  if (cuvinte.length === 0) return RETETE.slice(0, limita);

  return SEARCH_INDEX.filter((r) => cuvinte.every((c) => r.haystack.includes(c)))
    .slice(0, limita)
    .map((r) => r.reteta);
}
