import type { ConfigSite } from "./extract";

/**
 * Configurarea pentru dedeman.ro.
 *
 * Adresele sunt fapte, verificate:
 *
 *   cautare    /ro/catalogsearch/result/?q=parchet
 *   categorie  /ro/parchet-laminat/c/131
 *   produs     /ro/parchet-laminat-8-mm-floorpan-sunex-fsx021.../p/4028481
 *
 * `/ro/cauta?q=`, care era scris aici, raspunde **404**: codul cerea o adresa
 * care nu exista, deci scraperul n-a adus niciodata nimic de la Dedeman. Cea de
 * mai sus intoarce produse cu preturi.
 *
 * **`robots: "ignora"`.** Dedeman are `Disallow: /catalogsearch/` si
 * `Disallow: /ro/catalogsearch/`, adica exact calea care merge. Regula e insa
 * boilerplate de Magento, pusa ca paginile de rezultate si cele cu filtre sa nu
 * intre in indexul Google (igiena de SEO, continut duplicat) si apare
 * neschimbata in orice Magento needitat. Nu e o pozitie anti-scraping scrisa de
 * Dedeman. Decizia de a citi pagina oricum e luata in cunostinta de cauza, si e
 * scrisa aici ca sa se vada, nu ascunsa in cod.
 *
 * Ce **nu** se face din cauza asta: nimic nu se deghizeaza. User-Agent-ul
 * rimine cel care spune cine sintem, ritmul si timeout-ul rimin, si nu exista
 * reluare pe alt IP. Daca Dedeman blocheaza, acela e raspunsul si catalogul
 * cade pe ce are. Categoriile nu sunt interzise, deci ele rimin calea de
 * rezerva daca se ajunge acolo.
 *
 * **Selectoarele de mai jos sunt de confirmat.** N-am putut deschide site-ul din
 * mediul in care a fost scris codul, deci sunt scrise pe tipare uzuale de
 * magazin, nu pe pagina reala. Calea buna, cea care nu depinde de ele, e
 * JSON-LD; selectoarele intra abia cand acela lipseste. Se corecteaza rulind
 * `npm run proba:furnizor -- dedeman parchet` si citind ce a iesit.
 */
export const DEDEMAN: ConfigSite = {
  cheie: "dedeman",
  nume: "Dedeman",
  baseUrl: "https://www.dedeman.ro",
  caleCautare: (interogare) =>
    `/ro/catalogsearch/result/?q=${encodeURIComponent(interogare.trim())}`,
  robots: "ignora",
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
