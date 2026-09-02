/**
 * `robots.txt`, luat in serios.
 *
 * Un magazin care spune ca nu vrea sa fie parcurs pe o cale anume trebuie
 * ascultat, si nu doar din cuviinta: o aplicatie care ignora regula ajunge
 * blocata, iar catalogul se opreste oricum. Interpretorul e mic si pur, deci se
 * poate testa pe reguli scrise de mana.
 *
 * Reguli implementate, in ordinea in care conteaza:
 *  - se aleg intii regulile scrise pentru agentul nostru; daca nu exista, cele
 *    pentru `*`;
 *  - la egalitate, castiga potrivirea cea mai lunga, iar `Allow` bate `Disallow`
 *    la aceeasi lungime (regula Google, adoptata de toata lumea);
 *  - `Disallow:` gol inseamna "totul permis";
 *  - un robots.txt care lipseste sau da eroare inseamna permis. Un 5xx tratat ca
 *    interdictie ar opri catalogul din cauza unei caderi trecatoare a lor.
 */

export interface Regula {
  cale: string;
  permite: boolean;
}

export interface Robots {
  reguli: Regula[];
}

/** Traduce un tipar din robots.txt (`*` si `$`) intr-o expresie regulata. */
function tiparInRegex(cale: string): RegExp {
  const escapat = cale
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  const ancorat = escapat.endsWith("\\$") ? escapat.slice(0, -2) + "$" : escapat;
  return new RegExp("^" + ancorat);
}

export function parseRobots(text: string, agent: string): Robots {
  const agentMic = agent.toLowerCase();
  const grupuri = new Map<string, Regula[]>();
  let agentiCurenti: string[] = [];
  let inGrup = false;

  for (const linieBruta of text.split(/\r?\n/)) {
    const linie = linieBruta.split("#")[0].trim();
    if (!linie) continue;

    const separator = linie.indexOf(":");
    if (separator === -1) continue;

    const cheie = linie.slice(0, separator).trim().toLowerCase();
    const valoare = linie.slice(separator + 1).trim();

    if (cheie === "user-agent") {
      // Un grup nou incepe la primul User-agent de dupa reguli; mai multi
      // User-agent la rand impart acelasi grup de reguli.
      if (inGrup) {
        agentiCurenti = [];
        inGrup = false;
      }
      agentiCurenti.push(valoare.toLowerCase());
      if (!grupuri.has(valoare.toLowerCase())) grupuri.set(valoare.toLowerCase(), []);
      continue;
    }

    if (cheie !== "allow" && cheie !== "disallow") continue;
    if (agentiCurenti.length === 0) continue;

    inGrup = true;
    // "Disallow:" fara valoare inseamna ca nu se interzice nimic.
    if (cheie === "disallow" && valoare === "") continue;
    if (valoare === "") continue;

    for (const a of agentiCurenti) {
      grupuri.get(a)!.push({ cale: valoare, permite: cheie === "allow" });
    }
  }

  const alNostru = [...grupuri.entries()].find(([a]) => agentMic.includes(a) && a !== "*");
  const reguli = alNostru?.[1] ?? grupuri.get("*") ?? [];
  return { reguli };
}

/**
 * Adevarat cand calea poate fi ceruta.
 *
 * Fara reguli, totul e permis — asa spune standardul, si asa se comporta si
 * cazul in care fisierul lipseste.
 */
export function estePermis(robots: Robots, cale: string): boolean {
  let castigator: Regula | null = null;
  let lungime = -1;

  for (const regula of robots.reguli) {
    if (!tiparInRegex(regula.cale).test(cale)) continue;
    const l = regula.cale.length;
    // La aceeasi lungime, Allow bate Disallow.
    if (l > lungime || (l === lungime && regula.permite && !castigator?.permite)) {
      castigator = regula;
      lungime = l;
    }
  }

  return castigator ? castigator.permite : true;
}

const CACHE = new Map<string, Robots>();

/**
 * `robots.txt` al unei origini, cerut o singura data pe proces.
 *
 * Cache-ul nu e o optimizare: fara el, fiecare cautare a unui om ar mai adauga o
 * cerere la magazin, doar ca sa afle acelasi raspuns.
 */
export async function iaRobots(
  origine: string,
  agent: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Robots> {
  const cheie = `${origine}|${agent}`;
  const dinCache = CACHE.get(cheie);
  if (dinCache) return dinCache;

  let robots: Robots = { reguli: [] };
  try {
    const raspuns = await fetchImpl(new URL("/robots.txt", origine).toString(), {
      headers: { "User-Agent": agent },
    });
    if (raspuns.ok) robots = parseRobots(await raspuns.text(), agent);
  } catch {
    // Reteaua a cazut sau fisierul nu exista: se merge mai departe ca si cum
    // n-ar exista reguli. Vezi antetul pentru de ce nu se blocheaza aici.
  }

  CACHE.set(cheie, robots);
  return robots;
}

/** Doar pentru teste: goleste cache-ul intre cazuri. */
export function golesteCacheRobots(): void {
  CACHE.clear();
}
