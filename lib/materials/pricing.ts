import { normalizeForSearch } from "@/lib/norme";

/**
 * Alegerea pretului de referinta pentru un material.
 *
 * Modul pur: nu atinge baza de date si nu stie de Prisma, deci se testeaza
 * direct — ca `lib/pricing/calculator.ts` si `lib/ai/map-tool-output.ts`.
 *
 * Ce se decide aici e ce cifra vede omul ca reper. Nu e pretul din deviz:
 * reperul se propune, omul il accepta sau scrie altul. Vezi regula 1 din
 * CLAUDE.md.
 */

export interface Observatie {
  price: number;
  /** `null` = observatie nationala. */
  countyCode: string | null;
  observedAt: Date;
  supplier?: string | null;
  sourceUrl?: string | null;
}

export interface Reper {
  price: number;
  observedAt: Date;
  /** Adevarat cind pretul nu e din judetul cerut, ci media pe tara. */
  national: boolean;
  supplier?: string | null;
  sourceUrl?: string | null;
}

/**
 * Cel mai recent pret pentru un judet, cu rezerva pe national.
 *
 * Judetul bate vechimea: o observatie de acum trei saptamini din Cluj spune mai
 * mult despre Cluj decit una de ieri din toata tara. Cind judetul n-are nimic,
 * se intoarce reperul national marcat ca atare — omul trebuie sa stie ca se uita
 * la o medie, nu la piata lui.
 */
export function reperPentruJudet(
  observatii: Observatie[],
  countyCode: string | null,
): Reper | null {
  if (observatii.length === 0) return null;

  const maiNoua = (a: Observatie, b: Observatie) =>
    b.observedAt.getTime() - a.observedAt.getTime();

  if (countyCode) {
    const locale = observatii.filter((o) => o.countyCode === countyCode);
    if (locale.length > 0) {
      const o = [...locale].sort(maiNoua)[0];
      return {
        price: o.price,
        observedAt: o.observedAt,
        national: false,
        supplier: o.supplier ?? null,
        sourceUrl: o.sourceUrl ?? null,
      };
    }
  }

  const nationale = observatii.filter((o) => o.countyCode === null);
  const pool = nationale.length > 0 ? nationale : observatii;
  const o = [...pool].sort(maiNoua)[0];

  return {
    price: o.price,
    observedAt: o.observedAt,
    national: true,
    supplier: o.supplier ?? null,
    sourceUrl: o.sourceUrl ?? null,
  };
}

/**
 * Manopera de referinta intr-un judet.
 *
 * Furnizorii nu vind manopera, deci nu exista pret de raft de citit. Se pleaca
 * de la un reper national si se inmulteste cu indicele judetului, calculat din
 * statistica oficiala. Fara indice se intoarce reperul national neatins — mai
 * bine o cifra pe tara, spusa ca atare, decit una ajustata cu un coeficient
 * inventat.
 */
export function manoperaCuIndice(
  reperNational: number,
  indice: number | null,
): { price: number; ajustat: boolean } {
  if (indice === null || !Number.isFinite(indice) || indice <= 0) {
    return { price: round2(reperNational), ajustat: false };
  }
  return { price: round2(reperNational * indice), ajustat: true };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Cautarea in catalogul de materiale.
 *
 * Acelasi tipar ca `searchNorme`: se trece prin `normalizeForSearch`, deci
 * "sapa" gaseste "Sapa autonivelanta" si diacriticele nu conteaza. Toate
 * cuvintele cautarii trebuie sa se regaseasca — cine scrie doua cuvinte vrea
 * ceva mai ingust, nu mai larg.
 */
export function potrivesteMaterial(nume: string, interogare: string): boolean {
  const tinta = normalizeForSearch(nume);
  const cuvinte = normalizeForSearch(interogare).split(/\s+/).filter(Boolean);
  if (cuvinte.length === 0) return false;
  return cuvinte.every((c) => tinta.includes(c));
}
