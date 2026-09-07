import { normalizeForSearch } from "@/lib/norme";
import { type PriceObservation } from "../import";

/**
 * Ce are voie sa intre in catalog din ce s-a citit de pe o pagina straina.
 *
 * Filtrul asta ruleaza dupa **fiecare** strat de extragere, si nu e o cosmetizare:
 * `MaterialPrice` creste si nu se rescrie niciodata, deci un rand gresit intrat
 * azi ramane in catalogul national al instalarii pentru totdeauna, si intra si in
 * graficul de evolutie. Un produs pierdut se recupereaza la urmatoarea cautare;
 * unul inventat, nu.
 */

/** Peste atat nu mai e material de constructii, e altceva citit gresit. */
const PRET_MAXIM = 100_000;
const PRET_MINIM = 0.1;

/**
 * Cate produse ia aplicatia de la un magazin la o cautare.
 *
 * Frana de avarie pentru un strat care o ia razna: fara ea, o euristica proasta pe
 * o pagina mare ar scrie sute de randuri, si nu se mai pot scoate.
 */
export const MAX_PRODUSE_PE_MAGAZIN = 24;

/**
 * Texte care apar pe orice magazin si nu sunt produse.
 *
 * Straturile declarate de magazin (JSON-LD, microdate) nu le produc; euristica,
 * da — "Cosul meu 0,00 lei" din bara de sus arata exact ca un card cu pret.
 */
const NU_SUNT_PRODUSE = [
  "cos",
  "cosul meu",
  "cos de cumparaturi",
  "adauga in cos",
  "filtre",
  "filtreaza",
  "sorteaza",
  "sortare",
  "compara",
  "favorite",
  "newsletter",
  "contul meu",
  "livrare",
  "transport gratuit",
  "meniu",
  "cauta",
  "cautare",
  "vezi toate",
  "total",
  "subtotal",
];

/**
 * Cifrele pretului, asa cum ar aparea scrise in pagina.
 *
 * Se cauta "62,90" dar si "62.90" si "6290": magazinul scrie intr-un fel, JSON-ul
 * din pagina in altul, si amandoua sunt aceeasi cifra.
 */
function formePret(pret: number): string[] {
  const cuDouaZecimale = pret.toFixed(2);
  return [
    cuDouaZecimale,
    cuDouaZecimale.replace(".", ","),
    String(pret),
    String(pret).replace(".", ","),
  ];
}

export interface OptiuniFiltru {
  /**
   * Textul paginii de la care s-a citit. Cand exista, denumirea si pretul trebuie
   * sa se regaseasca in el — asa se prinde un produs inventat de model.
   */
  textPagina?: string;
  /** Interogarea omului, pentru straturile care ghicesc structura paginii. */
  interogare?: string;
  limita?: number;
}

/**
 * Numele si pretul trebuie sa fie in pagina.
 *
 * Verificarea asta exista pentru stratul care cere unui model sa citeasca pagina:
 * un model care n-a gasit nimic poate completa cu ce stie despre materiale in loc
 * sa spuna ca n-a gasit. Un pret care nu e scris in pagina nu e o observatie, e o
 * amintire.
 */
function apareInPagina(o: PriceObservation, textPagina: string): boolean {
  const text = normalizeForSearch(textPagina);
  if (!text.includes(normalizeForSearch(o.name).slice(0, 60))) return false;
  return formePret(o.price).some((forma) => text.includes(forma));
}

/**
 * Macar un cuvant al interogarii trebuie sa apara in denumire.
 *
 * Se aplica numai straturilor care ghicesc structura paginii. Cand adresa de
 * cautare e gresita si magazinul serveste pagina de categorie sau una de "zero
 * rezultate" cu produse recomandate, asta e gardul care opreste catalogul sa se
 * umple cu ce n-a cerut nimeni.
 */
export function potrivesteInterogarea(nume: string, interogare: string): boolean {
  const cuvinte = normalizeForSearch(interogare)
    .split(/\s+/)
    .filter((c) => c.length >= 3);
  if (cuvinte.length === 0) return true;

  const numeNormalizat = normalizeForSearch(nume);
  return cuvinte.some((c) => numeNormalizat.includes(c));
}

export function filtreazaPlauzibile(
  observatii: PriceObservation[],
  optiuni: OptiuniFiltru = {},
): PriceObservation[] {
  const { textPagina, interogare, limita = MAX_PRODUSE_PE_MAGAZIN } = optiuni;
  const vazute = new Set<string>();
  const bune: PriceObservation[] = [];

  for (const o of observatii) {
    if (bune.length >= limita) break;

    const nume = o.name.trim();
    if (nume.length < 3 || nume.length > 200) continue;
    if (!/\p{L}/u.test(nume)) continue;
    if (NU_SUNT_PRODUSE.includes(normalizeForSearch(nume))) continue;

    if (!Number.isFinite(o.price) || o.price < PRET_MINIM || o.price > PRET_MAXIM) {
      continue;
    }

    if (interogare && !potrivesteInterogarea(nume, interogare)) continue;
    if (textPagina && !apareInPagina(o, textPagina)) continue;

    const cheie = `${normalizeForSearch(nume)}|${o.price.toFixed(2)}`;
    if (vazute.has(cheie)) continue;
    vazute.add(cheie);

    bune.push({ ...o, name: nume });
  }

  return bune;
}
