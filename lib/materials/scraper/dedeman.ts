import type { ConfigSite } from "./extract";

/**
 * Configurarea pentru dedeman.ro.
 *
 * Adresele sunt fapte, verificate: categoriile si produsele poarta un id numeric
 * la coada, iar cautarea merge pe `/ro/cauta`.
 *
 *   categorie   /ro/parchet-laminat/c/131
 *   produs      /ro/parchet-laminat-8-mm-floorpan-sunex-fsx021.../p/4028481
 *
 * **Selectoarele de mai jos sunt de confirmat.** N-am putut deschide site-ul din
 * mediul in care a fost scris codul, deci sunt scrise pe tipare uzuale de
 * magazin, nu pe pagina reala. Calea buna, cea care nu depinde de ele, e JSON-LD;
 * selectoarele intra abia cand acela lipseste. Se corecteaza rulind
 * `npm run proba:furnizor -- parchet` si citind ce a iesit — vezi antetul din
 * `extract.ts` pentru de ce nu se ghicesc selectoare cu incredere.
 */
export const DEDEMAN: ConfigSite = {
  nume: "Dedeman",
  baseUrl: "https://www.dedeman.ro",
  caleCautare: (interogare) =>
    `/ro/cauta?q=${encodeURIComponent(interogare.trim())}`,
  selectoare: {
    card: "[data-product-id], .product-item, li.product",
    denumire: ".product-title, .product-name, h2 a, h3 a",
    // Pretul curent. Cel vechi se sterge din card inainte de citire.
    pret: ".price-new, .product-price, .price",
    pretVechi: ".price-old, .old-price, s, del",
    um: ".price-unit, .unit",
    link: "a[href]",
  },
};
