import type { ConfigSite } from "./extract";

/**
 * Configurarea pentru leroymerlin.ro.
 *
 *   cautare  /produse/search/?q=parchet
 *
 * **Magazinul a raspuns 403.** Si pagina de cautare, si pagina de start, deci nu
 * e o aparare pusa pe cautare, e respinsa originea cererii. Cererea a plecat din
 * afara Romaniei, de pe un IP de centru de date, si oricare din cele doua e de
 * ajuns ca sa iasa 403. Cauza nu e confirmata, si de aia adaptorul e scris dar
 * nu se declara mers: se cere o proba din mediul de deploy, cu
 * `npm run proba:furnizor -- leroymerlin parchet`.
 *
 * Ce se face cu raspunsul probei:
 *
 *  - **200 din Romania**: mergea, si nu era decit geo. Adaptorul e bun asa.
 *  - **403 si din Romania**: magazinul nu vrea. Atunci Leroy iese, si agregatul
 *    spune cinstit ca s-a facut din trei magazine. Nu se reia pe alt IP si nu se
 *    schimba User-Agent-ul ca sa treaca: un 403 care ramine 403 e un raspuns, nu
 *    un obstacol. Calea buna, daca preturile lor conteaza, e feed-ul de afiliere.
 *
 * `robots.txt` lasa `/produse/search/` liber, dar interzice `/*filters=*`,
 * `/*limit=*` si `/*sort=*`. Toate trei sunt scrise pe query, si de aia
 * `estePermis` primeste acum calea cu query cu tot: cu pathname singur, prima
 * paginare adaugata la adresa ar trece verificarea desi magazinul a spus nu.
 *
 * **Selectoarele sunt de confirmat.**
 */
export const LEROY_MERLIN: ConfigSite = {
  cheie: "leroymerlin",
  nume: "Leroy Merlin",
  baseUrl: "https://www.leroymerlin.ro",
  caleCautare: (interogare) =>
    `/produse/search/?q=${encodeURIComponent(interogare.trim())}`,
  selectoare: {
    card: "[data-product-id], .product-card, li.product",
    denumire: ".product-card__title, .product-title, h2 a, h3 a",
    pret: ".product-card__price, .price, .product-price",
    pretVechi: ".price--strikethrough, .old-price, s, del",
    link: "a[href]",
  },
};
