/**
 * Cere o pagina de la magazin si arata ce s-a extras din ea.
 *
 * Comanda asta exista pentru ca extractorul n-a putut fi scris pe pagina reala:
 * mediul in care s-a scris codul n-are acces la internet. Aici se vede daca
 * selectoarele prind, si daca nu, ce trebuie schimbat.
 *
 *   npm run proba:furnizor -- parchet
 *   npm run proba:furnizor -- parchet --salveaza   # pune HTML-ul in fixtures/
 *
 * Ruleaza cu conditia `react-server`, ca `demo:factura`.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { DEDEMAN } from "../lib/materials/scraper/dedeman";
import { dinJsonLd, dinSelectoare } from "../lib/materials/scraper/extract";
import { iaPagina } from "../lib/materials/scraper/fetcher";
import { estePermis, iaRobots } from "../lib/materials/scraper/robots";

if (typeof process.loadEnvFile === "function" && existsSync(".env")) {
  process.loadEnvFile(".env");
}

const argumente = process.argv.slice(2);
const salveaza = argumente.includes("--salveaza");
const interogare = argumente.filter((a) => !a.startsWith("--")).join(" ");

const AGENT =
  process.env.SCRAPER_UA?.trim() ||
  "Devizor/1.0 (+https://github.com/andreibreahna2004-pixel/devizor)";

async function main() {
  if (!interogare) {
    console.error("Scrie ce cauti: npm run proba:furnizor -- parchet");
    process.exitCode = 1;
    return;
  }

  const site = DEDEMAN;
  const url = new URL(site.caleCautare(interogare), site.baseUrl).toString();
  console.log(`URL: ${url}`);

  const robots = await iaRobots(site.baseUrl, AGENT);
  const permis = estePermis(robots, new URL(url).pathname);
  console.log(`robots.txt: ${permis ? "permite" : "INTERZICE"} calea asta`);
  if (!permis) {
    console.log("Nu se cere nimic. Asta e raspunsul corect, nu o eroare.");
    return;
  }

  const html = await iaPagina(url, {
    agent: AGENT,
    pauzaMs: 0,
    timeoutMs: 15000,
    cacheMs: 0,
  });
  console.log(`pagina: ${html.length} caractere`);

  if (salveaza) {
    mkdirSync("fixtures", { recursive: true });
    const cale = `fixtures/dedeman-${interogare.replace(/\s+/g, "-")}.html`;
    writeFileSync(cale, html, "utf8");
    console.log(`salvat in ${cale}`);
  }

  const acum = new Date();
  const jsonLd = dinJsonLd(html, site, acum);
  const selectoare = dinSelectoare(html, site, acum);

  console.log(`\nJSON-LD:     ${jsonLd.length} produse`);
  console.log(`selectoare:  ${selectoare.length} produse`);

  const alese = jsonLd.length > 0 ? jsonLd : selectoare;
  console.log(`\nprimele ${Math.min(8, alese.length)}:`);
  for (const o of alese.slice(0, 8)) {
    console.log(`  ${o.price} lei/${o.unit}  ${o.name}`);
  }

  if (alese.length === 0) {
    // Fara asta, "0 produse" nu spune daca a fost blocata cererea, daca pagina
    // e alta decat cea asteptata, sau daca doar selectoarele nu prind.
    console.log("\nNimic extras. Cateva indicii din pagina:");
    console.log(`  are "application/ld+json": ${html.includes("application/ld+json")}`);
    console.log(`  are "data-product-id":     ${html.includes("data-product-id")}`);
    console.log(`  are "lei":                 ${html.includes("lei")}`);
    console.log("  Ruleaza cu --salveaza si trimite fisierul ca sa corectez selectoarele.");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
