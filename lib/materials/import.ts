import { normalizeForSearch } from "@/lib/norme";

/**
 * Intrarea preturilor in aplicatie.
 *
 * O singura interfata pentru orice sursa: lista de preturi primita de la
 * furnizor, pagina lui de pe internet, sau o cifra scrisa de om. Un adaptor nou
 * produce observatii si atat — restul lantului nu-l cunoaste.
 *
 * Modulul e pur, fara retea si fara baza de date: parsarea si curatarea se
 * testeaza direct, iar adaptoarele care chiar ies pe internet stau separat.
 */

export interface PriceObservation {
  name: string;
  unit: string;
  price: number;
  /** Cod ISO 3166-2:RO; `null` cand pretul e national. */
  countyCode: string | null;
  observedAt: Date;
  supplier: string | null;
  sourceUrl: string | null;
}

export interface PriceSource {
  /** Numele sursei, asa cum apare in fata omului. */
  name: string;
  fetch(): Promise<PriceObservation[]>;
}

/**
 * Numarul, asa cum il scriu listele de preturi romanesti.
 *
 * "1.234,56" e o mie doua sute; "1,234.56" e tot aia, scrisa englezeste. Cand
 * exista amandoua, ultimul decide zecimalele.
 *
 * Cand exista unul singur, e ambiguu: "1.234" poate fi o mie doua sute (romaneste)
 * sau unu virgula doua sute treizeci si patru (englezeste). Decide numarul de
 * cifre de dupa — preturile au doi bani, nu trei: exact trei cifre inseamna
 * separator de mii. Exceptia e partea intreaga zero, unde "0.125" nu poate fi
 * mie, deci ramane zecimal.
 *
 * Un pret citit gresit cu factor 1000 ar trece neobservat printr-un import de
 * mii de randuri, si de aici ar ajunge intr-o oferta.
 */
export function parseNumar(brut: string): number | null {
  const curat = brut.trim().replace(/\s|lei|RON/gi, "");
  if (curat === "") return null;

  const ultimaVirgula = curat.lastIndexOf(",");
  const ultimulPunct = curat.lastIndexOf(".");

  let normalizat: string;
  if (ultimaVirgula === -1 && ultimulPunct === -1) {
    normalizat = curat;
  } else if (ultimaVirgula !== -1 && ultimulPunct !== -1) {
    normalizat =
      ultimaVirgula > ultimulPunct
        ? curat.replace(/\./g, "").replace(",", ".")
        : curat.replace(/,/g, "");
  } else {
    const poz = ultimaVirgula !== -1 ? ultimaVirgula : ultimulPunct;
    const inainte = curat.slice(0, poz);
    const dupa = curat.slice(poz + 1);
    const eMii = dupa.length === 3 && /^\d+$/.test(dupa) && inainte !== "0" && inainte !== "";
    normalizat = eMii
      ? inainte + dupa
      : curat.replace(ultimaVirgula !== -1 ? "," : ".", ".");
  }

  const n = Number(normalizat);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export interface ParsedRow {
  observation: PriceObservation;
}

export interface ParseResult {
  observations: PriceObservation[];
  /** Randurile sarite, cu motivul — ca omul sa stie ce n-a intrat si de ce. */
  skipped: { line: number; reason: string }[];
}

/**
 * Lista de preturi ca fisier separat prin virgula.
 *
 * Antetul e obligatoriu si decide coloanele, ca sa nu depinda de ordinea in care
 * le pune fiecare furnizor. Recunoscute: `denumire`, `um`, `pret`, si optional
 * `judet` (cod ISO) si `data`.
 *
 * Un rand stricat nu opreste importul, dar nici nu dispare tacut: ajunge in
 * `skipped` cu numarul lui. Un pret lipsa e o linie pierduta, nu o linie cu zero.
 */
export function parseCsv(
  text: string,
  implicit: { supplier: string | null; observedAt: Date; countyCode: string | null },
): ParseResult {
  const linii = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (linii.length < 2) return { observations: [], skipped: [] };

  const sep = (linii[0].match(/;/g)?.length ?? 0) > (linii[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  // Se scot si punctele si spatiile: furnizorii scriu "U.M.", "u m", "UM".
  const antet = linii[0]
    .split(sep)
    .map((c) => normalizeForSearch(c.trim()).replace(/[^a-z0-9]/g, ""));

  const idx = (nume: string[]) => antet.findIndex((c) => nume.includes(c));
  const iNume = idx(["denumire", "material", "produs", "nume"]);
  const iUm = idx(["um", "unitate", "unitateademasura"]);
  const iPret = idx(["pret", "pretunitar", "valoare"]);
  const iJudet = idx(["judet"]);
  const iData = idx(["data"]);

  const observations: PriceObservation[] = [];
  const skipped: { line: number; reason: string }[] = [];

  if (iNume === -1 || iPret === -1) {
    return {
      observations: [],
      skipped: [{ line: 1, reason: "Antetul nu are coloana de denumire sau de pret" }],
    };
  }

  for (let i = 1; i < linii.length; i++) {
    const c = linii[i].split(sep).map((x) => x.trim());
    const name = c[iNume]?.trim();
    if (!name) {
      skipped.push({ line: i + 1, reason: "Fara denumire" });
      continue;
    }

    const price = parseNumar(c[iPret] ?? "");
    if (price === null) {
      skipped.push({ line: i + 1, reason: `Pret necitit: "${c[iPret] ?? ""}"` });
      continue;
    }

    const dataBruta = iData >= 0 ? c[iData] : "";
    const observedAt = dataBruta ? new Date(dataBruta) : implicit.observedAt;

    observations.push({
      name,
      unit: (iUm >= 0 ? c[iUm] : "") || "buc",
      price,
      countyCode: (iJudet >= 0 ? c[iJudet] : "") || implicit.countyCode,
      observedAt: Number.isNaN(observedAt.getTime()) ? implicit.observedAt : observedAt,
      supplier: implicit.supplier,
      sourceUrl: null,
    });
  }

  return { observations, skipped };
}
