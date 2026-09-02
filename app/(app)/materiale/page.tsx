import type { Metadata } from "next";
import { COUNTIES } from "@/lib/counties";
import { cautaMaterialeProaspete } from "@/lib/materials/service";
import { requireUser } from "@/lib/tenant";
import { MaterialSearch } from "./material-search";

export const metadata: Metadata = { title: "Materiale" };

/**
 * Preturile materialelor pe zona.
 *
 * Catalogul e national — preturile pietei sunt aceleasi pentru toate firmele —
 * dar pagina cere oricum sesiune: e o unealta de lucru, nu o vitrina publica.
 */
export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; judet?: string }>;
}) {
  await requireUser();

  const { q = "", judet = "" } = await searchParams;
  const countyCode = judet || null;

  // Cautarea isi improspateaza singura catalogul: cand nu are nimic pentru
  // interogarea asta, sau cand ce are e vechi, cere la magazin si scrie ce
  // gaseste. Vezi `cautaMaterialeProaspete`.
  const { materiale, cerutLaFurnizor } = await cautaMaterialeProaspete(q, countyCode, "1A");

  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-sm text-ink-500">
        Preturi de referinta, cu evolutia lor in timp. Sunt repere de piata, nu
        preturile tale: pe deviz ramine cifra pe care o scrii tu.
      </p>

      <MaterialSearch
        q={q}
        judet={judet}
        judete={COUNTIES.map((c) => ({ code: c.code, name: c.name }))}
        cerutLaFurnizor={cerutLaFurnizor}
        materiale={materiale.map((m) => ({
          id: m.id,
          name: m.name,
          unit: m.unit,
          pret: m.reper?.price ?? null,
          national: m.reper?.national ?? false,
          observedAt: m.reper?.observedAt.toISOString() ?? null,
          supplier: m.reper?.supplier ?? null,
          sourceUrl: m.reper?.sourceUrl ?? null,
          evolutie: m.evolutie,
        }))}
      />
    </div>
  );
}
