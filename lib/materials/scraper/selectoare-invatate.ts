import "server-only";
import { prisma } from "@/lib/db";
import { type SelectoareSite } from "./extract";

/**
 * Selectoarele pe care modelul le-a gasit uitandu-se la pagina reala.
 *
 * Asta e ce face ca stratul cu model sa nu coste la fiecare cautare: prima data
 * cineva plateste un apel, iar de la a doua magazinul se citeste determinist, cu
 * un set de selectoare care n-a fost ghicit de nimeni. Cand magazinul se reface si
 * selectoarele nu mai prind, randul se sterge si se reinvata la urmatoarea
 * cautare.
 *
 * Scrierea si citirea nu au voie sa strice o cautare: la orice eroare de baza se
 * merge mai departe fara ele.
 */

/** Dupa atatea cautari la rand in care n-au prins nimic, selectoarele se arunca. */
const PRAG_ESECURI = 2;

export async function selectoareInvatate(magazin: string): Promise<SelectoareSite | null> {
  const rand = await prisma.magazinSelector
    .findUnique({ where: { magazin }, select: { selectoare: true } })
    .catch(() => null);

  return (rand?.selectoare as SelectoareSite | undefined) ?? null;
}

export async function salveazaSelectoare(
  magazin: string,
  selectoare: SelectoareSite,
): Promise<void> {
  await prisma.magazinSelector.upsert({
    where: { magazin },
    create: { magazin, selectoare: { ...selectoare } },
    update: { selectoare: { ...selectoare }, invatatLa: new Date(), esecuri: 0 },
  });
}

/** Selectoarele au mers: se numara, ca sa se vada ce economisesc. */
export async function noteazaReusita(magazin: string): Promise<void> {
  await prisma.magazinSelector
    .update({ where: { magazin }, data: { reusite: { increment: 1 }, esecuri: 0 } })
    .catch(() => {});
}

/** N-au prins nimic. La al doilea esec la rand se sterg: magazinul s-a schimbat. */
export async function noteazaEsec(magazin: string): Promise<void> {
  const rand = await prisma.magazinSelector
    .update({ where: { magazin }, data: { esecuri: { increment: 1 } }, select: { esecuri: true } })
    .catch(() => null);

  if (rand && rand.esecuri >= PRAG_ESECURI) {
    await prisma.magazinSelector.delete({ where: { magazin } }).catch(() => {});
  }
}
