import type { ConfigSite } from "./extract";

/**
 * Configurarea pentru hornbach.ro.
 *
 * Singurul din cele patru magazine confirmat ca merge cap-coada: `/s/parchet`
 * intoarce produse cu preturi randate pe server, deci o cerere simpla e de
 * ajuns, fara browser. `robots.txt` opreste doar cosul, contul, comparatorul si
 * urmarirea comenzii; `/s/` nu e atins, si nu exista `Crawl-delay`.
 *
 *   cautare  /s/parchet
 *
 * **`um` se lasa nepus, anume.** Hornbach coteaza acelasi produs pe doua baze pe
 * acelasi card: un parchet arata 209,00 lei/m2 si, alaturi, pretul pe pachet. Cu
 * `um` configurat, unitatea ar fi una pentru tot cardul si a doua cotatie s-ar
 * pierde sau, mai rau, pretul pachetului ar intra ca pret pe mp. Fara el,
 * unitatea se citeste din textul fiecarui pret si ies doua observatii, fiecare
 * pe unitatea ei. Vezi `oferteCuPret` din `extract.ts`.
 *
 * **Selectoarele sunt de confirmat**, ca la Dedeman: mediul in care s-a scris
 * codul nu vede pagina. Se corecteaza cu
 * `npm run proba:furnizor -- hornbach parchet --salveaza`.
 */
export const HORNBACH: ConfigSite = {
  cheie: "hornbach",
  nume: "Hornbach",
  baseUrl: "https://www.hornbach.ro",
  caleCautare: (interogare) => `/s/${encodeURIComponent(interogare.trim())}`,
  selectoare: {
    card: "[data-testid*='product'], article.product, li.product",
    denumire: "[data-testid*='title'], .product-title, h2 a, h3 a",
    pret: "[data-testid*='price'], .price, .product-price",
    pretVechi: "[data-testid*='strike'], .price--old, .old-price, s, del",
    link: "a[href]",
  },
};
