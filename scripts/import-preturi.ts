/**
 * Aduce preturile de material si indicii de manopera de la API-urile
 * configurate si le scrie in catalog.
 *
 * Ruleaza cu conditia `react-server`, ca modulele marcate `server-only` sa se
 * incarce si in afara serverului Next:
 *   npm run import:preturi
 *   npm run import:preturi -- --dry        # aduce si arata, fara sa scrie
 *   npm run import:preturi -- --materiale  # doar materialele
 *   npm run import:preturi -- --manopera   # doar indicii de zona
 *
 * Fara `PRETURI_API_URL` / `MANOPERA_API_URL` nu face nimic si spune de ce.
 * Aplicatia merge intreaga fara ele: catalogul se poate umple si din liste de
 * preturi sau de mana.
 */
import { existsSync } from "node:fs";
import { priceApiFromEnv } from "../lib/materials/api-source";
import { laborApiFromEnv } from "../lib/materials/labor-source";
import { importaIndiciManopera, importaObservatii } from "../lib/materials/service";

// `tsx` nu citeste singur `.env`, iar cheile de API se opresc aici daca nu le
// incarca cineva. Node stie de la 20.12; nu suprascrie ce e deja in mediu, deci
// un cron care exporta variabilele ramane stapan pe ele.
if (typeof process.loadEnvFile === "function" && existsSync(".env")) {
  process.loadEnvFile(".env");
}

const argumente = process.argv.slice(2);
const dry = argumente.includes("--dry");
const doarMateriale = argumente.includes("--materiale");
const doarManopera = argumente.includes("--manopera");

const vreaMateriale = !doarManopera || doarMateriale;
const vreaManopera = !doarMateriale || doarManopera;

async function materiale(): Promise<boolean> {
  const sursa = priceApiFromEnv();
  if (!sursa) {
    console.log("MATERIALE: PRETURI_API_URL nu e setat, se sare peste.");
    return true;
  }

  const observatii = await sursa.fetch();
  console.log(`MATERIALE: ${sursa.name} a intors ${observatii.length} observatii.`);

  if (observatii.length === 0) return true;

  // Cateva randuri pe ecran, ca omul sa vada ce a venit inainte sa se increada
  // in cifre. Un import mut care raporteaza doar un numar ascunde exact cazul
  // in care API-ul a raspuns cu altceva decat crede el.
  for (const o of observatii.slice(0, 5)) {
    const zona = o.countyCode ?? "national";
    console.log(`  ${o.name} [${o.unit}] ${o.price} lei ${zona} ${o.observedAt.toISOString().slice(0, 10)}`);
  }
  if (observatii.length > 5) console.log(`  ... inca ${observatii.length - 5}`);

  if (dry) {
    console.log("MATERIALE: --dry, nu s-a scris nimic.");
    return true;
  }

  const rezultat = await importaObservatii(observatii, "FURNIZOR");
  console.log(
    `MATERIALE: ${rezultat.observatii} observatii scrise, ` +
      `${rezultat.materialeNoi} materiale noi, ${rezultat.duplicate} deja existente.`,
  );
  return true;
}

async function manopera(): Promise<boolean> {
  const sursa = laborApiFromEnv();
  if (!sursa) {
    console.log("MANOPERA: MANOPERA_API_URL nu e setat, se sare peste.");
    return true;
  }

  const indici = await sursa.fetch();
  console.log(`MANOPERA: ${sursa.name} a intors ${indici.length} judete.`);

  for (const i of indici.slice(0, 5)) {
    console.log(`  ${i.countyCode} indice ${i.value} pentru ${i.period.toISOString().slice(0, 10)}`);
  }
  if (indici.length > 5) console.log(`  ... inca ${indici.length - 5}`);

  if (dry) {
    console.log("MANOPERA: --dry, nu s-a scris nimic.");
    return true;
  }

  if (indici.length === 0) return true;

  const rezultat = await importaIndiciManopera(indici);
  console.log(`MANOPERA: ${rezultat.scrisi} indici noi, ${rezultat.actualizati} revizuiti.`);
  return true;
}

async function main() {
  if (!process.env.PRETURI_API_URL?.trim() && !process.env.MANOPERA_API_URL?.trim()) {
    console.error(
      "Niciun API configurat. Pune PRETURI_API_URL si/sau MANOPERA_API_URL in .env " +
        "(vezi .env.example pentru forma raspunsului asteptat).",
    );
    process.exitCode = 1;
    return;
  }

  if (vreaMateriale) await materiale();
  if (vreaManopera) await manopera();
}

main().catch((e) => {
  // Un import cazut nu trebuie sa arate ca unul reusit intr-un cron.
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
