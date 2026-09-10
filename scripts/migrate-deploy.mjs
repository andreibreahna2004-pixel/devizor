/**
 * Aplica migrarile la build, fara sa blocheze deploy-urile cand nu poate.
 *
 * Prima incercare de a pune `prisma migrate deploy` direct in `build` a picat pe
 * Vercel, si a picat prost: build-ul esuat a blocat *toate* deploy-urile, nu
 * doar pe cel cu schema noua, iar din log nu se intelegea de ce. De atunci
 * migrarile se aplicau de mana — si exact asta s-a uitat, iar productia a ramas
 * cu codul nou peste schema veche.
 *
 * Scriptul asta rezolva amindoua problemele:
 *
 *  1. **Fara `DATABASE_URL` nu esueaza, ci sare peste.** Asta era primul candidat
 *     al caderii de atunci: un build fara variabila expusa. Un build de preview
 *     sau o rulare locala nu mai are de ce sa cada.
 *  2. **Migrarea merge pe o conexiune directa.** Al doilea candidat: o conexiune
 *     pooled (pgbouncer) pe care `migrate deploy` o refuza, fiindca incuietoarea
 *     lui de sesiune nu exista dincolo de pgbouncer. Care conexiune se alege, si
 *     de ce, sta in `migrare-url.mjs`. Nu se atinge `schema.prisma`, unde un
 *     `directUrl` cu variabila nesetata ar strica si rularile locale.
 *
 * Restul cazurilor — o migrare care chiar da eroare — opresc build-ul, si asa
 * trebuie: mai bine deploy-ul nu pleaca decit sa ajunga cod nou peste schema
 * veche. Diferenta fata de prima incercare e ca acum motivul se citeste din log.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { parePooled, urlPentruMigrare } from "./migrare-url.mjs";

// Pe Vercel variabilele sunt deja in mediu; local stau in `.env`, pe care Node
// nu-l citeste singur. Fara asta, un build local ar sari peste migrari si o
// migrare stricata s-ar vedea abia pe productie. Nu suprascrie ce e deja setat.
if (typeof process.loadEnvFile === "function" && existsSync(".env")) {
  process.loadEnvFile(".env");
}

/** Gazda si baza, fara user si parola: logul de build e citit de mai multi. */
function faraAcreditari(url) {
  const acret = url.lastIndexOf("@");
  return acret === -1 ? url : `${url.slice(0, url.indexOf("://") + 3)}***@${url.slice(acret + 1)}`;
}

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.log("[migrare] DATABASE_URL nu e setat — se sare peste migrari.");
  process.exit(0);
}

// `migrate deploy` are nevoie de o conexiune directa: pgbouncer nu suporta
// incuietoarea de sesiune pe care o cere.
const ales = urlPentruMigrare(process.env);
const url = ales.url;

if (ales.sursa === "dedus") {
  // Singurul caz in care ghicim, si de aia se scrie exact ce a iesit: cine
  // citeste logul vede pe ce gazda s-a incercat, fara sa ghiceasca la randul lui.
  console.log(
    "[migrare] DATABASE_URL e conexiunea pooled a Neon; migrarea merge pe cea " +
      `directa, dedusa scotand -pooler: ${faraAcreditari(url)}`,
  );
} else if (ales.sursa === "DATABASE_URL") {
  if (ales.pooled) {
    // Nu oprim aici: unele conexiuni pooled accepta totusi migrarile. Dar cand
    // pica, mesajul asta din log spune de la prima citire ce trebuie adaugat.
    console.log(
      "[migrare] atentie: DATABASE_URL pare o conexiune pooled si n-am de unde " +
        "deduce una directa. Daca migrarea esueaza, adauga DIRECT_URL.",
    );
  }
} else {
  console.log(`[migrare] se foloseste ${ales.sursa} pentru migrari.`);
}

const rezultat = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
  shell: process.platform === "win32",
});

if (rezultat.error) {
  console.error("[migrare] nu s-a putut porni prisma:", rezultat.error.message);
  process.exit(1);
}

if (rezultat.status !== 0) {
  console.error(
    "[migrare] `prisma migrate deploy` a esuat. Build-ul se opreste inainte ca " +
      "un cod nou sa ajunga peste o schema veche. Vezi eroarea de mai sus.",
  );
  // P1002 pe o conexiune care tot pare pooled inseamna aproape sigur pgbouncer,
  // nu o baza cazuta: eroarea Prisma vorbeste despre advisory lock si despre
  // server, si nu pomeneste nicaieri pooling-ul. Fara randul asta, urmatorul om
  // care citeste logul cauta baza, nu conexiunea.
  if (parePooled(url)) {
    console.error(
      "[migrare] conexiunea folosita pare tot pooled. Daca eroarea de mai sus e " +
        "P1002 (advisory lock), asta e cauza: pune in mediu DIRECT_URL cu " +
        "conexiunea directa a bazei (la Neon, aceeasi gazda fara -pooler).",
    );
  }
  process.exit(rezultat.status ?? 1);
}

console.log("[migrare] migrarile sunt aplicate.");
