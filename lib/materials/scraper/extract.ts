import { parse } from "node-html-parser";
import { type PriceObservation, parseNumar } from "../import";

/**
 * Din pagina magazinului ies observatii de pret.
 *
 * Modul pur: primeste HTML si intoarce observatii. Nu atinge reteaua si nu stie
 * de baza de date, deci se testeaza pe pagini salvate — singurul fel in care un
 * extractor poate fi verificat, fiindca altfel "merge" inseamna "n-a aruncat".
 *
 * Doua straturi, in ordinea increderii:
 *
 *  1. **JSON-LD** (`schema.org/Product`). Magazinele il pun pentru Google, e
 *     standard si nu depinde de cum arata pagina. Cind exista, e sursa buna:
 *     supravietuieste unui redesign care ar rupe orice selector.
 *  2. **Selectoare CSS**, cind JSON-LD lipseste sau e stricat. Sunt legate de
 *     structura paginii, deci se rup la refacerea ei — de aceea stau intr-un
 *     singur obiect de configurare, usor de corectat.
 */

export interface SelectoareSite {
  /** Cardul unui produs in lista de rezultate. */
  card: string;
  denumire: string;
  /** Pretul curent. */
  pret: string;
  /**
   * Pretul vechi, taiat, la produsele reduse. Nu se citeste — se **sterge** din
   * card inainte de a citi pretul curent. La Dedeman un parchet redus arata
   * "57,90" linga "67,91"; cel taiat, luat din greseala, ar intra in catalog ca
   * un pret care nu se mai practica.
   */
  pretVechi?: string;
  um?: string;
  link?: string;
}

export interface ConfigSite {
  nume: string;
  baseUrl: string;
  /** Adresa paginii de rezultate pentru o cautare. */
  caleCautare: (interogare: string) => string;
  selectoare: SelectoareSite;
}

/** Unitatile in care vand magazinele, normalizate la formele din aplicatie. */
const UNITATI: [RegExp, string][] = [
  [/\b(mp|m2|m²|metru\s*patrat)\b/i, "mp"],
  [/\b(mc|m3|m³|metru\s*cub)\b/i, "mc"],
  [/\b(ml|metru\s*liniar|metru)\b/i, "ml"],
  [/\bkg\b/i, "kg"],
  [/\b(l|litru|litri)\b/i, "l"],
  [/\bsac\b/i, "sac"],
  [/\bset\b/i, "set"],
  [/\b(buc|bucata)\b/i, "buc"],
];

/**
 * Unitatea, din textul care insoteste pretul ("57,90 lei/mp").
 *
 * Fara unitate nu se poate compara nimic, dar nici nu se poate ghici: cand nu se
 * citeste, ramane "buc", forma neutra pe care omul o schimba. E aceeasi alegere
 * ca la normele fara unitate in indicator.
 */
export function unitateDinText(text: string | null | undefined): string {
  if (!text) return "buc";
  const dupaSlash = text.split("/")[1] ?? text;
  for (const [tipar, unitate] of UNITATI) {
    if (tipar.test(dupaSlash)) return unitate;
  }
  return "buc";
}

function absolut(baseUrl: string, href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

/** Toate nodurile din JSON-LD, oricat de adanc ar fi ingropate in liste. */
function desfasoara(nod: unknown, iesire: unknown[] = []): unknown[] {
  if (Array.isArray(nod)) {
    for (const x of nod) desfasoara(x, iesire);
    return iesire;
  }
  if (nod && typeof nod === "object") {
    iesire.push(nod);
    const o = nod as Record<string, unknown>;
    // Listele de produse vin ca ItemList cu itemListElement; graful, ca @graph.
    for (const cheie of ["itemListElement", "item", "@graph", "hasPart"]) {
      if (o[cheie]) desfasoara(o[cheie], iesire);
    }
  }
  return iesire;
}

function esteProdus(o: Record<string, unknown>): boolean {
  const tip = o["@type"];
  if (typeof tip === "string") return tip === "Product";
  if (Array.isArray(tip)) return tip.includes("Product");
  return false;
}

function primaOferta(o: Record<string, unknown>): Record<string, unknown> | null {
  const oferte = o.offers;
  const lista = desfasoara(oferte).filter(
    (x): x is Record<string, unknown> => typeof x === "object" && x !== null,
  );
  return lista.find((x) => x.price !== undefined) ?? null;
}

/**
 * Observatiile din blocurile JSON-LD ale paginii.
 *
 * Un bloc stricat nu opreste extragerea: se sare peste el si se merge mai
 * departe. O pagina cu zece produse din care unul are JSON invalid trebuie sa
 * dea noua observatii, nu zero.
 */
export function dinJsonLd(
  html: string,
  config: ConfigSite,
  acum: Date,
): PriceObservation[] {
  const observatii: PriceObservation[] = [];
  const blocuri = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );

  for (const bloc of blocuri) {
    let date: unknown;
    try {
      date = JSON.parse(bloc[1]);
    } catch {
      continue;
    }

    for (const nod of desfasoara(date)) {
      const o = nod as Record<string, unknown>;
      if (!esteProdus(o)) continue;

      const oferta = primaOferta(o);
      if (!oferta) continue;

      const pret =
        typeof oferta.price === "number"
          ? oferta.price
          : parseNumar(String(oferta.price ?? ""));
      const nume = typeof o.name === "string" ? o.name.trim() : "";
      if (!nume || pret === null || !Number.isFinite(pret) || pret <= 0) continue;

      const unitate =
        typeof oferta.unitCode === "string"
          ? unitateDinText(oferta.unitCode)
          : unitateDinText(typeof o.unitText === "string" ? o.unitText : nume);

      observatii.push({
        name: nume,
        unit: unitate,
        price: pret,
        // Pretul afisat de magazin online e national: judetul ales schimba
        // disponibilitatea si magazinul, nu cifra. Vezi CLAUDE.md.
        countyCode: null,
        observedAt: acum,
        supplier: config.nume,
        sourceUrl: absolut(config.baseUrl, typeof o.url === "string" ? o.url : null),
      });
    }
  }

  return observatii;
}

/** Observatiile din structura paginii, cand JSON-LD lipseste. */
export function dinSelectoare(
  html: string,
  config: ConfigSite,
  acum: Date,
): PriceObservation[] {
  const { selectoare: s } = config;
  const document = parse(html);
  const observatii: PriceObservation[] = [];

  for (const card of document.querySelectorAll(s.card)) {
    // Pretul vechi se scoate din card inainte de citire, ca sa nu poata fi luat
    // din greseala. Mai sigur decat sa ne bazam pe ordinea selectoarelor.
    if (s.pretVechi) {
      for (const vechi of card.querySelectorAll(s.pretVechi)) vechi.remove();
    }

    const nume = card
      .querySelectorAll(s.denumire)
      .map((n) => n.text.trim())
      .find((t) => t.length > 0);
    if (!nume) continue;

    // Se ia primul nod care chiar da un numar, nu primul care se potriveste cu
    // selectorul. Cu un selector larg, primul nod poate fi titlul; asa nu se
    // pierde produsul din cauza ca selectorul nu e destul de ingust.
    //
    // Pretul si unitatea vin lipite: "26,50 lei/sac". Numarul se citeste numai
    // din partea dinaintea slash-ului — cu sufixul cu tot, `parseNumar` nu vede
    // un numar.
    let pret: number | null = null;
    let textPret = "";
    for (const nod of card.querySelectorAll(s.pret)) {
      const text = nod.text.trim();
      const valoare = parseNumar(text.split("/")[0]);
      if (valoare !== null && Number.isFinite(valoare) && valoare > 0) {
        pret = valoare;
        textPret = text;
        break;
      }
    }
    if (pret === null) continue;

    const textUm = s.um ? card.querySelector(s.um)?.text : textPret;
    const href = s.link ? card.querySelector(s.link)?.getAttribute("href") : null;

    observatii.push({
      name: nume,
      unit: unitateDinText(textUm),
      price: pret,
      countyCode: null,
      observedAt: acum,
      supplier: config.nume,
      sourceUrl: absolut(config.baseUrl, href),
    });
  }

  return observatii;
}

/**
 * Observatiile din pagina, cu JSON-LD inaintea selectoarelor.
 *
 * Cand JSON-LD da ceva, selectoarele nici nu se incearca: rezultatele lor s-ar
 * dubla peste aceleasi produse, iar dedublarea dupa nume ar fi o presupunere in
 * plus.
 */
export function extrageProduse(
  html: string,
  config: ConfigSite,
  acum = new Date(),
): PriceObservation[] {
  const dinStandard = dinJsonLd(html, config, acum);
  if (dinStandard.length > 0) return dinStandard;
  return dinSelectoare(html, config, acum);
}
