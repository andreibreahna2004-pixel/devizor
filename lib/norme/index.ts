// Cale relativa, nu alias: modulul e folosit si de scripturile din `scripts/`,
// care ruleaza in afara bundlerului.
import rawC from "../../data/norme-c.json";
import rawRpc from "../../data/norme-rpc.json";
import rawTs from "../../data/norme-ts.json";

/**
 * Indicatoarele de norme de deviz.
 *
 * Sunt liste nationale, aceleasi pentru toate firmele, deci stau in fisiere, nu
 * in baza de date: nu se editeaza si nu au `orgId`. Din ele se iau doar codul,
 * denumirea si unitatea de masura — consumurile normate si preturile nu au ce
 * cauta aici, pentru ca pretul il scrie omul pe linia de deviz.
 *
 *  C  — lucrari de constructii. Extras dintr-un PDF cu text, cu
 *       `node scripts/import-norme.mjs <pdf>`.
 *  Ts — lucrari de terasamente. Sursa e o carte scanata, din care OCR-ul nu
 *       scoate coduri de incredere, deci tabla de materii a fost transcrisa.
 *       De acolo lipseste unitatea de masura: la Ts `um` e null si o pune omul.
 */

export type Indicator = "C" | "RpC" | "Ts";

export interface Norma {
  /** Codul oficial, ex. "CA01A1" sau "TS C 04". */
  cod: string;
  denumire: string;
  /**
   * Unitatea din indicator, normalizata la cea folosita in aplicatie.
   * null cand sursa nu o da — se completeaza pe linia de deviz.
   */
  um: string | null;
  indicator: Indicator;
}

/**
 * Indicatorul scrie unitatile cu punct si majuscule ("M.C."); in deviz se
 * folosesc formele scurte. Normele fara unitate in sursa primesc "buc", pe
 * care omul o schimba daca nu se potriveste.
 */
const UNIT_MAP: Record<string, string> = {
  "MP.": "mp",
  "M.C.": "mc",
  M: "ml",
  KG: "kg",
  "BUC.": "buc",
  TONA: "to",
  L: "l",
  "100 BUC.": "100 buc",
  "100 M.": "100 ml",
};

type RawNorma = { cod: string; denumire: string; um: string | null };

export const NORME: Norma[] = [
  ...(rawC as RawNorma[]).map((n) => ({
    cod: n.cod,
    denumire: n.denumire,
    // In indicatorul C toate normele au unitate; daca sursa a pierdut-o,
    // "buc" e alegerea neutra pe care omul o schimba pe linie.
    um: (n.um && UNIT_MAP[n.um]) ?? "buc",
    indicator: "C" as const,
  })),
  ...(rawRpc as RawNorma[]).map((n) => ({
    cod: n.cod,
    denumire: n.denumire,
    // Exportul de RpC nu are randul de unitati de masura.
    um: n.um,
    indicator: "RpC" as const,
  })),
  ...(rawTs as RawNorma[]).map((n) => ({
    cod: n.cod,
    denumire: n.denumire,
    um: n.um,
    indicator: "Ts" as const,
  })),
];

/** Codurile se compara fara spatii: "TS C 04" si "TSC04" sint acelasi lucru. */
function normalizeCode(cod: string): string {
  return cod.replace(/\s+/g, "").toUpperCase();
}

const BY_CODE = new Map(NORME.map((n) => [normalizeCode(n.cod), n]));

/** Indexul de cautare, calculat o data la incarcarea modulului. */
const SEARCH_INDEX = NORME.map((n) => ({
  norma: n,
  haystack: normalizeForSearch(`${n.cod} ${n.denumire}`),
}));

export function getNorma(cod: string): Norma | null {
  return BY_CODE.get(normalizeCode(cod)) ?? null;
}

/**
 * Formele sub care cautam un cuvant.
 *
 * Doua nepotriviri stau intre cum vorbeste omul si cum e scris indicatorul:
 *
 *  1. Ortografia. Indicatorul e tiparit inainte de reforma din 1993, cu "i" in
 *     loc de "a"/"i" din i: scrie STILPI, TIMPLARIE, CIMP. Cine tasteaza
 *     "stalpi" nu ar gasi nimic, asa ca incercam si varianta veche.
 *  2. Numarul. Norma zice "PLANSEE", omul scrie "planseu". De aceea pastram si
 *     o forma trunchiata, folosita doar cand cautarea exacta nu da nimic.
 */
interface WordForms {
  /** Formele cautate oriunde in text. */
  exact: string[];
  /**
   * Formele trunchiate, cautate doar la inceput de cuvant. Fara conditia asta,
   * "stalp" ar ajunge la "stal" si ar prinde "inSTALatii".
   */
  loose: RegExp | null;
}

function wordForms(rawWord: string): WordForms {
  const exact = new Set<string>();
  exact.add(normalizeForSearch(rawWord));
  // "â"/"î" din cuvantul de azi apar ca "i" in indicator.
  exact.add(normalizeForSearch(rawWord.replace(/[âîÂÎ]/g, "i")));

  const stems = new Set<string>();
  for (const form of exact) {
    if (form.length >= 5) stems.add(form.slice(0, Math.max(4, form.length - 2)));

    // Cine scrie "stalp" sau "tamplarie" fara diacritice nu ne lasa sa stim
    // unde era "â". Incercam pe rand fiecare "a": una dintre variante nimereste
    // forma din indicator ("stilp", "timplarie").
    if (form.length >= 4 && form.length <= 12) {
      for (let i = 0; i < form.length; i++) {
        if (form[i] !== "a") continue;
        const swapped = `${form.slice(0, i)}i${form.slice(i + 1)}`;
        stems.add(swapped.slice(0, Math.max(4, swapped.length - 2)));
      }
    }
  }

  const loose =
    stems.size > 0
      ? new RegExp(`\\b(?:${[...stems].map(escapeRegExp).join("|")})`)
      : null;

  return { exact: [...exact], loose };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Vocabularul de santier tradus in vocabularul indicatorului.
 *
 * `wordForms` trece peste ortografia veche (stilpi/stalpi), dar nu si peste
 * cuvinte pur si simplu diferite. Omul zice "santul fundatiei", indicatorul
 * numeste acelasi lucru "spatii limitate"; omul zice "sapa", indicatorul zice
 * "strat suport". Fara punte, cautarea nu da zero — da altceva, ceea ce e mai
 * rau: "sapa" scoate epuizarea apei din sapaturi, "sant fundatie" scoate
 * confectionarea armaturilor.
 *
 * Fiecare intrare e verificata pe ce intoarce efectiv indicatorul; cazurile
 * stau in `santier.test.ts`. Cine adauga aici verifica intii ca tinta exista —
 * o traducere gresita mai departe de adevar decit cuvantul original.
 *
 * Nu se traduc lucrarile care chiar nu au norma (termosistem, tamplarie PVC,
 * parchet laminat): acolo raspunsul corect e zero rezultate, nu o norma vecina.
 */
const VOCABULAR: [RegExp, string][] = [
  // Sapatura pentru fundatie: indicatorul o clasifica dupa spatiul de lucru,
  // nu dupa forma. "Sant" e in Ts rigola de scurgere, cu totul altceva.
  [/\bsantul fundatiei\b/g, "spatii limitate"],
  [/\bsant(ul)? (de )?fundatie\b/g, "spatii limitate"],
  [/\bsapatur[aei] (de )?fundatie\b/g, "sapatura spatii limitate"],

  // Sapa de nivelare a pardoselii. "Sapa" singur cade in familia sapaturilor.
  [/\bsapa autonivelanta\b/g, "strat suport"],
  [/\bsap[ae]\b/g, "strat suport"],

  // Indicatorul nu are "decofrare": cofrajul se monteaza si se demonteaza.
  [/\bdecofra(re|rea|ri|t|re[ai])\b/g, "demontare cofraje"],

  // Gresia de pardoseala e in RpC ca "pardoseli din placi de gresie ceramica";
  // "gresie" singur scoate scafe si placaje de perete.
  [/\bpardose(li|ala) (din )?gresie\b/g, "pardoseli placi gresie ceramica"],
  [/\bgresie (la |pe )?pardose(li|ala)\b/g, "pardoseli placi gresie ceramica"],
];

/**
 * Interogarea rescrisa in termenii indicatorului.
 *
 * Cind nicio intrare nu se potriveste, se intoarce interogarea neatinsa — nu
 * forma normalizata. Normalizarea pierde informatie de care `wordForms` are
 * nevoie: din "stalpi" cu diacritice scoate direct "stilpi", forma tiparita.
 */
function applyVocabulary(query: string): string {
  const normalized = normalizeForSearch(query);

  let rewritten = normalized;
  for (const [pattern, replacement] of VOCABULAR) {
    rewritten = rewritten.replace(pattern, replacement);
  }

  return rewritten === normalized ? query : rewritten;
}

/**
 * Cauta in indicator dupa cuvinte cheie.
 *
 * Fiecare cuvant din interogare trebuie sa apara in norma (SI, nu SAU), altfel
 * "tencuiala exterioara" ar intoarce si toate tencuielile interioare.
 * Diacriticele se ignora: indicatorul e scris fara ele, iar pe santier nimeni
 * nu le tasteaza.
 *
 * Interogarea trece intii prin `VOCABULAR`, care traduce termenii de santier in
 * cei ai indicatorului ("sapa" -> "strat suport").
 *
 * Cand cautarea exacta nu gaseste nimic, se reia cu cuvintele trunchiate. Asa
 * o interogare precisa ramane precisa, iar una care ar fi dat zero rezultate
 * din cauza unei terminatii intoarce totusi ceva.
 *
 * Rezultatele mai scurte ies primele — sunt normele generale, nu variantele cu
 * zeci de conditii in denumire.
 */
export function searchNorme(query: string, limit = 25): Norma[] {
  const words = applyVocabulary(query)
    .trim()
    .split(/\s+/)
    .map(wordForms)
    .filter((w) => w.exact.some((f) => f.length >= 2));

  if (words.length === 0) return [];

  const run = (allowLoose: boolean) => {
    const found: Norma[] = [];
    for (const entry of SEARCH_INDEX) {
      const matches = words.every(
        (word) =>
          word.exact.some((form) => entry.haystack.includes(form)) ||
          (allowLoose && word.loose !== null && word.loose.test(entry.haystack)),
      );
      if (matches) found.push(entry.norma);
    }
    return found;
  };

  const found = run(false);
  const results = found.length > 0 ? found : run(true);

  return results
    .sort((a, b) => a.denumire.length - b.denumire.length || a.cod.localeCompare(b.cod))
    .slice(0, limit);
}

/** "Tencuială exterioară" -> "tencuiala exterioara" */
export function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[șş]/g, "s")
    .replace(/[țţ]/g, "t")
    .trim();
}

interface Grupa {
  prefix: string;
  eticheta: string;
  indicator: Indicator;
}

/**
 * Grupele indicatoarelor.
 *
 * La Ts sint capitolele oficiale, citite din sumarul cartii. La C, unde sursa
 * nu are titluri de capitol, etichetele sint deduse din continut — repere care
 * ajuta la gasirea normei potrivite, in interfata si in promptul AI-ului.
 */
export const GRUPE: Grupa[] = [
  { prefix: "TS A", eticheta: "Sapaturi manuale", indicator: "Ts" },
  { prefix: "TS B", eticheta: "Sapaturi in stinca", indicator: "Ts" },
  { prefix: "TS C", eticheta: "Sapaturi mecanice", indicator: "Ts" },
  { prefix: "TS D", eticheta: "Umpluturi", indicator: "Ts" },
  { prefix: "TS E", eticheta: "Nivelari, finisari si pregatirea platformei", indicator: "Ts" },
  { prefix: "TS F", eticheta: "Sprijinirea malurilor", indicator: "Ts" },
  { prefix: "TS G", eticheta: "Curatirea terenului", indicator: "Ts" },
  { prefix: "TS H", eticheta: "Amenajari peluze, plantari, alei, terenuri de sport", indicator: "Ts" },
  { prefix: "TS I", eticheta: "Transport si depozitare mecanizata", indicator: "Ts" },
  { prefix: "TS J", eticheta: "Consolidari terasamente", indicator: "Ts" },

  { prefix: "RPCA", eticheta: "Sapaturi la reparatii", indicator: "RpC" },
  { prefix: "RPCB", eticheta: "Betoane la reparatii", indicator: "RpC" },
  { prefix: "RPCC", eticheta: "Cofraje la reparatii", indicator: "RpC" },
  { prefix: "RPCD", eticheta: "Armaturi la reparatii", indicator: "RpC" },
  { prefix: "RPCE", eticheta: "Reparatii de izolatii si terase", indicator: "RpC" },
  { prefix: "RPCF", eticheta: "Zidarii de piatra la reparatii", indicator: "RpC" },
  { prefix: "RPCG", eticheta: "Zidarii de caramida la reparatii", indicator: "RpC" },
  { prefix: "RPCH", eticheta: "Sarpante si lucrari de lemn", indicator: "RpC" },
  { prefix: "RPCI", eticheta: "Invelitori la reparatii", indicator: "RpC" },
  { prefix: "RPCJ", eticheta: "Reparatii de tencuieli", indicator: "RpC" },
  { prefix: "RPCK", eticheta: "Pardoseli la reparatii", indicator: "RpC" },
  { prefix: "RPCL", eticheta: "Scari si trepte la reparatii", indicator: "RpC" },
  { prefix: "RPCM", eticheta: "Placaje la reparatii", indicator: "RpC" },
  { prefix: "RPCN", eticheta: "Profile si ornamente", indicator: "RpC" },
  { prefix: "RPCO", eticheta: "Tamplarie la reparatii", indicator: "RpC" },
  { prefix: "RPCP", eticheta: "Confectii metalice la reparatii", indicator: "RpC" },
  { prefix: "RPCQ", eticheta: "Geamuri la reparatii", indicator: "RpC" },
  { prefix: "RPCR", eticheta: "Zugraveli si vopsitorii la reparatii", indicator: "RpC" },
  { prefix: "RPCS", eticheta: "Trotuare si lucrari exterioare la reparatii", indicator: "RpC" },
  { prefix: "RPCT", eticheta: "Demolari si desfaceri", indicator: "RpC" },
  { prefix: "RPCU", eticheta: "Sobe, cosuri si lucrari de teracota", indicator: "RpC" },
  { prefix: "RPCX", eticheta: "Plansee de lemn", indicator: "RpC" },

  { prefix: "CA", eticheta: "Betoane turnate", indicator: "C" },
  { prefix: "CB", eticheta: "Cofraje", indicator: "C" },
  { prefix: "CC", eticheta: "Armaturi montate", indicator: "C" },
  { prefix: "CD", eticheta: "Zidarii", indicator: "C" },
  { prefix: "CE", eticheta: "Invelitori si sarpante", indicator: "C" },
  { prefix: "CF", eticheta: "Tencuieli", indicator: "C" },
  { prefix: "CG", eticheta: "Pardoseli si straturi suport", indicator: "C" },
  { prefix: "CH", eticheta: "Trepte si scari", indicator: "C" },
  { prefix: "CI", eticheta: "Placaje", indicator: "C" },
  { prefix: "CJ", eticheta: "Profile, scafe, rabit", indicator: "C" },
  { prefix: "CK", eticheta: "Tamplarie", indicator: "C" },
  { prefix: "CL", eticheta: "Confectii metalice montate", indicator: "C" },
  { prefix: "CM", eticheta: "Geamuri si vitraje", indicator: "C" },
  { prefix: "CN", eticheta: "Zugraveli si vopsitorii", indicator: "C" },
  { prefix: "CO", eticheta: "Trotuare si lucrari exterioare", indicator: "C" },
  { prefix: "CP", eticheta: "Montaj prefabricate", indicator: "C" },
  { prefix: "CW", eticheta: "Lucrari provizorii de santier", indicator: "C" },
  { prefix: "CZ", eticheta: "Preparare betoane, mortare, confectionare armaturi", indicator: "C" },
];

/** Grupele cu numarul de norme din fiecare, pentru afisare si pentru prompt. */
export function grupeCuNumar(): (Grupa & { numar: number })[] {
  return GRUPE.map((grupa) => ({
    ...grupa,
    numar: NORME.filter((n) => n.cod.startsWith(grupa.prefix)).length,
  }));
}
