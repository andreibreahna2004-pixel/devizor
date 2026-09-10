// Cale relativa, nu alias: modulul e folosit si de scripturi care ruleaza in
// afara bundlerului, ca `lib/consum/index.ts` si `lib/norme/index.ts`.
import raw from "../../data/termeni-magazin.json";

/**
 * Ce se cere la magazin, si pentru care lucrari.
 *
 * Puntea intre deviz si magazin. O linie de deviz numeste o lucrare
 * ("Tencuiala driscuita pe pereti"), nu un produs, si `EstimateLine` n-are
 * nicio legatura cu `Material`, si asta e deliberat, scrie in schema. Drumul e:
 *
 *   linia de deviz -> `cautaRetete` -> reteta -> termenii ei -> magazine
 *
 * De ce nu se caută direct denumirile din `data/consumuri.json`: sunt scrise
 * pentru o comanda de materiale, nu pentru caseta de cautare a unui magazin.
 * "Caramida cu goluri 25x25x23" nu gaseste nimic la Hornbach, iar trunchierea
 * automata la primele doua cuvinte ar fi o presupunere, si presupunerile n-au
 * ce cauta in lista care hotaraste ce se pune la pret.
 *
 * De ce nu se iau denumirile din `Material`: fiecare produs citit de la magazin
 * creeaza un rind in `Material`, deci tabelul ca sursa de termeni ar fi o bucla
 * care creste singura. Termenii vin din fisier, ca normele si consumurile:
 * nationali, curatati de om, si cu istorie in git.
 *
 * `laMagazin: false` nu e o omisiune, e un raspuns. Betonul gata preparat vine
 * de la statie, balastul se ia vrac, apa nu e marfa. Interfata spune "nu se
 * urmareste la magazine", nu arata un agregat gol: gol se citeste "n-am gasit
 * azi", cand adevarul e "nu ne uitam acolo".
 */

export interface TermenMagazin {
  /** Ce se scrie in cautarea magazinului. */
  termen: string;
  /**
   * Unitatea pe care se asteapta pretul de la magazin, care nu e mereu cea a
   * retetei: siliconul e socotit in ml de tub si se vinde la bucata.
   */
  um: string;
  /** Materialul din reteta, ca sa se vada de unde vine termenul. */
  material: string;
  /** Fals cand marfa nu se cumpara la magazinele astea. Vezi `motiv`. */
  laMagazin: boolean;
  motiv?: string;
  /** Id-urile retetelor servite de termen. */
  retete: string[];
}

export const TERMENI = raw as TermenMagazin[];

const PE_TERMEN = new Map(TERMENI.map((t) => [`${t.termen}|${t.um}`, t]));

/** Termenii ceruti efectiv la magazine. */
export function termeniLaMagazin(): TermenMagazin[] {
  return TERMENI.filter((t) => t.laMagazin);
}

export function getTermen(termen: string, um: string): TermenMagazin | null {
  return PE_TERMEN.get(`${termen}|${um}`) ?? null;
}

/**
 * Termenii unei retete, in ordinea din fisier.
 *
 * Include si cei cu `laMagazin: false`: pagina trebuie sa poata spune de ce un
 * material din reteta nu are pret, nu sa-l ascunda.
 */
export function termeniPentruReteta(retetaId: string): TermenMagazin[] {
  return TERMENI.filter((t) => t.retete.includes(retetaId));
}
