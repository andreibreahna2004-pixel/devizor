import { parse } from "node-html-parser";
import { type PriceObservation, parseNumar } from "../import";
import { dinTipare } from "./euristica";
import { dinMicrodate } from "./microdate";
import { filtreazaPlauzibile } from "./plauzibil";
import { dinStareJson } from "./stare-app";

/**
 * Din pagina magazinului ies observatii de pret.
 *
 * Modul pur: primeste HTML si intoarce observatii. Nu atinge reteaua si nu stie
 * de baza de date, deci se testeaza pe pagini salvate — singurul fel in care un
 * extractor poate fi verificat, fiindca altfel "merge" inseamna "n-a aruncat".
 *
 * Straturi, in ordinea increderii — si, nu intamplator, si a costului:
 *
 *  1. **JSON-LD** (`schema.org/Product`). Magazinele il pun pentru Google, e
 *     standard si nu depinde de cum arata pagina. Cind exista, e sursa buna:
 *     supravietuieste unui redesign care ar rupe orice selector.
 *  2. **Microdate** schema.org: acelasi standard, scris ca atribute pe elemente.
 *  3. **Starea de aplicatie** lasata in pagina de Next sau Nuxt. Singurul strat
 *     care vede produsele cand lista se deseneaza abia in browser.
 *  4. **Selectoare CSS** — dar numai cele **invatate de model pe pagina reala**,
 *     nu ghicite. Se rup la un redesign, si atunci se reinvata.
 *  5. **Tipare**: fara niciun selector, pornind de la pretul in lei. Gratuit si
 *     fara cheie, deci merita incercat inaintea oricarui apel de model.
 *  6. **Modelul**, in `lib/ai/extrage-produse.ts`, cand nimic de mai sus n-a prins.
 *
 * Arbitrajul nu ia primul strat nevid, ci **primul strat destul de bun** — vezi
 * `alegeStrat`.
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
  /**
   * Cheia stabila a magazinului: intra in `SCRAPER_MAGAZINE`, in log si in
   * racire. Nu se schimba niciodata, oricat s-ar redenumi magazinul.
   */
  cheie: string;
  /**
   * Numele care ajunge in `MaterialPrice.supplier`. E singura identitate a
   * magazinului in baza; schimbat mai tarziu, istoricul se rupe in doua serii.
   */
  nume: string;
  baseUrl: string;
  /** Adresa paginii de rezultate pentru o cautare. */
  caleCautare: (interogare: string) => string;
  /**
   * Incercate in ordine, numai daca prima n-a dat nimic. Adresa de cautare a unui
   * magazin nu e un fapt verificabil de aici, deci se incearca formele uzuale in
   * loc sa se pretinda ca una e sigura.
   */
  caiAlternative?: ((interogare: string) => string)[];
  /**
   * Lipsesc la magazinele noi: nu se ghicesc selectoare. Se completeaza singure,
   * cand modelul citeste pagina si spune prin ce le-a gasit.
   */
  selectoare?: SelectoareSite;
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

export function absolut(baseUrl: string, href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

/**
 * Pretul e in lei, sau macar magazinul n-a spus altceva.
 *
 * Un pret in euro citit ca leu intra in catalog ca o cifra de cinci ori mai mica
 * decat adevarul, si nu se mai poate distinge dupa aceea: `MaterialPrice` creste
 * si nu se rescrie. Cand moneda lipseste se presupune lei — magazinele romanesti
 * o omit tocmai pentru ca e implicita.
 */
export function monedaEsteRon(moneda: unknown): boolean {
  if (typeof moneda !== "string" || moneda.trim() === "") return true;
  return /^(ron|lei)$/i.test(moneda.trim());
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

/**
 * Tipul se scrie in mai multe feluri, si toate inseamna produs.
 *
 * `"Product"`, dar si `"schema:Product"`, `"http://schema.org/Product"` sau
 * subtipurile `"ProductModel"` / `"IndividualProduct"`. Compararea exacta cu
 * `"Product"` arunca produse adevarate din pagini scrise perfect corect.
 */
function esteProdus(o: Record<string, unknown>): boolean {
  const tip = o["@type"];
  const tipuri = typeof tip === "string" ? [tip] : Array.isArray(tip) ? tip : [];
  return tipuri.some((t) => {
    if (typeof t !== "string") return false;
    const ultim = t.split(/[/:#]/).pop() ?? "";
    return /product$/i.test(ultim);
  });
}

function primaOferta(o: Record<string, unknown>): Record<string, unknown> | null {
  const oferte = o.offers;
  const lista = desfasoara(oferte).filter(
    (x): x is Record<string, unknown> => typeof x === "object" && x !== null,
  );
  return lista.find((x) => pretDinOferta(x) !== null) ?? null;
}

/**
 * Pretul unei oferte, in cele trei feluri in care il scriu magazinele.
 *
 * `price` direct; `priceSpecification.price` la cei care descriu si moneda si
 * unitatea separat; `lowPrice` la `AggregateOffer`, adica atunci cand acelasi
 * produs are mai multe variante — acolo pretul afisat in lista e cel mic.
 */
function pretDinOferta(oferta: Record<string, unknown>): unknown {
  if (oferta.price !== undefined) return oferta.price;

  const spec = oferta.priceSpecification;
  if (spec && typeof spec === "object") {
    const p = (spec as Record<string, unknown>).price;
    if (p !== undefined) return p;
  }

  if (oferta.lowPrice !== undefined) return oferta.lowPrice;
  return null;
}

/** Moneda unei oferte, cautata si in specificatia de pret. */
function monedaOfertei(oferta: Record<string, unknown>): unknown {
  if (oferta.priceCurrency !== undefined) return oferta.priceCurrency;
  const spec = oferta.priceSpecification;
  if (spec && typeof spec === "object") {
    return (spec as Record<string, unknown>).priceCurrency;
  }
  return undefined;
}

/** Unitatea unei oferte: `unitCode`, `unitText`, sau cea din specificatie. */
function unitateaOfertei(oferta: Record<string, unknown>): string | null {
  const spec =
    oferta.priceSpecification && typeof oferta.priceSpecification === "object"
      ? (oferta.priceSpecification as Record<string, unknown>)
      : {};

  for (const candidat of [oferta.unitCode, oferta.unitText, spec.unitCode, spec.unitText]) {
    if (typeof candidat === "string" && candidat.trim() !== "") return candidat;
  }
  return null;
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

      const brut = pretDinOferta(oferta);
      const pret = typeof brut === "number" ? brut : parseNumar(String(brut ?? ""));
      const nume = typeof o.name === "string" ? o.name.trim() : "";
      if (!nume || pret === null || !Number.isFinite(pret) || pret <= 0) continue;

      // Moneda se verifica inainte de orice: vezi `monedaEsteRon`.
      if (!monedaEsteRon(monedaOfertei(oferta))) continue;

      const unitate = unitateDinText(
        unitateaOfertei(oferta) ?? (typeof o.unitText === "string" ? o.unitText : nume),
      );

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
  const s = config.selectoare;
  if (!s) return [];

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

/** Straturile care pot produce observatii, in ordinea increderii. */
export type Strat = "jsonld" | "microdate" | "stare" | "selectoare" | "euristica" | "ai";

export interface RezultatExtragere {
  strat: Strat | null;
  observatii: PriceObservation[];
  /** Cate produse a dat fiecare strat, dupa filtrare. Pentru proba si pentru log. */
  peStrat: Partial<Record<Strat, number>>;
}

/**
 * Cate produse trebuie sa dea un strat ca sa fie crezut pe cuvant.
 *
 * Fara pragul asta, o pagina cu douazeci si patru de produse in grila si un singur
 * bloc JSON-LD pentru produsul promovat din banner ar da **un** produs si s-ar opri
 * acolo, multumita. Sub prag straturile se compara intre ele.
 */
const PRAG_STRAT = 3;

/**
 * Ce iese din pagina, si din ce strat.
 *
 * Nu se imbina niciodata doua straturi: rezultatele lor s-ar dubla peste aceleasi
 * produse, iar dedublarea dupa nume ar fi o presupunere in plus.
 */
export function alegeStrat(
  incercari: { strat: Strat; observatii: PriceObservation[] }[],
): RezultatExtragere {
  const peStrat: Partial<Record<Strat, number>> = {};
  for (const i of incercari) peStrat[i.strat] = i.observatii.length;

  const destulDeBun = incercari.find((i) => i.observatii.length >= PRAG_STRAT);
  if (destulDeBun) {
    return { strat: destulDeBun.strat, observatii: destulDeBun.observatii, peStrat };
  }

  // Sub prag: castiga cel cu cele mai multe, iar la egalitate cel mai de incredere,
  // adica primul in ordinea de mai sus.
  let castigator: { strat: Strat; observatii: PriceObservation[] } | null = null;
  for (const i of incercari) {
    if (i.observatii.length > (castigator?.observatii.length ?? 0)) castigator = i;
  }

  if (!castigator) return { strat: null, observatii: [], peStrat };
  return { strat: castigator.strat, observatii: castigator.observatii, peStrat };
}

/**
 * Straturile deterministe ale unei pagini, in ordine.
 *
 * Stratul cu model nu e aici: are nevoie de retea si de cheie, deci sta in
 * `lib/ai/`, iar `cautaLaUnMagazin` il cheama numai daca astea n-au dat nimic.
 * Modulul asta ramane pur, si de aceea se poate testa pe pagini salvate.
 */
export function extrageDeterminist(
  html: string,
  config: ConfigSite,
  acum: Date,
  interogare = "",
): RezultatExtragere {
  const declarate = { textPagina: undefined, interogare: undefined };
  // Straturile 1-3 sunt declarate de magazin: ce scrie acolo e ce vinde el, deci nu
  // se filtreaza dupa interogare. Straturile 4-5 ghicesc structura paginii, si
  // atunci relevanta e gardul care opreste o pagina de categorie sa umple catalogul.
  const ghicite = { interogare: interogare || undefined };

  return alegeStrat([
    { strat: "jsonld", observatii: filtreazaPlauzibile(dinJsonLd(html, config, acum), declarate) },
    { strat: "microdate", observatii: filtreazaPlauzibile(dinMicrodate(html, config, acum), declarate) },
    { strat: "stare", observatii: filtreazaPlauzibile(dinStareJson(html, config, acum), declarate) },
    { strat: "selectoare", observatii: filtreazaPlauzibile(dinSelectoare(html, config, acum), ghicite) },
    { strat: "euristica", observatii: filtreazaPlauzibile(dinTipare(html, config, acum), ghicite) },
  ]);
}

/**
 * Observatiile din pagina, fara detalii.
 *
 * Invelis peste `extrageDeterminist`, pentru apelantii carora nu le trebuie decat
 * lista.
 */
export function extrageProduse(
  html: string,
  config: ConfigSite,
  acum = new Date(),
): PriceObservation[] {
  return extrageDeterminist(html, config, acum).observatii;
}
