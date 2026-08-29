import type { Metadata } from "next";
import { CATEGORII, RETETE } from "@/lib/consum";
import { requireUser } from "@/lib/tenant";
import { ConsumCalculator } from "./consum-calculator";

export const metadata: Metadata = { title: "Consumuri" };

/**
 * Calculatorul de consum specific.
 *
 * Devizul spune cit costa lucrarea; pagina asta spune cit material cumperi ca
 * s-o faci. Nu produce niciun leu si nu scrie in nicio linie de deviz — vezi
 * antetul din `lib/consum/index.ts` pentru de ce conteaza distinctia.
 *
 * Datele stau in fisier si sunt nationale, deci pagina nu interogheaza nimic;
 * cere totusi sesiune, ca si celelalte: e o unealta de lucru, nu o vitrina.
 */
export default async function ConsumuriPage() {
  await requireUser();

  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-sm text-ink-500">
        Cit material intra intr-o lucrare. Cifrele sunt intervale, nu valori
        exacte: consumul real depinde de produs, de suport si de om. Fisa tehnica
        a produsului cumparat are ultimul cuvint.
      </p>

      <ConsumCalculator retete={RETETE} categorii={CATEGORII} />
    </div>
  );
}
