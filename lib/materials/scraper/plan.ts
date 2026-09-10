/**
 * Ce se cere la magazine intr-o trecere, si in ce ordine.
 *
 * Modul pur, ca sa se poata testa fara baza si fara retea. Ordinea si bugetul
 * hotarasc de fapt ce ajunge in catalog, deci merita verificate direct.
 *
 * ## De ce nu exista tabel de progres
 *
 * Ordinea e cel-mai-vechi-intii, iar vechimea se citeste din
 * `MaterialPrice.observedAt`, care exista oricum. Deci trecerea n-are nevoie de
 * cursor, de rind de stare, de "unde am rams". O rulare care cade la jumatate
 * gaseste maine aceiasi termeni neterminati in capul listei, fiindca sunt cei
 * mai vechi. Asta e proprietatea cea mai buna a intregii socoteli: cine adauga
 * un tabel `ScanRun` ii adauga si o a doua sursa de adevar despre ce s-a facut.
 */

export interface TermenDeScanat {
  termen: string;
  um: string;
  /** Cea mai recenta observatie de magazin, sau `null` cand n-a fost cerut niciodata. */
  ultimaObservatie: Date | null;
}

/**
 * Vechimea fiecarui termen, din materialele care i se potrivesc.
 *
 * Sta aici, pur, si nu in `service.ts`, ca sa se poata testa fara PostgreSQL:
 * greseala care conteaza nu e interogarea, ci socoteala. Doua capcane, amindoua
 * verificate in teste:
 *
 *  - **unitatea trebuie sa se potriveasca**, nu doar denumirea. Acelasi parchet
 *    exista in catalog si pe mp si pe pachet; luand-o pe oricare, termenul de pe
 *    mp ar parea proaspat pentru ca s-a citit cel pe pachet;
 *  - **se ia cea mai recenta** dintre toate materialele potrivite. Cu prima
 *    gasita, un material vechi ar tine termenul in capul cozii la infinit, si
 *    trecerea zilnica ar reciti mereu acelasi lucru.
 *
 * `potriveste` se injecteaza, ca modulul sa nu depinda de `agregat.ts`.
 */
export function vechimeaDinCatalog(
  termeni: { termen: string; um: string }[],
  materiale: { id: string; name: string; unit: string }[],
  ultimaPeMaterial: Map<string, Date | null>,
  potriveste: (nume: string, termen: string) => boolean,
): TermenDeScanat[] {
  return termeni.map(({ termen, um }) => {
    let ultima: Date | null = null;

    for (const m of materiale) {
      if (m.unit !== um) continue;
      if (!potriveste(m.name, termen)) continue;
      const cand = ultimaPeMaterial.get(m.id);
      if (cand && (!ultima || cand > ultima)) ultima = cand;
    }

    return { termen, um, ultimaObservatie: ultima };
  });
}

/**
 * Nescanatele intii, apoi cele mai vechi, apoi alfabetic.
 *
 * Alfabeticul la egalitate nu e cochetarie: doua rulari peste aceleasi date
 * trebuie sa dea acelasi plan, altfel un log de rulare picata nu se mai poate
 * reproduce.
 */
export function ordoneazaPlanul(termeni: TermenDeScanat[]): TermenDeScanat[] {
  return [...termeni].sort((a, b) => {
    const ta = a.ultimaObservatie?.getTime() ?? -Infinity;
    const tb = b.ultimaObservatie?.getTime() ?? -Infinity;
    if (ta !== tb) return ta - tb;
    return (
      a.termen.localeCompare(b.termen, "ro") || a.um.localeCompare(b.um, "ro")
    );
  });
}

/**
 * Primii `nr` din plan.
 *
 * Restul rimin pe maine: ordinea ii aduce inapoi in cap, fiindca intre timp au
 * devenit cei mai vechi.
 */
export function taiePlanul(plan: TermenDeScanat[], nr: number): TermenDeScanat[] {
  if (!Number.isFinite(nr) || nr <= 0) return [];
  return plan.slice(0, Math.floor(nr));
}

/**
 * Cati termeni incap intr-o trecere, socotit din ritm si din timpul disponibil.
 *
 * Magazinele merg in paralel pe origini diferite, deci un termen costa cam o
 * pauza plus raspunsul cel mai lent. Se pastreaza o rezerva, ca ultimul termen
 * sa nu fie taiat de limita platformei la jumatatea scrierii.
 */
export function termeniCareIncap(
  bugetMs: number,
  pauzaMs: number,
  timeoutMs: number,
  rezervaMs = 60_000,
): number {
  const util = bugetMs - rezervaMs;
  if (util <= 0) return 0;
  // Cazul rau: un magazin care nu raspunde tine termenul pina la timeout.
  const peTermen = Math.max(pauzaMs, 1) + timeoutMs / 4;
  return Math.max(0, Math.floor(util / peTermen));
}
