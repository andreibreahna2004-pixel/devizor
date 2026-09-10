import type { Metadata } from "next";
import { cautaRetete } from "@/lib/consum";
import { agregatLaMagazine } from "@/lib/materials/service";
import { termeniPentruReteta } from "@/lib/materials/termeni";
import { requireUser } from "@/lib/tenant";
import { MarketView, type RandTermen } from "./market-view";

export const metadata: Metadata = { title: "La magazine" };

/**
 * Cat cere piata pentru materialele care intra intr-o lucrare.
 *
 * Drumul, de la o lucrare de deviz la niste preturi:
 *
 *   descrierea lucrarii -> `cautaRetete` -> reteta -> termenii ei -> agregat
 *
 * O linie de deviz numeste o lucrare, nu un produs, si nu se poate cauta la
 * Hornbach. Retetele din `lib/consum/` stiu ce materiale intra in ea, iar
 * `lib/materials/termeni.ts` stie cum se cheama fiecare in caseta de cautare a
 * unui magazin.
 *
 * Nimic de aici nu scrie in vreun deviz si nu atinge un deviz existent. Sunt
 * repere, cu provenienta la vedere: pe deviz ramine cifra scrisa de om.
 */
export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUser();

  const { q = "" } = await searchParams;

  const retete = q.trim() ? cautaRetete(q, 6) : [];

  // Termenii tuturor retetelor gasite, o data fiecare: doua retete pot cere
  // acelasi adeziv, si n-are rost sa apara de doua ori pe ecran. Cand se repeta,
  // se adauga lucrarea la cel existent, ca sa se vada de unde vine.
  const termeni = new Map<
    string,
    { termen: string; um: string; material: string; laMagazin: boolean; motiv?: string; lucrari: string[] }
  >();

  for (const r of retete) {
    for (const t of termeniPentruReteta(r.id)) {
      const cheie = `${t.termen}|${t.um}`;
      const deja = termeni.get(cheie);
      if (deja) {
        if (!deja.lucrari.includes(r.denumire)) deja.lucrari.push(r.denumire);
        continue;
      }
      termeni.set(cheie, {
        termen: t.termen,
        um: t.um,
        material: t.material,
        laMagazin: t.laMagazin,
        motiv: t.motiv,
        lucrari: [r.denumire],
      });
    }
  }

  const randuri: RandTermen[] = await Promise.all(
    [...termeni.values()].map(async (t) => {
      if (!t.laMagazin) {
        return { ...t, agregate: [] };
      }

      const agregate = await agregatLaMagazine(t.termen);

      // Numai unitatea pe care o asteapta termenul: un pret pe pachet cand se
      // asteapta pe mp e o alta cotatie, nu un pret mai mare. Ce nu se potriveste
      // se numara in `altaUnitate` si se spune pe ecran.
      const alUnitatii = agregate.filter((a) => a.unit === t.um);

      return {
        ...t,
        agregate: (alUnitatii.length > 0 ? alUnitatii : agregate.slice(0, 1)).map((a) => ({
          unit: a.unit,
          asteptata: a.unit === t.um,
          mediana: a.mediana,
          min: a.min,
          max: a.max,
          imprastiere: a.imprastiere,
          imprastiereMare: a.imprastiereMare,
          nrMagazine: a.nrMagazine,
          nrObservatii: a.nrObservatii,
          celMaiVechi: a.celMaiVechi.toISOString(),
          celMaiNou: a.celMaiNou.toISOString(),
          altaUnitate: a.altaUnitate,
          magazine: a.magazine.map((m) => ({
            magazin: m.magazin,
            mediana: m.mediana,
            min: m.min,
            max: m.max,
            nr: m.nr,
            observedAt: m.observedAt.toISOString(),
            exemplu: m.exemplu,
          })),
        })),
      };
    }),
  );

  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-sm text-ink-500">
        Cat cere piata pentru materialele care intra intr-o lucrare, citit la
        Dedeman, Hornbach, Leroy Merlin si Brico. Sunt repere, nu preturile tale:
        pe deviz ramine cifra pe care o scrii tu.
      </p>

      <MarketView q={q} randuri={randuri} lucrari={retete.map((r) => r.denumire)} />
    </div>
  );
}
