import { type PriceObservation, parseNumar } from "../import";
import { type ConfigSite, absolut, monedaEsteRon, unitateDinText } from "./extract";

/**
 * Produsele din starea pe care aplicatia magazinului o lasa in pagina.
 *
 * Un magazin scris in Next sau Nuxt trimite datele o data ca JSON, ca sa le
 * foloseasca la hidratare, si abia apoi deseneaza lista din ele. Cand asta se
 * intampla, produsele **sunt in pagina** chiar daca DOM-ul livrat pare gol — si
 * atunci stratul asta e singurul care le vede, fara browser si fara model.
 *
 * Continutul e cod strain, deci se citeste numai cu `JSON.parse`, niciodata cu
 * `eval` sau `new Function`. Un payload pe care nu-l putem citi asa da lista
 * goala; asta e raspunsul onest, nu un motiv sa pornim un interpretor.
 */

/** Plimbarea e marginita: ruleaza pe calea de randare a paginii omului. */
const MAX_NODURI = 50_000;
const MAX_ADANCIME = 12;

const CHEI_NUME = ["name", "title", "productname", "denumire", "displayname", "label"];
const CHEI_PRET = [
  "price",
  "saleprice",
  "finalprice",
  "currentprice",
  "pret",
  "pricevalue",
  "unitprice",
  "grossprice",
  "amount",
  "value",
];
/**
 * Fara o cheie de identitate, orice obiect cu un text si un numar trece drept
 * produs — obiecte de configurare, texte de interfata, evenimente de urmarire.
 * Conditia asta taie aproape toate falsurile.
 */
const CHEI_IDENTITATE = ["url", "slug", "sku", "id", "productid", "code", "cod"];

const CHEI_UNITATE = ["unit", "unitate", "um", "unitofmeasure", "measurementunit"];
const CHEI_MONEDA = ["currency", "pricecurrency", "moneda"];

export function dinStareJson(
  html: string,
  config: ConfigSite,
  acum: Date,
): PriceObservation[] {
  const observatii: PriceObservation[] = [];
  const stare = { noduri: 0 };

  for (const brut of blocuriDeStare(html)) {
    let date: unknown;
    try {
      date = JSON.parse(brut);
    } catch {
      // Payload-ul Nuxt vine uneori invelit intr-o functie, deci nu e JSON. Se
      // sare peste el; alt strat il prinde daca poate.
      continue;
    }

    aduna(date, config, acum, observatii, stare, 0);
  }

  return observatii;
}

/** Locurile din care se poate scoate un JSON intreg, fara sa interpretam cod. */
function blocuriDeStare(html: string): string[] {
  const gasite: string[] = [];

  const scripturi = html.matchAll(
    /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const s of scripturi) gasite.push(s[1]);

  // `window.__NUXT__ = {...}` si `self.__next_f.push([...])`: se ia felia cu
  // paranteze echilibrate de dupa semnul egal si se incearca `JSON.parse`.
  for (const atribuire of html.matchAll(/__NUXT__\s*=\s*/gi)) {
    const felie = felieEchilibrata(html, atribuire.index + atribuire[0].length);
    if (felie) gasite.push(felie);
  }

  return gasite;
}

/**
 * Felia de la prima acolada pana la perechea ei.
 *
 * Numaratoare simpla de acolade, cu sarirea sirurilor si a scaparilor — altfel o
 * acolada dintr-un nume de produs ar inchide felia in mijloc.
 */
function felieEchilibrata(text: string, de_la: number): string | null {
  const start = text.indexOf("{", de_la);
  if (start === -1) return null;

  let adancime = 0;
  let inSir: string | null = null;

  for (let i = start; i < text.length; i++) {
    const c = text[i];

    if (inSir) {
      if (c === "\\") i++;
      else if (c === inSir) inSir = null;
      continue;
    }

    if (c === '"' || c === "'") inSir = c;
    else if (c === "{") adancime++;
    else if (c === "}") {
      adancime--;
      if (adancime === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

function aduna(
  nod: unknown,
  config: ConfigSite,
  acum: Date,
  iesire: PriceObservation[],
  stare: { noduri: number },
  adancime: number,
): void {
  if (adancime > MAX_ADANCIME || stare.noduri > MAX_NODURI) return;
  if (!nod || typeof nod !== "object") return;

  stare.noduri++;

  if (Array.isArray(nod)) {
    for (const x of nod) aduna(x, config, acum, iesire, stare, adancime + 1);
    return;
  }

  const o = nod as Record<string, unknown>;
  const produs = caProdus(o, config, acum);
  if (produs) iesire.push(produs);

  for (const valoare of Object.values(o)) {
    aduna(valoare, config, acum, iesire, stare, adancime + 1);
  }
}

/** Obiectul e produs doar daca are nume, pret **si** identitate. Vezi mai sus. */
function caProdus(
  o: Record<string, unknown>,
  config: ConfigSite,
  acum: Date,
): PriceObservation | null {
  const nume = primulSir(o, CHEI_NUME);
  if (!nume) return null;

  const pret = primulNumar(o, CHEI_PRET);
  if (pret === null || pret <= 0) return null;

  if (!CHEI_IDENTITATE.some((cheie) => gaseste(o, cheie) !== undefined)) return null;
  if (!monedaEsteRon(primulSir(o, CHEI_MONEDA))) return null;

  const url = primulSir(o, ["url", "link", "href", "slug"]);

  return {
    name: nume,
    unit: unitateDinText(primulSir(o, CHEI_UNITATE) ?? nume),
    price: pret,
    countyCode: null,
    observedAt: acum,
    supplier: config.nume,
    sourceUrl: absolut(config.baseUrl, url),
  };
}

/** Cheile se compara fara majuscule si fara underscore: `final_price` = `finalPrice`. */
function gaseste(o: Record<string, unknown>, cheie: string): unknown {
  for (const [k, v] of Object.entries(o)) {
    if (k.toLowerCase().replace(/[_-]/g, "") === cheie) return v;
  }
  return undefined;
}

function primulSir(o: Record<string, unknown>, chei: string[]): string | null {
  for (const cheie of chei) {
    const v = gaseste(o, cheie);
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

/**
 * Pretul, si cand e scris ca numar, si cand e sir, si cand e obiect.
 *
 * `{ price: { value: 62.9, currency: "RON" } }` si `{ price: { gross: 62.9 } }`
 * sunt amandoua forme uzuale; un pret ascuns intr-un obiect e tot un pret.
 */
function primulNumar(o: Record<string, unknown>, chei: string[]): number | null {
  for (const cheie of chei) {
    const v = gaseste(o, cheie);

    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = parseNumar(v);
      if (n !== null) return n;
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const interior = v as Record<string, unknown>;
      if (!monedaEsteRon(primulSir(interior, CHEI_MONEDA))) continue;
      const n = primulNumar(interior, ["value", "amount", "gross", "net", "price"]);
      if (n !== null) return n;
    }
  }
  return null;
}
