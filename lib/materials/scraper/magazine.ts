import { type ConfigSite } from "./extract";

/**
 * Magazinele de la care se cer preturi.
 *
 * Ce se stie sigur despre fiecare e originea. **Adresa de cautare nu e un fapt
 * verificat**: mediul in care s-a scris codul n-are acces la internet, deci sunt
 * scrise formele uzuale, in ordinea probabilitatii, si se incearca pe rand pana
 * cand una da produse. Calea castigatoare se tine minte pentru restul procesului.
 *
 * Selectoare nu are niciunul, in afara de Dedeman, unde exista de dinainte. Nu se
 * ghicesc: cascada din `extract.ts` merge pe standarde, iar acolo unde nu ajunge,
 * modelul citeste pagina si lasa in urma selectoarele gasite pe pagina reala.
 */

const cauta = (cale: string) => (interogare: string) =>
  `${cale}${encodeURIComponent(interogare.trim())}`;

export const DEDEMAN: ConfigSite = {
  cheie: "dedeman",
  nume: "Dedeman",
  baseUrl: "https://www.dedeman.ro",
  /**
   * Adresele sunt fapte, verificate: categoriile si produsele poarta un id numeric
   * la coada, iar cautarea merge pe `/ro/cauta`.
   *
   *   categorie   /ro/parchet-laminat/c/131
   *   produs      /ro/parchet-laminat-8-mm-floorpan-sunex-fsx021.../p/4028481
   */
  caleCautare: cauta("/ro/cauta?q="),
  caiAlternative: [cauta("/cauta?q=")],
  /**
   * Selectoarele astea sunt scrise pe tipare uzuale de magazin, nu pe pagina reala.
   * Raman ca ultima incercare inaintea euristicii; nu se mai adauga altele ghicite
   * la celelalte magazine.
   */
  selectoare: {
    card: "[data-product-id], .product-item, li.product",
    denumire: ".product-title, .product-name, h2 a, h3 a",
    pret: ".price-new, .product-price, .price",
    pretVechi: ".price-old, .old-price, s, del",
    um: ".price-unit, .unit",
    link: "a[href]",
  },
};

export const LEROY_MERLIN: ConfigSite = {
  cheie: "leroymerlin",
  nume: "Leroy Merlin",
  baseUrl: "https://www.leroymerlin.ro",
  caleCautare: cauta("/cauta?q="),
  caiAlternative: [cauta("/search?q="), cauta("/ro/cauta?q=")],
};

export const HORNBACH: ConfigSite = {
  cheie: "hornbach",
  nume: "Hornbach",
  baseUrl: "https://www.hornbach.ro",
  caleCautare: cauta("/cauta/?q="),
  caiAlternative: [cauta("/cauta?q="), cauta("/search?q=")],
};

export const BRICOSTORE: ConfigSite = {
  cheie: "bricostore",
  nume: "Bricostore",
  baseUrl: "https://bricostore.ro",
  caleCautare: cauta("/cauta?q="),
  caiAlternative: [cauta("/search?q="), cauta("/?s=")],
};

export const MAGAZINE: Record<string, ConfigSite> = {
  dedeman: DEDEMAN,
  leroymerlin: LEROY_MERLIN,
  hornbach: HORNBACH,
  bricostore: BRICOSTORE,
};

/**
 * Magazinele active, in ordinea din `SCRAPER_MAGAZINE`.
 *
 * Nesetata inseamna toate: aplicatia merge din cutie, fara configurare per
 * instalare. Variabila exista pentru cazul in care operatorul vrea sa opreasca un
 * magazin — din motive de termeni de utilizare, sau fiindca unul nu da nimic.
 */
export function magazineActive(): ConfigSite[] {
  const brut = process.env.SCRAPER_MAGAZINE?.trim();
  if (!brut) return Object.values(MAGAZINE);

  const cerute = brut
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);

  const alese = cerute.map((c) => MAGAZINE[c]).filter((m): m is ConfigSite => Boolean(m));
  return alese.length > 0 ? alese : Object.values(MAGAZINE);
}

/**
 * Adresa de cautare a unui magazin, cu caile alternative dupa cea principala.
 *
 * `SCRAPER_URL_<CHEIE>` suprascrie tot, cu `{q}` in locul interogarii. E ventilul
 * pentru ziua in care un magazin isi muta cautarea: se schimba o variabila de
 * mediu, nu se asteapta o versiune noua.
 */
export function caiDeCautare(site: ConfigSite, interogare: string): string[] {
  const dinMediu = process.env[`SCRAPER_URL_${site.cheie.toUpperCase()}`]?.trim();
  if (dinMediu) {
    return [dinMediu.replace("{q}", encodeURIComponent(interogare.trim()))];
  }

  return [
    site.caleCautare(interogare),
    ...(site.caiAlternative ?? []).map((f) => f(interogare)),
  ];
}
