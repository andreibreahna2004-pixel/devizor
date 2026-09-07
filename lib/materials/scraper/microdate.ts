import { type HTMLElement, parse } from "node-html-parser";
import { type PriceObservation, parseNumar } from "../import";
import { type ConfigSite, absolut, monedaEsteRon, unitateDinText } from "./extract";

/**
 * Microdatele schema.org din pagina.
 *
 * Acelasi standard ca JSON-LD, scris altfel: in loc de un bloc de date la sfarsit,
 * atribute `itemprop` pe elementele care se vad. Magazinele il pun tot pentru
 * Google, si multe il pun **in loc** de JSON-LD — de aceea stratul asta vine
 * imediat dupa, inaintea oricarei ghiciri de structura.
 *
 * `<meta itemprop="price" content="62.90">` e forma tipica si e mai curata decat
 * orice text din pagina: e cifra pe care magazinul o declara, nu cea pe care o
 * deseneaza.
 */
export function dinMicrodate(
  html: string,
  config: ConfigSite,
  acum: Date,
): PriceObservation[] {
  const document = parse(html);
  const observatii: PriceObservation[] = [];

  for (const produs of document.querySelectorAll('[itemtype*="schema.org/Product" i]')) {
    const nume = valoare(produs, "name");
    if (!nume) continue;

    const brut = valoare(produs, "price");
    if (!brut) continue;
    const pret = parseNumar(brut.split("/")[0]);
    if (pret === null) continue;

    // Un pret in alta moneda intrat in catalog nu se mai poate distinge dupa
    // aceea: tabelul nu se rescrie. Vezi antetul din `extract.ts`.
    if (!monedaEsteRon(valoare(produs, "priceCurrency"))) continue;

    const href =
      produs.querySelector('[itemprop="url" i]')?.getAttribute("href") ??
      valoare(produs, "url") ??
      produs.querySelector("a[href]")?.getAttribute("href");

    observatii.push({
      name: nume,
      unit: unitateDinText(valoare(produs, "unitText") ?? brut),
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
 * Valoarea unei proprietati: intai `content`, apoi textul.
 *
 * Ordinea conteaza. `<meta itemprop="price" content="62.90">` n-are text deloc, iar
 * la un `<span itemprop="price" content="62.90">62,90 lei</span>` atributul e cifra
 * curata, fara sufix si fara separatorul de mii al magazinului.
 */
function valoare(radacina: HTMLElement, proprietate: string): string | null {
  const nod = radacina.querySelector(`[itemprop="${proprietate}" i]`);
  if (!nod) return null;
  const dinAtribut = nod.getAttribute("content")?.trim();
  if (dinAtribut) return dinAtribut;
  const text = nod.text.trim();
  return text.length > 0 ? text : null;
}
