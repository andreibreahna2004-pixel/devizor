import { round2 } from "@/lib/money";
import type { Interval, MaterialConsum, Reteta } from "./index";

/**
 * Din reteta si cantitatea lucrarii ies cantitatile de material.
 *
 * Modul pur, ca `lib/pricing/calculator.ts`: nu atinge baza de date si nu stie
 * de Prisma, deci se testeaza direct. Aici nu se calculeaza bani — numai
 * cantitati. Vezi antetul din `index.ts` pentru de ce conteaza distinctia.
 */

export interface OptiuniCalcul {
  /** Cantitatea de lucrare, in unitatea retetei. */
  cantitate: number;
  /** Grosimea in mm, la retetele cu parametru de grosime. */
  grosime?: number;
  /** Optiunea aleasa, la retetele cu variante. */
  varianta?: string;
  /** Rezerva pentru taieri si pierderi, in procente. */
  rezervaProcent: number;
}

export interface RezultatMaterial {
  denumire: string;
  um: string;
  /** Cantitatea neta, inainte de rezerva. */
  netMin: number;
  netMax: number;
  /** Cantitatea cu rezerva adaugata — ce se comanda. */
  min: number;
  max: number;
  /** Cite ambalaje intregi, cand materialul se vinde ambalat. */
  ambalajeMin: number | null;
  ambalajeMax: number | null;
  ambalajUm: string | null;
  sursa: string;
  nota?: string;
}

/**
 * Consumul unui material pe o unitate de lucrare, dupa forma lui.
 *
 * Trei forme, si toate trei apar in date: fix pe unitate (plasa de fibra),
 * pe milimetru de grosime (mortare, sape, mase de spaclu) si pe varianta
 * (adezivul de gresie, dupa dimensiunea placii). Intoarce `null` cand reteta
 * cere o optiune pe care omul n-a ales-o inca.
 */
function consumUnitar(
  material: MaterialConsum,
  grosime: number | undefined,
  varianta: string | undefined,
): Interval | null {
  if (material.consum) return material.consum;

  if (material.peMm) {
    // Fara grosime nu exista cifra: un consum pe milimetru inmultit cu nimic ar
    // da zero, si un zero aratat ca rezultat s-ar citi ca "nu ai nevoie".
    if (grosime === undefined || !Number.isFinite(grosime) || grosime <= 0) return null;
    return [material.peMm[0] * grosime, material.peMm[1] * grosime];
  }

  if (material.peVarianta) {
    if (!varianta) return null;
    return material.peVarianta[varianta] ?? null;
  }

  return null;
}

export function calculeazaConsum(
  reteta: Reteta,
  optiuni: OptiuniCalcul,
): RezultatMaterial[] {
  const { cantitate, grosime, varianta, rezervaProcent } = optiuni;
  const factorRezerva = 1 + rezervaProcent / 100;

  const rezultate: RezultatMaterial[] = [];

  for (const material of reteta.materiale) {
    const unitar = consumUnitar(material, grosime, varianta);
    if (unitar === null) continue;

    const netMin = round2(unitar[0] * cantitate);
    const netMax = round2(unitar[1] * cantitate);
    const min = round2(netMin * factorRezerva);
    const max = round2(netMax * factorRezerva);

    // Ambalajele se rotunjesc in sus: un sac cumparat pe jumatate tot un sac e.
    // Din acelasi motiv se pleaca de la cantitatea cu rezerva, nu de la cea neta.
    const ambalaj = material.ambalaj;
    const ambalajeMin = ambalaj ? Math.ceil(min / ambalaj.continut) : null;
    const ambalajeMax = ambalaj ? Math.ceil(max / ambalaj.continut) : null;

    rezultate.push({
      denumire: material.denumire,
      um: material.um,
      netMin,
      netMax,
      min,
      max,
      ambalajeMin,
      ambalajeMax,
      ambalajUm: ambalaj?.um ?? null,
      sursa: material.sursa,
      nota: material.nota,
    });
  }

  return rezultate;
}

/**
 * Adevarat cand reteta are nevoie de o alegere pe care omul n-a facut-o.
 *
 * Interfata o foloseste ca sa ceara alegerea in loc sa afiseze un tabel din
 * care lipsesc jumatate din materiale fara nicio explicatie.
 */
export function cereAlegere(reteta: Reteta, optiuni: OptiuniCalcul): boolean {
  if (!reteta.parametru) return false;
  if (reteta.parametru.cheie === "grosime") {
    return optiuni.grosime === undefined || optiuni.grosime <= 0;
  }
  return !optiuni.varianta;
}
