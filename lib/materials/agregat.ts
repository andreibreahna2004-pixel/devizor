import { round2 } from "@/lib/money";
import { normalizeForSearch } from "@/lib/norme";

/**
 * Reperul de piata pentru un fel de material: ce cere, cam, la magazine.
 *
 * Modul pur, fara Prisma si fara retea, ca `pricing.ts` si `lib/charts/path.ts`.
 * Se testeaza direct, si trebuie, fiindca aici se poate greși cel mai scump:
 * iese un numar care arata ca un pret si sta linga bani.
 *
 * ## Ce **nu** e cifra asta
 *
 * Nu e pretul unui produs. Magazinele nu vand acelasi articol: la o cautare de
 * parchet, Dedeman scoate un laminat de 12 mm la 87,89 lei/mp si Hornbach un
 * triplustratificat de stejar la 209 lei/mp. Media lor, 148, nu descrie nimic si
 * n-o cere nimeni. Si nu se poate lega altfel: in HTML-ul listelor nu exista EAN,
 * iar marfa care umple un deviz (parchet, adeziv, vopsea) e in bună parte marca
 * proprie a magazinului, deci de multe ori nu exista produs comun de identificat.
 *
 * Ce e: **un interval de piata pentru un fel de material, pe o unitate, la
 * magazinele astea, in fereastra asta.** De aia tipul de mai jos nu duce doar o
 * cifra, ci si imprastierea, numarul de magazine si fereastra. Cine il afiseaza
 * e obligat sa le arate: o mediana fara imprastiere linga ea e exact media
 * necinstita pe care modulul asta exista sa n-o produca.
 *
 * ## De ce nu se stocheaza
 *
 * Regula 1 din CLAUDE.md. Un agregat scris in baza ar fi un numar de bani derivat,
 * cu ciclu de viata propriu: cineva ar trebui sa decida cand se recalculeaza, si
 * fiecare recalculare ar fi o scriere de bani pe care n-a observat-o nimeni. Si
 * n-ar avea `observedAt` al lui: ca sa ramina cinstit, ar trebui sa duca cu el
 * care magazine, ce fereastra si ce randuri l-au facut, adica sa stocheze din nou
 * eșantionul. Eșantionul e deja in `MaterialPrice`. Deci un agregat stocat e ori
 * necinstit, ori de prisos.
 *
 * Calculat la citire, dintr-un tabel care doar creste, orice zi din trecut se
 * poate recalcula exact, filtrand pe `observedAt`.
 *
 * ## De ce nu trece prin `lib/pricing/calculator.ts`
 *
 * Regula 2 e despre adunarea banilor pe un document. Aici nu se aduna nimic si
 * nu iese niciun total: se aleg statistici de ordine peste observatii.
 * Rotunjirea vine tot din `lib/money.ts`, deci nici aia nu e inventata pe loc.
 */

/**
 * O observatie de la un magazin.
 *
 * N-are `countyCode`, anume. Pretul de raft al unui magazin online e national:
 * judetul schimba disponibilitatea si magazinul, nu cifra, si asa intra in
 * catalog, cu `countyCode: null`. Un cimp pe judet aici ar invita o dimensiune
 * care nu exista in sursa.
 */
export interface ObservatieMagazin {
  name: string;
  unit: string;
  price: number;
  /** `MaterialPrice.supplier`, adica `ConfigSite.nume`. */
  magazin: string;
  observedAt: Date;
  sourceUrl: string | null;
}

export interface FeliaMagazinului {
  magazin: string;
  mediana: number;
  min: number;
  max: number;
  /** Cate observatii a dat magazinul pe unitatea asta. */
  nr: number;
  /** Cea mai recenta observatie a magazinului. */
  observedAt: Date;
  /** Produsul care da mediana magazinului, ca omul sa poata verifica cifra. */
  exemplu: { name: string; price: number; sourceUrl: string | null };
}

export interface AgregatPiata {
  termen: string;
  unit: string;
  /** Mediana medianelor pe magazin: un magazin, un vot. */
  mediana: number;
  /** Extremele din toate observatiile folosite, nu din mediane. */
  min: number;
  max: number;
  /** `max / min`. 1 = toate magazinele la fel. */
  imprastiere: number;
  /** Peste `PRAG_IMPRASTIERE`: atunci se conduce cu intervalul, nu cu mediana. */
  imprastiereMare: boolean;
  /** Alfabetic pe magazin, ca doua rulari sa dea acelasi ecran. */
  magazine: FeliaMagazinului[];
  nrMagazine: number;
  nrObservatii: number;
  celMaiVechi: Date;
  celMaiNou: Date;
  /** Ce a ramas afara pentru ca era pe alta unitate. Nu se tace. */
  altaUnitate: { unit: string; nr: number }[];
}

/**
 * Peste atita imprastiere, o cifra din mijloc nu descrie nimic.
 *
 * 2x inseamna ca cel mai scump e dublul celui mai ieftin: termenul e prea larg,
 * si atunci se arata intervalul, nu mediana.
 */
export const PRAG_IMPRASTIERE = 2;

/**
 * Mediana, nu media.
 *
 * Rezultatele de cautare sunt un eșantion cu coada lunga, compus de magazin: pe
 * "parchet" iese un laminat de 40 lei/mp linga un stejar de 209. O medie e trasa
 * de orice articol scump nimerit pe prima pagina, ceea ce e o hotarire de
 * merchandising, nu o mișcare de pret.
 *
 * Si media nu rezista la un rand citit greșit. `parseNumar` avertizeaza in
 * propriul antet ca o eroare de factor 1000 "ar trece neobservat"; o singura
 * asemenea eroare mută o medie pe patru magazine cu vreo 25%, iar o mediana
 * aproape deloc. Statistica robusta e cea care se potrivește cu amenintarea pe
 * care codul si-o recunoaste.
 *
 * La numar par iese media celor doua din mijloc, deci o cifra pe care s-ar putea
 * sa n-o fi cerut niciun magazin. E in regula pentru o statistica etichetata,
 * aratata linga minim, maxim si valoarea fiecarui magazin.
 */
export function mediana(valori: number[]): number | null {
  if (valori.length === 0) return null;
  const sortate = [...valori].sort((a, b) => a - b);
  const mijloc = Math.floor(sortate.length / 2);
  return sortate.length % 2 === 1
    ? sortate[mijloc]
    : (sortate[mijloc - 1] + sortate[mijloc]) / 2;
}

function utila(o: ObservatieMagazin): boolean {
  return Number.isFinite(o.price) && o.price > 0 && o.magazin.trim().length > 0;
}

/**
 * Agregatul pe o unitate anume.
 *
 * `null` cand nu rimine nicio observatie folosibila pe unitatea cerută.
 */
export function agregatPentruUnitate(
  observatii: ObservatieMagazin[],
  termen: string,
  unit: string,
): AgregatPiata | null {
  const bune = observatii.filter(utila);

  // Unitatile se filtreaza, nu se convertesc. O conversie lei/pachet -> lei/mp ar
  // cere cati mp acopera pachetul, care e pe fiecare articol si nu se citeste de
  // incredere din lista. O cifra calculata pusa linga unele observate, fara sa se
  // poata deosebi, e mai rea decat lipsa ei. Ce nu se potrivește se numara si se
  // spune, in `altaUnitate`.
  const peUnitate = bune.filter((o) => o.unit === unit);
  if (peUnitate.length === 0) return null;

  const respinse = new Map<string, number>();
  for (const o of bune) {
    if (o.unit === unit) continue;
    respinse.set(o.unit, (respinse.get(o.unit) ?? 0) + 1);
  }

  // Cate un magazin, o data. Un magazin cu douazeci de rezultate si altul cu trei
  // ar face ca "media pe patru magazine" sa fie de fapt media pe unul.
  const grupe = new Map<string, ObservatieMagazin[]>();
  for (const o of peUnitate) {
    const cheie = o.magazin;
    const lista = grupe.get(cheie);
    if (lista) lista.push(o);
    else grupe.set(cheie, [o]);
  }

  const felii: FeliaMagazinului[] = [...grupe]
    .map(([magazin, ale]) => {
      const preturi = ale.map((o) => o.price);
      const med = mediana(preturi)!;

      // Exemplul e articolul cel mai apropiat de mediana magazinului: cifra
      // trebuie sa se poata verifica pe un produs adevarat, cu link.
      const aproape = ale.reduce((cel, o) =>
        Math.abs(o.price - med) < Math.abs(cel.price - med) ? o : cel,
      );

      return {
        magazin,
        mediana: round2(med),
        min: round2(Math.min(...preturi)),
        max: round2(Math.max(...preturi)),
        nr: ale.length,
        observedAt: new Date(Math.max(...ale.map((o) => o.observedAt.getTime()))),
        exemplu: {
          name: aproape.name,
          price: round2(aproape.price),
          sourceUrl: aproape.sourceUrl,
        },
      };
    })
    // Ordonare stabila, ca doua rulari sa dea acelasi ecran si o captura sa se
    // poata compara cu alta, acelasi motiv pentru care `demo:istoric` are
    // simbure fixat.
    .sort((a, b) => a.magazin.localeCompare(b.magazin, "ro"));

  const toatePreturile = peUnitate.map((o) => o.price);
  const min = Math.min(...toatePreturile);
  const max = Math.max(...toatePreturile);
  const imprastiere = min > 0 ? max / min : 1;
  const timpi = peUnitate.map((o) => o.observedAt.getTime());

  return {
    termen,
    unit,
    mediana: round2(mediana(felii.map((f) => f.mediana))!),
    min: round2(min),
    max: round2(max),
    imprastiere: Math.round(imprastiere * 100) / 100,
    imprastiereMare: imprastiere >= PRAG_IMPRASTIERE,
    magazine: felii,
    nrMagazine: felii.length,
    nrObservatii: peUnitate.length,
    celMaiVechi: new Date(Math.min(...timpi)),
    celMaiNou: new Date(Math.max(...timpi)),
    altaUnitate: [...respinse]
      .map(([u, nr]) => ({ unit: u, nr }))
      .sort((a, b) => b.nr - a.nr),
  };
}

/**
 * Cate un agregat pe fiecare unitate intalnita, cea cu cele mai multe observatii
 * prima.
 *
 * Un produs cotat si pe mp si pe pachet da doua agregate, si asa trebuie: sunt
 * doua baze de masura, nu doua preturi ale aceluiasi lucru.
 */
export function agregatePentruTermen(
  observatii: ObservatieMagazin[],
  termen: string,
): AgregatPiata[] {
  const unitati = new Map<string, number>();
  for (const o of observatii.filter(utila)) {
    unitati.set(o.unit, (unitati.get(o.unit) ?? 0) + 1);
  }

  return [...unitati]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ro"))
    .map(([unit]) => agregatPentruUnitate(observatii, termen, unit))
    .filter((a): a is AgregatPiata => a !== null);
}

/** Un material din catalog, cat trebuie ca sa se poata face o observatie. */
export interface MaterialCatalog {
  id: string;
  name: string;
  unit: string;
}

/** Un rand de pret din catalog, cu tipurile deja intoarse in numere. */
export interface PretCatalog {
  materialId: string;
  price: number;
  supplier: string | null;
  sourceUrl: string | null;
  observedAt: Date;
}

/**
 * Randurile din catalog, aduse in forma pe care o citeste agregatul.
 *
 * Sta aici, si nu in `service.ts`, ca sa se poata testa fara PostgreSQL. Partea
 * care greseste tacut nu e interogarea, ci **legatura**: un pret legat de alt
 * material ar duce denumirea si unitatea altcuiva in mediana, si nimic n-ar
 * arunca. De aia un pret orfan se arunca aici, explicit, si se poate numara.
 */
export function observatiiDinCatalog(
  materiale: MaterialCatalog[],
  preturi: PretCatalog[],
): ObservatieMagazin[] {
  const peId = new Map(materiale.map((m) => [m.id, m]));
  const iesire: ObservatieMagazin[] = [];

  for (const p of preturi) {
    const m = peId.get(p.materialId);
    // Fara material nu se poate spune nici denumirea, nici unitatea, deci nu se
    // poate spune nimic despre pretul asta.
    if (!m) continue;
    // Fara furnizor nu e pret de magazin: n-ar avea cui sa se atribuie votul.
    if (!p.supplier) continue;

    iesire.push({
      name: m.name,
      unit: m.unit,
      price: p.price,
      magazin: p.supplier,
      observedAt: p.observedAt,
      sourceUrl: p.sourceUrl,
    });
  }

  return iesire;
}

/**
 * Daca denumirea unui material se potrivește cu termenul cautat.
 *
 * Aceeasi punte ca `potrivesteMaterial` din `pricing.ts`, si tot prin
 * `normalizeForSearch`: diacriticele si majusculele nu conteaza.
 *
 * **Cifrele se potrivesc pe cuvant intreg, nu ca subsir**, si asta nu e
 * cochetarie. `potrivesteMaterial` cere doar subsir, ce e in regula la o cautare
 * pe care o vede omul; aici potrivirea hotaraste ce intra in aceeasi grupa de
 * pret. Cu subsir, termenul "polistiren expandat 5" ar prinde si "EPS 15 cm",
 * fiindca "5" se afla in "15", si in aceeasi mediana ar intra grosimi cu preturi
 * de citeva ori diferite. Greseala n-ar arunca nimic si nu s-ar vedea pe ecran:
 * ar ieși doar o cifra greșita, cu imprastiere mare, care pare marfa amestecata.
 */
export function potrivesteTermen(nume: string, termen: string): boolean {
  const cuvinte = normalizeForSearch(termen).split(/\s+/).filter(Boolean);
  if (cuvinte.length === 0) return false;

  const tinta = normalizeForSearch(nume);
  const bucati = tinta.split(/[^a-z0-9]+/).filter(Boolean);

  return cuvinte.every((c) =>
    /^\d+$/.test(c) ? bucati.includes(c) : tinta.includes(c),
  );
}
