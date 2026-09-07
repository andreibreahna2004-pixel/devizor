/**
 * Cere paginile de la magazine si arata ce s-a extras din ele, strat cu strat.
 *
 * Comanda asta exista pentru ca extractorul n-a putut fi scris pe pagina reala:
 * mediul in care s-a scris codul n-are acces la internet. Rulata pe o masina care
 * are, spune in zece secunde ce merge la fiecare magazin si ce nu — si, mai ales,
 * **de ce** nu.
 *
 *   npm run proba:furnizor -- parchet
 *   npm run proba:furnizor -- parchet --magazin=hornbach
 *   npm run proba:furnizor -- parchet --salveaza          # pune paginile in fixtures/
 *   npm run proba:furnizor -- parchet --fara-ai           # numai straturile gratuite
 *   npm run proba:furnizor -- --fisier fixtures/x.html --magazin=hornbach --interogare=parchet
 *
 * Ruleaza cu conditia `react-server`, ca `demo:factura`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { type ConfigSite, extrageDeterminist } from "../lib/materials/scraper/extract";
import { iaPagina } from "../lib/materials/scraper/fetcher";
import { MAGAZINE, caiDeCautare, magazineActive } from "../lib/materials/scraper/magazine";
import { estePermis, iaRobots } from "../lib/materials/scraper/robots";

if (typeof process.loadEnvFile === "function" && existsSync(".env")) {
  process.loadEnvFile(".env");
}

const argumente = process.argv.slice(2);
const optiune = (nume: string): string | undefined =>
  argumente.find((a) => a.startsWith(`--${nume}=`))?.split("=").slice(1).join("=") ??
  (argumente.includes(`--${nume}`)
    ? argumente[argumente.indexOf(`--${nume}`) + 1]
    : undefined);

const salveaza = argumente.includes("--salveaza");
const faraAi = argumente.includes("--fara-ai");
const fisier = optiune("fisier");
const cheieMagazin = optiune("magazin");
const interogare =
  optiune("interogare") ??
  argumente.filter((a) => !a.startsWith("--") && a !== fisier && a !== cheieMagazin).join(" ");

const AGENT =
  process.env.SCRAPER_UA?.trim() ||
  "Devizor/1.0 (+https://github.com/andreibreahna2004-pixel/devizor)";

const CONFIG = { agent: AGENT, pauzaMs: 0, timeoutMs: 15000, cacheMs: 0 };

function alegeMagazine(): ConfigSite[] {
  if (!cheieMagazin) return magazineActive();
  const site = MAGAZINE[cheieMagazin.toLowerCase()];
  if (!site) {
    console.error(`Magazin necunoscut: ${cheieMagazin}. Cunoscute: ${Object.keys(MAGAZINE).join(", ")}`);
    process.exit(1);
  }
  return [site];
}

/** Ce s-a extras dintr-o pagina, cu numaratoarea pe fiecare strat. */
function arataExtragerea(html: string, site: ConfigSite, acum: Date): number {
  const rezultat = extrageDeterminist(html, site, acum, interogare);

  const peStrat = Object.entries(rezultat.peStrat)
    .map(([strat, cate]) => `${strat}=${cate}`)
    .join("  ");
  console.log(`  straturi:  ${peStrat}`);
  console.log(`  castiga:   ${rezultat.strat ?? "niciunul"}`);

  for (const o of rezultat.observatii.slice(0, 8)) {
    console.log(`    ${o.price} lei/${o.unit}  ${o.name}`);
  }

  if (rezultat.observatii.length === 0) {
    // Fara asta, "0 produse" nu spune daca a fost blocata cererea, daca pagina e
    // alta decat cea asteptata, sau daca lista se deseneaza abia in browser.
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    console.log("  nimic extras. indicii:");
    console.log(`    application/ld+json: ${html.includes("application/ld+json")}`);
    console.log(`    itemprop="price":    ${/itemprop=["']price/i.test(html)}`);
    console.log(`    __NEXT_DATA__:       ${html.includes("__NEXT_DATA__")}`);
    console.log(`    __NUXT__:            ${html.includes("__NUXT__")}`);
    console.log(`    aparitii de "lei":   ${(html.match(/\blei\b/gi) ?? []).length}`);
    if (html.length > 50_000 && text.length < 500) {
      console.log("    pagina pare randata in browser: HTML mult, text putin");
    }
  }

  return rezultat.observatii.length;
}

async function probeazaFisier(site: ConfigSite): Promise<number> {
  if (!fisier) return 0;
  console.log(`\n=== ${site.nume} (din ${fisier}) ===`);
  return arataExtragerea(readFileSync(fisier, "utf8"), site, new Date());
}

async function probeazaMagazin(site: ConfigSite): Promise<number> {
  console.log(`\n=== ${site.nume} ===`);

  const robots = await iaRobots(site.baseUrl, AGENT, fetch, CONFIG.timeoutMs).catch(() => ({
    reguli: [],
  }));

  let gasite = 0;

  for (const cale of caiDeCautare(site, interogare)) {
    const url = new URL(cale, site.baseUrl).toString();
    console.log(`  url:       ${url}`);

    if (!estePermis(robots, new URL(url).pathname)) {
      // Nu e o eroare: e raspunsul magazinului, si se respecta.
      console.log("  robots:    INTERZICE calea asta, nu se cere nimic");
      continue;
    }
    console.log("  robots:    permite");

    let html: string;
    try {
      html = await iaPagina(url, CONFIG);
    } catch (e) {
      console.log(`  eroare:    ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    console.log(`  pagina:    ${html.length} caractere`);

    if (salveaza) {
      mkdirSync("fixtures", { recursive: true });
      const cale = `fixtures/${site.cheie}-${interogare.replace(/\s+/g, "-")}.html`;
      writeFileSync(cale, html, "utf8");
      console.log(`  salvat:    ${cale}`);
    }

    gasite = arataExtragerea(html, site, new Date());
    if (gasite > 0) break;

    if (!faraAi) {
      const { extragereAiActiva, extrageCuAi } = await import("../lib/ai/extrage-produse");
      if (!extragereAiActiva()) {
        console.log("  ai:        oprit (fara ANTHROPIC_API_KEY sau SCRAPER_AI=false)");
      } else {
        const iesire = await extrageCuAi(html, site, interogare, new Date());
        console.log(
          `  ai:        ${iesire.observatii.length} produse, ${iesire.folosire.inputTokens} tokeni intrare, ${iesire.folosire.durataMs} ms`,
        );
        for (const o of iesire.observatii.slice(0, 8)) {
          console.log(`    ${o.price} lei/${o.unit}  ${o.name}`);
        }
        if (iesire.selectoare) {
          console.log(`  selectoare invatate: ${JSON.stringify(iesire.selectoare)}`);
        }
        gasite = iesire.observatii.length;
        if (gasite > 0) break;
      }
    }
  }

  return gasite;
}

async function main() {
  if (!interogare) {
    console.error("Scrie ce cauti: npm run proba:furnizor -- parchet");
    process.exitCode = 1;
    return;
  }

  const magazine = alegeMagazine();
  let total = 0;

  for (const site of magazine) {
    total += fisier ? await probeazaFisier(site) : await probeazaMagazin(site);
  }

  console.log(`\ntotal: ${total} produse din ${magazine.length} magazine`);
  // Cod de iesire 1 cand niciun magazin n-a dat nimic: asa poate fi folosita si ca
  // proba de fum, nu doar citita de un om.
  if (total === 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
