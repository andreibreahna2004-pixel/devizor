import type { ConfigSite } from "./extract";

/**
 * Configurarea pentru Brico, al patrulea magazin.
 *
 * **Nu e bricostore.ro.** Bricostore a fost cumparat de Kingfisher in 2013 si
 * redenumit Brico Depot, iar Brico Depot a fost cumparat de Altex in mai 2025 si
 * redenumit Brico. `bricostore.ro` mai serveste continut, dar e un domeniu
 * mostenit si n-a raspuns la cereri repetate. Domeniul viu, cu `robots.txt` de
 * magazin adevarat, e `brico.ro`, si pe el se scrie adaptorul.
 *
 * `robots.txt` opreste cosul, wishlist-ul, `/autocomplete*` si
 * `/ajax/loadProducts*`, deci capetele JSON sunt interzise si nu se ating,
 * dar lasa libere produsele si categoriile. Sitemap: `/sitemap.xml`.
 *
 * **Calea de cautare e de aflat.** `/cauta?q=` si `/search?q=` dau amindoua 404,
 * deci cea de mai jos e o presupunere, nu un fapt, si singura din cele patru
 * care e asa. Se afla cu `npm run proba:furnizor -- brico parchet`, care scrie
 * si statusul HTTP: pina atunci magazinul raporteaza `fara-cale` si agregatul se
 * face din celelalte. Un magazin care lipseste e spus, nu tacut.
 *
 * **Selectoarele sunt de confirmat.**
 */
export const BRICO: ConfigSite = {
  cheie: "brico",
  nume: "Brico",
  baseUrl: "https://www.brico.ro",
  caleCautare: (interogare) =>
    `/catalogsearch/result/?q=${encodeURIComponent(interogare.trim())}`,
  selectoare: {
    card: "[data-product-id], .product-item, li.product",
    denumire: ".product-item-link, .product-name, h2 a, h3 a",
    pret: ".price-wrapper .price, .special-price .price, .price",
    pretVechi: ".old-price, .price--old, s, del",
    link: "a[href]",
  },
};
