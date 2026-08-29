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
 *  2. **Cand exista `DIRECT_URL`, migrarea merge pe ea.** Al doilea candidat: o
 *     conexiune pooled (pgbouncer) pe care `migrate deploy` o refuza. Nu se
 *     atinge `schema.prisma`, unde un `directUrl` cu variabila nesetata ar strica
 *     si rularile locale.
 *
 * Restul cazurilor — o migrare care chiar da eroare — opresc build-ul, si asa
 * trebuie: mai bine deploy-ul nu pleaca decit sa ajunga cod nou peste schema
 * veche. Diferenta fata de prima incercare e ca acum motivul se citeste din log.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

// Pe Vercel variabilele sunt deja in mediu; local stau in `.env`, pe care Node
// nu-l citeste singur. Fara asta, un build local ar sari peste migrari si o
// migrare stricata s-ar vedea abia pe productie. Nu suprascrie ce e deja setat.
if (typeof process.loadEnvFile === "function" && existsSync(".env")) {
  process.loadEnvFile(".env");
}

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.log("[migrare] DATABASE_URL nu e setat — se sare peste migrari.");
  process.exit(0);
}

// `migrate deploy` are nevoie de o conexiune directa: pgbouncer nu suporta
// instructiunile pe care le foloseste. Cand exista DIRECT_URL, pe ea merge.
const directUrl = process.env.DIRECT_URL?.trim();
const url = directUrl || databaseUrl;

if (directUrl) {
  console.log("[migrare] se foloseste DIRECT_URL pentru migrari.");
} else if (/-pooler\.|pgbouncer=true|[?&]pool/.test(databaseUrl)) {
  // Nu oprim aici: unele conexiuni pooled accepta totusi migrarile. Dar cand
  // pica, mesajul asta din log spune de la prima citire ce trebuie adaugat.
  console.log(
    "[migrare] atentie: DATABASE_URL pare o conexiune pooled. Daca migrarea " +
      "esueaza, adauga DIRECT_URL cu conexiunea directa.",
  );
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
  process.exit(rezultat.status ?? 1);
}

console.log("[migrare] migrarile sunt aplicate.");
