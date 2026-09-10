/**
 * Trecerea zilnica peste termeni: cere fiecare la cele patru magazine si scrie
 * in catalog ce se gaseste.
 *
 * Ruleaza cu conditia `react-server`, ca modulele marcate `server-only` sa se
 * incarce si in afara serverului Next:
 *   npm run preturi:zilnic
 *   npm run preturi:zilnic -- --plan               # arata planul, FARA retea
 *   npm run preturi:zilnic -- --dry                # aduce si arata, fara sa scrie
 *   npm run preturi:zilnic -- --termeni=10         # alt buget
 *   npm run preturi:zilnic -- --termen="parchet laminat"
 *
 * `--plan` si `--dry` nu sunt acelasi lucru, si diferenta conteaza: `--plan` nu
 * atinge internetul, deci e cel cu care se reglează bugetul si nu costa nimic
 * magazinelor. `--dry` cere paginile ca de-adevaratelea si doar nu scrie.
 *
 * Fara `SCRAPER_ACTIV=true` nu iese nimic pe internet si se spune de ce.
 */
import { existsSync } from "node:fs";
import { vechimeaTermenilor } from "../lib/materials/service";
import { magazineActive } from "../lib/materials/scraper/magazine";
import { ordoneazaPlanul, taiePlanul, termeniCareIncap } from "../lib/materials/scraper/plan";
import { termeniLaMagazin } from "../lib/materials/termeni";
import { esteCadereTotala, treceriZilnice } from "../lib/materials/zilnic";

// `tsx` nu citeste singur `.env`. Node stie de la 20.12; nu suprascrie ce e deja
// in mediu, deci un cron care exporta variabilele ramane stapan pe ele.
if (typeof process.loadEnvFile === "function" && existsSync(".env")) {
  process.loadEnvFile(".env");
}

const argumente = process.argv.slice(2);
const dry = argumente.includes("--dry");
const doarPlan = argumente.includes("--plan");

function valoare(nume: string): string | null {
  const g = argumente.find((a) => a.startsWith(`--${nume}=`));
  return g ? g.slice(nume.length + 3) : null;
}

const budget = Number(valoare("termeni")) || undefined;
const doarTermen = valoare("termen")?.replace(/^["']|["']$/g, "") ?? undefined;

const DATA = new Intl.DateTimeFormat("ro-RO", { dateStyle: "short" });
const cand = (d: Date | null) => (d ? DATA.format(d) : "niciodata");

/** Arata planul si socoteala bugetului, fara sa ceara nimic. */
async function arataPlanul() {
  const termeni = termeniLaMagazin();
  const magazine = magazineActive();

  const bugetMs = Number(process.env.SCRAPER_SCAN_BUGET_MS) || 240_000;
  const pauzaMs = Number(process.env.SCRAPER_PAUZA_MS) || 2000;
  const timeoutMs = Number(process.env.SCRAPER_TIMEOUT_MS) || 8000;
  const incap = termeniCareIncap(bugetMs, pauzaMs, timeoutMs);
  const cerut = budget ?? (Number(process.env.SCRAPER_SCAN_TERMENI) || 40);
  const efectiv = Math.max(1, Math.min(cerut, incap || cerut));

  console.log(`MAGAZINE: ${magazine.map((m) => m.nume).join(", ")}`);
  console.log(`TERMENI: ${termeni.length} ceruti la magazin, din ${termeni.length} in lista.`);
  console.log(
    `BUGET: ${bugetMs}ms, pauza ${pauzaMs}ms, timeout ${timeoutMs}ms ` +
      `-> incap ${incap}; cerut ${cerut}; se trec ${efectiv}.`,
  );

  const plan = ordoneazaPlanul(await vechimeaTermenilor(termeni));
  const deTrecut = taiePlanul(plan, efectiv);

  console.log(`\nPrimii ${Math.min(15, deTrecut.length)} din plan:`);
  for (const [i, t] of deTrecut.slice(0, 15).entries()) {
    console.log(
      `  ${String(i + 1).padStart(3)}. ${t.termen} [${t.um}]`.padEnd(46) +
        `ultima observatie: ${cand(t.ultimaObservatie)}`,
    );
  }

  const nescanate = plan.filter((t) => t.ultimaObservatie === null).length;
  console.log(
    `\nNescanate niciodata: ${nescanate}. ` +
      `La ${efectiv} pe zi, tot planul se reia in ${Math.ceil(plan.length / efectiv)} zile.`,
  );
}

async function main() {
  if (doarPlan) {
    await arataPlanul();
    return;
  }

  const rezultat = await treceriZilnice({
    budget,
    dry,
    doarTermen,
    raporteaza: ({ i, din, termen, um, ultimaObservatie, magazine }) => {
      console.log(
        `TERMEN ${i}/${din}  ${termen} [${um}]`.padEnd(50) +
          `ultima observatie: ${cand(ultimaObservatie)}`,
      );
      for (const m of magazine) {
        const stare = m.stare === "ok" ? "" : `  (${m.stare}${m.motiv ? `: ${m.motiv}` : ""})`;
        console.log(
          `  ${m.magazin.padEnd(14)} ${String(m.observatii.length).padStart(3)} produse` +
            `  ${m.durataMs}ms${stare}`,
        );
      }
    },
  });

  if (rezultat.sarit) {
    console.log(`SARIT: ${rezultat.sarit}`);
    return;
  }

  console.log("");
  // Sanatatea pe magazin, fiindca defectiunea care se intampla de-adevaratelea e
  // un magazin care intoarce tacut zero timp de o luna. Un magazin la 0 din N e
  // alarma.
  for (const m of rezultat.magazine) {
    const semn = m.cuRezultate === 0 && m.termeni > 0 ? "  <-- ATENTIE" : "";
    console.log(`MAGAZIN ${m.magazin.padEnd(14)} ${m.cuRezultate}/${m.termeni} termeni cu rezultate${semn}`);
  }

  console.log(
    `\nTERMENI: ${rezultat.termeni} cerute din ${rezultat.termeniInPlan} in plan` +
      `${rezultat.taiatDeTimp ? " (TAIAT DE TIMP)" : ""}.`,
  );

  if (dry) {
    console.log(`DRY: ${rezultat.observatii} observatii gasite, nimic scris.`);
  } else {
    console.log(
      `SCRIS: ${rezultat.observatiiNoi} observatii noi, ` +
        `${rezultat.materialeNoi} materiale noi, ${rezultat.duplicate} duplicate.`,
    );
  }

  console.log(`DURATA: ${Math.round(rezultat.durataMs / 1000)}s.`);

  if (rezultat.erori.length > 0) {
    console.log(`\nERORI (${rezultat.erori.length}), primele 10:`);
    for (const e of rezultat.erori.slice(0, 10)) {
      console.log(`  ${e.magazin} @ ${e.termen}: ${e.motiv}`);
    }
  }

  // Cod de eroare numai la cadere totala. O trecere in care trei magazine au mers
  // e o reusita; daca ar da 1, cine citeste mailul de cron s-ar invata sa-l
  // ignore, si atunci o cadere adevarata trece neobservata.
  if (esteCadereTotala(rezultat)) {
    console.error("\nNiciun magazin n-a dat nimic. Ceva e rupt.");
    process.exitCode = 1;
  }
}

main().catch((e) => {
  // O trecere picata nu trebuie sa arate ca una reusita intr-un cron.
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
