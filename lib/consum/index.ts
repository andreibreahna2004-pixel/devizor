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
  /**
   * Cum ii spune omul pe santier, nu cum se cheama in catalog: "rigips" pentru
   * gips-carton, "termopan" pentru timplarie PVC, "mana de spaclu" pentru masa
   * de spaclu. Fara ele, cautarea cere denumirea oficiala, pe care n-o foloseste
   * nimeni. E aceeasi punte pe care `searchNorme` o face peste ortografia de
   * dinainte de 1993, doar ca aici e de vocabular.
   */
  sinonime: string[];
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
  denumire: normalizeForSearch(r.denumire),
  sinonime: normalizeForSearch(r.sinonime.join(" ")),
  materiale: normalizeForSearch(r.materiale.map((m) => m.denumire).join(" ")),
  categorie: normalizeForSearch(r.categorie),
}));

/**
 * Cit de tare conteaza locul in care s-a potrivit un cuvint.
 *
 * Categoria ramane in index — ajuta la rasfoit, "acoperis" scoate tot capitolul
 * — dar cu scor mic: fara asta, o cautare de "gips carton" scotea intii faianta,
 * fiindca imparte capitolul cu peretii de rigips.
 */
const SCOR = { denumire: 50, sinonim: 40, material: 20, categorie: 5 } as const;

/**
 * Cuvintele de legatura nu spun nimic despre lucrare, dar strica ordonarea.
 *
 * "mana de spaclu" scotea intii profilele decorative, fiindca "de" se regaseste
 * in "decorative" si lua punctajul de denumire, in timp ce la termosistem cadea
 * pe sinonim. Se arunca inainte de potrivire; daca interogarea e numai din
 * asemenea cuvinte, se pastreaza asa cum a scris-o omul.
 */
const LEGATURA = new Set(["din", "sau", "pentru", "ale", "lui", "cel", "cea"]);

function cuvinteUtile(toate: string[]): string[] {
  const utile = toate.filter((c) => c.length > 2 && !LEGATURA.has(c));
  return utile.length > 0 ? utile : toate;
}

/**
 * Cautarea in retete.
 *
 * Trece prin `normalizeForSearch`, acelasi ca la norme, deci diacriticele nu
 * conteaza. Se cauta in patru locuri: denumirea, sinonimele de santier,
 * denumirile materialelor si categoria.
 *
 * Filtrul cere **toate** cuvintele — cine scrie doua cuvinte vrea ceva mai
 * ingust. Ordonarea vine din unde s-au potrivit: o lucrare care poarta cuvintul
 * in titlu bate una care doar il are printre materiale.
 */
export function cautaRetete(interogare: string, limita = 50): Reteta[] {
  const intreaga = normalizeForSearch(interogare);
  const toate = intreaga.split(/\s+/).filter(Boolean);
  if (toate.length === 0) return RETETE.slice(0, limita);

  const cuvinte = cuvinteUtile(toate);

  const potriviri: { reteta: Reteta; scor: number }[] = [];

  for (const r of SEARCH_INDEX) {
    let scor = 0;
    let toate = true;

    for (const cuvant of cuvinte) {
      if (r.denumire.includes(cuvant)) scor += SCOR.denumire;
      else if (r.sinonime.includes(cuvant)) scor += SCOR.sinonim;
      else if (r.materiale.includes(cuvant)) scor += SCOR.material;
      else if (r.categorie.includes(cuvant)) scor += SCOR.categorie;
      else {
        toate = false;
        break;
      }
    }

    if (!toate) continue;

    // Interogarea intreaga, regasita ca atare, e semnalul cel mai puternic:
    // cine scrie "rigips" vrea peretele de rigips, nu tot ce-l pomeneste.
    if (r.denumire.startsWith(intreaga)) scor += 100;
    else if (r.sinonime.includes(intreaga)) scor += 60;

    potriviri.push({ reteta: r.reteta, scor });
  }

  // Sortarea din JS e stabila, deci la scor egal ramine ordinea din fisier —
  // adica ordinea in care se executa lucrarile pe santier.
  return potriviri
    .sort((a, b) => b.scor - a.scor)
    .slice(0, limita)
    .map((p) => p.reteta);
}
