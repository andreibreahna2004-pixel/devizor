/**
 * Ce conexiune primeste `prisma migrate deploy`.
 *
 * Modul pur, fara efecte laterale, ca sa poata fi verificat direct: alegerea
 * asta se face o data pe deploy, si cand e gresita build-ul cade cu un mesaj
 * care nu pomeneste nicaieri cuvintul "pooled".
 *
 * ## De ce nu merge pe conexiunea aplicatiei
 *
 * Pe Neon, `DATABASE_URL` e conexiunea pooled: trece prin pgbouncer in mod
 * tranzactie, si acolo nu exista stare de sesiune. `migrate deploy` cere un
 * `pg_advisory_lock`, care e o incuietoare de sesiune, deci asteapta degeaba si
 * pica dupa 10 secunde cu P1002 "Timed out trying to acquire a postgres
 * advisory lock". Mesajul arata ca o baza cazuta, si nu e: e pgbouncer.
 *
 * ## Ordinea in care se cauta o conexiune directa
 *
 * 1. `DIRECT_URL`, scrisa de om — hotarirea explicita bate orice ghicire.
 * 2. `DATABASE_URL_UNPOOLED` sau `POSTGRES_URL_NON_POOLING` — le pune singura
 *    integrarea Neon-Vercel in mediul proiectului. Daca exista, deploy-ul se
 *    repara fara ca cineva sa configureze ceva.
 * 3. Dedusa din `DATABASE_URL`, scotand `-pooler` din nume. La Neon aceeasi
 *    baza are doua nume care difera doar prin sufixul asta, si cel fara el e
 *    conexiunea directa. E singurul pas care ghiceste, deci se face numai pe
 *    forma aia de nume si se scrie in log ce s-a dedus.
 *
 * Daca nu se potriveste nimic, ramane `DATABASE_URL` neatins: unele conexiuni
 * pooled accepta totusi migrarile, si nu noi oprim deploy-ul din banuiala.
 *
 * Nu se umbla cu `new URL()` peste tot sirul: ala normalizeaza si reincodeaza
 * userul si parola, iar o parola cu semne iese pe partea cealalta schimbata si
 * conexiunea e refuzata pentru un motiv care n-are legatura cu nimic. Se taie
 * bucata de gazda si bucata de parametri, si numai ele se ating.
 */

/** Parametrii care au sens doar pe conexiunea prin pgbouncer. */
const PARAMETRI_DE_POOL = ["pgbouncer", "connection_limit", "pool_timeout"];

/**
 * Imparte un URL de Postgres in bucati, fara sa reincodeze nimic.
 *
 * Intoarce `null` cand sirul nu are forma asteptata — atunci nu se deduce
 * nimic, se foloseste asa cum e.
 */
function bucati(url) {
  const dupaSchema = url.indexOf("://");
  if (dupaSchema === -1) return null;

  const inceputAutoritate = dupaSchema + 3;
  // Autoritatea tine pana la prima bara sau primul semn de intrebare de dupa ea.
  let sfarsitAutoritate = url.length;
  for (let i = inceputAutoritate; i < url.length; i++) {
    if (url[i] === "/" || url[i] === "?") {
      sfarsitAutoritate = i;
      break;
    }
  }

  const autoritate = url.slice(inceputAutoritate, sfarsitAutoritate);
  const rest = url.slice(sfarsitAutoritate);
  const semn = rest.indexOf("?");

  // Userul si parola pot contine `@`; gazda incepe dupa ultimul.
  const dupaAcret = autoritate.lastIndexOf("@");

  return {
    prefix: url.slice(0, inceputAutoritate),
    acreditari: dupaAcret === -1 ? "" : autoritate.slice(0, dupaAcret + 1),
    gazda: dupaAcret === -1 ? autoritate : autoritate.slice(dupaAcret + 1),
    cale: semn === -1 ? rest : rest.slice(0, semn),
    parametri: semn === -1 ? "" : rest.slice(semn + 1),
  };
}

/**
 * Adevarat cand conexiunea arata pooled, oricum ar fi scrisa.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function parePooled(url) {
  const p = bucati(url);
  if (p === null) return false;
  if (p.gazda.includes("-pooler.") || p.gazda.includes(".pooler.")) return true;
  return new URLSearchParams(p.parametri).get("pgbouncer") === "true";
}

/**
 * Scoate `-pooler` din nume si parametrii care tin de pgbouncer.
 *
 * Intoarce `null` cand nu e de dedus nimic, ca apelantul sa nu ramana cu
 * impresia ca a schimbat ceva.
 *
 * @param {string} url
 * @returns {string | null}
 */
export function directDinPooled(url) {
  const p = bucati(url);
  if (p === null || !p.gazda.includes("-pooler.")) return null;

  const gazda = p.gazda.replace("-pooler.", ".");

  const parametri = new URLSearchParams(p.parametri);
  for (const nume of PARAMETRI_DE_POOL) parametri.delete(nume);
  const coada = parametri.toString();

  return `${p.prefix}${p.acreditari}${gazda}${p.cale}${coada ? `?${coada}` : ""}`;
}

/**
 * Conexiunea pe care merg migrarile, si de unde vine.
 *
 * `sursa` se scrie in log: cand un deploy pica, primul lucru de aflat e pe ce
 * conexiune s-a incercat.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ url: string, sursa: string, pooled?: boolean } | null}
 */
export function urlPentruMigrare(env = process.env) {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) return null;

  const direct = env.DIRECT_URL?.trim();
  if (direct) return { url: direct, sursa: "DIRECT_URL" };

  for (const nume of ["DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING"]) {
    const din = env[nume]?.trim();
    if (din) return { url: din, sursa: nume };
  }

  const dedus = directDinPooled(databaseUrl);
  if (dedus) return { url: dedus, sursa: "dedus", pooled: true };

  return { url: databaseUrl, sursa: "DATABASE_URL", pooled: parePooled(databaseUrl) };
}
