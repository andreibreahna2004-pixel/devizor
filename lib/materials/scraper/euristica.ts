import { type HTMLElement, parse } from "node-html-parser";
import { type PriceObservation, parseNumar } from "../import";
import { type ConfigSite, absolut, unitateDinText } from "./extract";

/**
 * Produsele dintr-o pagina despre care nu stim nimic.
 *
 * Stratul asta nu are niciun selector si nu stie ce magazin citeste. Se agata de
 * singurul lucru pe care toate magazinele romanesti il scriu la fel: **pretul in
 * lei**. De acolo urca la cardul care il contine si se convinge ca e o lista de
 * produse, nu un pret razlet din bara de sus.
 *
 * De ce exista, cand mai jos urmeaza un model care citeste pagina: fiindca e
 * gratuit si merge fara cheie. Un magazin pe care euristica il prinde nu costa
 * niciun token, niciodata.
 */

/** Un pret e un numar urmat de moneda. Fara moneda, "8 mm" si "2026" ar fi preturi. */
const TIPAR_PRET = /([\d][\d.,\s ]*)\s*(?:lei|ron)\b/i;

/** Peste atat, nodul nu mai e eticheta pretului, e o bucata de pagina. */
const MAX_TEXT_FRUNZA = 40;
/** Peste atat, stramosul nu mai e un card, e grila sau pagina. */
const MAX_TEXT_CARD = 600;
const MAX_URCARE = 6;

/** Cum arata pretul vechi, taiat, in vocabularul oricarui magazin. */
const TIPAR_TAIAT = /old|vechi|barat|through|was|initial|list-?price|crossed|stroke/i;

export function dinTipare(
  html: string,
  config: ConfigSite,
  acum: Date,
): PriceObservation[] {
  const document = parse(html);

  const carduri = new Map<HTMLElement, { pret: number; textPret: string }>();

  for (const nod of document.querySelectorAll("*")) {
    if (esteTaiat(nod)) continue;

    const text = textPropriu(nod);
    if (text.length === 0 || text.length > MAX_TEXT_FRUNZA) continue;

    const potrivire = TIPAR_PRET.exec(text);
    if (!potrivire) continue;

    const pret = parseNumar(potrivire[1]);
    if (pret === null || !Number.isFinite(pret) || pret <= 0) continue;

    const card = urcaLaCard(nod);
    // Primul pret gasit intr-un card ramane pretul lui: in ordinea documentului,
    // pretul curent vine inaintea celor secundare ("pret vechi" e deja exclus,
    // "pret pe unitate" vine dupa).
    if (card && !carduri.has(card)) carduri.set(card, { pret, textPret: text });
  }

  const grup = grupulCelMaiNumeros([...carduri.keys()]);
  if (grup.length < 2) {
    // Un singur card nu e o lista. Asa raman afara "de la 9,99 lei" din banner si
    // "livrare 19,99 lei" din subsol, care altfel ar intra in catalog ca produse.
    return [];
  }

  const observatii: PriceObservation[] = [];

  for (const card of grup) {
    const gasit = carduri.get(card);
    if (!gasit) continue;

    const nume = numeleCardului(card, gasit.textPret);
    if (!nume) continue;

    observatii.push({
      name: nume,
      unit: unitateDinText(gasit.textPret),
      price: gasit.pret,
      countyCode: null,
      observedAt: acum,
      supplier: config.nume,
      sourceUrl: absolut(config.baseUrl, card.querySelector("a[href]")?.getAttribute("href")),
    });
  }

  return observatii;
}

/** Textul nodului fara textul copiilor lui — asa se ajunge la frunza, nu la card. */
function textPropriu(nod: HTMLElement): string {
  let text = "";
  for (const copil of nod.childNodes) {
    // nodeType 3 e text; celelalte sunt elemente si comentarii.
    if (copil.nodeType === 3) text += copil.rawText;
  }
  const curat = text.replace(/\s+/g, " ").trim();

  // Pretul spart in mai multe noduri ("1.234", ",56", "lei") nu are text propriu
  // nicaieri; se citeste de la parintele imediat, cat timp ramane scurt.
  if (curat.length === 0) {
    const intreg = nod.text.replace(/\s+/g, " ").trim();
    return intreg.length <= MAX_TEXT_FRUNZA ? intreg : "";
  }
  return curat;
}

/** Pretul taiat nu se citeste niciodata. Vocabular generic, nu selector de magazin. */
function esteTaiat(nod: HTMLElement): boolean {
  let curent: HTMLElement | null = nod;
  for (let i = 0; curent && i <= MAX_URCARE; i++) {
    const tag = curent.rawTagName?.toLowerCase();
    if (tag === "s" || tag === "del" || tag === "strike") return true;
    if (TIPAR_TAIAT.test(curent.getAttribute("class") ?? "")) return true;
    if (/line-through/i.test(curent.getAttribute("style") ?? "")) return true;
    curent = curent.parentNode;
  }
  return false;
}

/**
 * De la eticheta pretului in sus, pana la cardul produsului.
 *
 * Se opreste la primul stramos care are si o legatura si un titlu plauzibil. Doua
 * conditii de abandon: stramosul e prea mare (am iesit din card in grila), sau
 * contine deja doua preturi (la fel).
 */
function urcaLaCard(nod: HTMLElement): HTMLElement | null {
  let curent: HTMLElement | null = nod.parentNode;

  for (let i = 0; curent && i < MAX_URCARE; i++) {
    const text = curent.text.replace(/\s+/g, " ").trim();
    if (text.length > MAX_TEXT_CARD) return null;

    const legatura = curent.querySelector("a[href]");
    if (legatura && numeleCardului(curent, "") !== null) return curent;

    curent = curent.parentNode;
  }

  return null;
}

/**
 * Cardurile care se repeta sunt grila de produse.
 *
 * Gruparea se face dupa parinte si tag, nu dupa clase: prinde si grilele cu clase
 * generate (`class="x1a2b"`), unde doua carduri fratesti n-au nicio clasa comuna.
 */
function grupulCelMaiNumeros(carduri: HTMLElement[]): HTMLElement[] {
  const grupuri = new Map<string, HTMLElement[]>();

  for (const card of carduri) {
    const parinte = card.parentNode;
    if (!parinte) continue;
    const cheie = `${cheieNod(parinte)}|${card.rawTagName}`;
    const grup = grupuri.get(cheie);
    if (grup) grup.push(card);
    else grupuri.set(cheie, [card]);
  }

  let castigator: HTMLElement[] = [];
  for (const grup of grupuri.values()) {
    if (grup.length > castigator.length) castigator = grup;
  }
  return castigator;
}

const identitati = new WeakMap<HTMLElement, string>();
let urmatorulId = 0;

/** Identitate stabila pentru un nod, ca sa poata fi cheie de grupare. */
function cheieNod(nod: HTMLElement): string {
  let id = identitati.get(nod);
  if (!id) {
    id = `n${urmatorulId++}`;
    identitati.set(nod, id);
  }
  return id;
}

/** Denumirea, in ordinea in care magazinele o scriu de obicei. */
function numeleCardului(card: HTMLElement, textPret: string): string | null {
  const candidati = [
    card.querySelector("a[title]")?.getAttribute("title"),
    card.querySelector("h1,h2,h3,h4")?.text,
    card.querySelector("img[alt]")?.getAttribute("alt"),
    ...card.querySelectorAll("a").map((a) => a.text),
  ];

  for (const brut of candidati) {
    const nume = brut?.replace(/\s+/g, " ").trim() ?? "";
    if (nume.length < 8 || nume === textPret.trim()) continue;
    if (TIPAR_PRET.test(nume)) continue;
    return nume;
  }

  return null;
}
