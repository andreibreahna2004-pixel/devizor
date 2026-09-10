/**
 * Cere o pagina de la un magazin si arata ce s-a extras din ea.
 *
 * Comanda asta exista pentru ca extractorul n-a putut fi scris pe pagina reala:
 * mediul in care s-a scris codul n-are acces la internet. Aici se vede daca
 * selectoarele prind, si daca nu, ce trebuie schimbat.
 *
 *   npm run proba:furnizor -- parchet                    # implicit Dedeman
 *   npm run proba:furnizor -- hornbach parchet
 *   npm run proba:furnizor -- hornbach parchet --salveaza
 *   npm run proba:furnizor -- toate parchet              # toate magazinele
 *
 * Ruleaza cu conditia `react-server`, ca `demo:factura`.
 *
 * **Nu se uita la `SCRAPER_ACTIV`**, anume: e unealta de confirmare manuala, si
 * omul care o ruleaza a hotarit deja sa iasa pe internet. Se uita insa la
 * purtarea fata de `robots.txt`, ca proba sa arate exact ce va face trecerea
 * zilnica.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { type ConfigSite, dinJsonLd, dinSelectoare } from "../lib/materials/scraper/extract";
import { iaPagina } from "../lib/materials/scraper/fetcher";
import { SITE_URI, purtareRobots } from "../lib/materials/scraper";
import { caleDinUrl, estePermis, iaRobots } from "../lib/materials/scraper/robots";

if (typeof process.loadEnvFile === "function" && existsSync(".env")) {
  process.loadEnvFile(".env");
}

const argumente = process.argv.slice(2);
const salveaza = argumente.includes("--salveaza");
const libere = argumente.filter((a) => !a.startsWith("--"));

// Primul argument e magazinul daca se potriveste cu o cheie sau cu "toate";
// altfel totul e interogare, ca inainte.
const primul = libere[0]?.toLowerCase() ?? "";
const cerutMagazin = primul === "toate" || primul in SITE_URI;
const interogare = (cerutMagazin ? libere.slice(1) : libere).join(" ");
const siteUri: ConfigSite[] =
  primul === "toate"
    ? Object.values(SITE_URI)
    : cerutMagazin
      ? [SITE_URI[primul]]
      : [SITE_URI.dedeman];

const AGENT =
  process.env.SCRAPER_UA?.trim() ||
  "Devizor/1.0 (+https://github.com/andreibreahna2004-pixel/devizor)";

async function probeaza(site: ConfigSite) {
  console.log(`\n=== ${site.nume} (${site.cheie}) ===`);

  const url = new URL(site.caleCautare(interogare), site.baseUrl).toString();
  console.log(`URL: ${url}`);

  const robots = await iaRobots(site.baseUrl, AGENT);
  const permis = estePermis(robots, caleDinUrl(url));
  const purtare = purtareRobots(site);
  console.log(
    `robots.txt: ${permis ? "permite" : "INTERZICE"} calea asta` +
      (permis ? "" : `  (purtare configurata: ${purtare})`),
  );

  if (!permis && purtare !== "ignora") {
    console.log("Nu se cere nimic. Asta e raspunsul corect, nu o eroare.");
    return;
  }
  if (!permis) {
    console.log("Se cere oricum, fiindca asa e configurat magazinul.");
  }

  let html: string;
  try {
    html = await iaPagina(url, {
      agent: AGENT,
      pauzaMs: 0,
      timeoutMs: 15000,
      cacheMs: 0,
    });
  } catch (e) {
    // Statusul se scrie explicit: la Leroy Merlin diferenta dintre 403 si o
    // cadere de retea hotaraste daca magazinul intra sau nu in socoteala.
    console.log(`CERERE PICATA: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }

  console.log(`pagina: ${html.length} caractere`);

  if (salveaza) {
    mkdirSync("fixtures", { recursive: true });
    const cale = `fixtures/${site.cheie}-${interogare.replace(/\s+/g, "-")}.html`;
    writeFileSync(cale, html, "utf8");
    console.log(`salvat in ${cale}`);
  }

  const acum = new Date();
  const jsonLd = dinJsonLd(html, site, acum);
  const selectoare = dinSelectoare(html, site, acum);

  console.log(`JSON-LD:     ${jsonLd.length} observatii`);
  console.log(`selectoare:  ${selectoare.length} observatii`);

  // JSON-LD scurtcircuiteaza selectoarele cand da ceva. Pe o pagina amestecata,
  // unele carduri cu `Offer`, altele cu `AggregateOffer`, care n-are `price`,
  // JSON-LD da o parte, scurtcircuitul se declanseaza, si restul nu se mai
  // citesc niciodata. Pierderea nu se vede: numarul arata ca o extragere reusita.
  if (jsonLd.length > 0 && selectoare.length > jsonLd.length * 1.5) {
    console.log(
      `  ATENTIE: selectoarele gasesc mai multe (${selectoare.length}) decat JSON-LD ` +
        `(${jsonLd.length}). Pagina pare amestecata, si JSON-LD taie restul.`,
    );
  }

  const alese = jsonLd.length > 0 ? jsonLd : selectoare;
  const stratul = jsonLd.length > 0 ? "JSON-LD" : "selectoare";
  console.log(`\nprimele ${Math.min(8, alese.length)} (din ${stratul}):`);
  for (const o of alese.slice(0, 8)) {
    console.log(`  ${o.price} lei/${o.unit}  ${o.name}`);
  }

  // Unitatile extrase, ca sa se vada dintr-o privire daca magazinul coteaza pe
  // doua baze si daca `um` din lista de termeni se potriveste cu ce da pagina.
  const unitati = new Map<string, number>();
  for (const o of alese) unitati.set(o.unit, (unitati.get(o.unit) ?? 0) + 1);
  if (unitati.size > 0) {
    console.log(
      `unitati: ${[...unitati].map(([u, n]) => `${u} x${n}`).join(", ")}`,
    );
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

async function main() {
  if (!interogare) {
    console.error("Scrie ce cauti: npm run proba:furnizor -- hornbach parchet");
    console.error(`Magazine: ${Object.keys(SITE_URI).join(", ")}, sau "toate".`);
    process.exitCode = 1;
    return;
  }

  // Unul dupa altul, nu in paralel: la mai multe magazine ar fi in regula, dar
  // proba trebuie sa arate acelasi lucru pe care il face trecerea zilnica.
  for (const site of siteUri) await probeaza(site);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
