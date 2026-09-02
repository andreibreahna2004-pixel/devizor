import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { type PriceObservation } from "../import";
import { cautaMaterialeProaspete } from "../service";

const prisma = new PrismaClient();

/**
 * Decizia de a iesi sau nu la magazin, pe baza reala.
 *
 * Aici se verifica exact ce nu se vede din afara: ca a doua cautare in aceeasi
 * zi nu mai deranjeaza magazinul, si ca scraperul oprit chiar nu cere nimic.
 */

const NUME = `Parchet proba ${Date.now()}`;

function sursaFalsa(observatii: PriceObservation[]) {
  const cereri: string[] = [];
  const cauta = async (interogare: string) => {
    cereri.push(interogare);
    return observatii;
  };
  return { cauta, cereri };
}

/** Muta observatiile inapoi in timp, ca sa se considere invechite. */
async function imbatraneste(zile: number) {
  const material = await prisma.material.findFirstOrThrow({ where: { name: NUME } });
  await prisma.materialPrice.updateMany({
    where: { materialId: material.id },
    data: { observedAt: new Date(Date.now() - zile * 24 * 3_600_000) },
  });
}

const observatie = (price: number): PriceObservation => ({
  name: NUME,
  unit: "mp",
  price,
  countyCode: null,
  observedAt: new Date(),
  supplier: "Dedeman",
  sourceUrl: "https://exemplu.invalid/p/1",
});

beforeAll(async () => {
  await prisma.$connect();
});

afterEach(() => {
  delete process.env.SCRAPER_ACTIV;
});

afterAll(async () => {
  await prisma.material.deleteMany({ where: { name: NUME } }).catch(() => {});
  await prisma.$disconnect().catch(() => {});
});

describe("cautaMaterialeProaspete", () => {
  it("nu iese la magazin cand scraperul e oprit", async () => {
    process.env.SCRAPER_ACTIV = "false";
    const { cauta, cereri } = sursaFalsa([observatie(57.9)]);

    const rezultat = await cautaMaterialeProaspete(NUME, null, "1A", cauta);

    expect(cereri).toHaveLength(0);
    expect(rezultat.cerutLaFurnizor).toBe(false);
    expect(rezultat.materiale).toHaveLength(0);
  });

  it("cere la magazin cand catalogul n-are nimic, si scrie ce gaseste", async () => {
    process.env.SCRAPER_ACTIV = "true";
    const { cauta, cereri } = sursaFalsa([observatie(57.9)]);

    const rezultat = await cautaMaterialeProaspete(NUME, null, "1A", cauta);

    expect(cereri).toEqual([NUME]);
    expect(rezultat.cerutLaFurnizor).toBe(true);
    expect(rezultat.observatiiNoi).toBe(1);
    // Materialul se vede imediat, cu pretul lui: se recitesc datele dupa scriere.
    expect(rezultat.materiale).toHaveLength(1);
    expect(rezultat.materiale[0].reper?.price).toBe(57.9);
    expect(rezultat.materiale[0].reper?.supplier).toBe("Dedeman");
  });

  it("nu mai cere nimic cat timp ce e in catalog e proaspat", async () => {
    process.env.SCRAPER_ACTIV = "true";
    const { cauta, cereri } = sursaFalsa([observatie(60)]);

    const rezultat = await cautaMaterialeProaspete(NUME, null, "1A", cauta);

    expect(cereri).toHaveLength(0);
    expect(rezultat.cerutLaFurnizor).toBe(false);
    // Pretul ramane cel scris la cautarea de dinainte, nu cel nou.
    expect(rezultat.materiale[0].reper?.price).toBe(57.9);
  });

  it("cere din nou cand ce e in catalog s-a invechit", async () => {
    process.env.SCRAPER_ACTIV = "true";
    // Se imbatrineste rindul in baza, nu se asteapta ceasul: altfel testul ar
    // depinde de cit de repede a rulat cel dinainte.
    await imbatraneste(2);

    const { cauta, cereri } = sursaFalsa([observatie(61.5)]);
    const rezultat = await cautaMaterialeProaspete(NUME, null, "1A", cauta);

    expect(cereri).toEqual([NUME]);
    expect(rezultat.observatiiNoi).toBe(1);
  });

  it("pastreaza si observatia veche, nu o suprascrie", async () => {
    // De aici iese graficul de evolutie: MaterialPrice creste, nu se rescrie.
    const material = await prisma.material.findFirstOrThrow({ where: { name: NUME } });
    const preturi = await prisma.materialPrice.findMany({
      where: { materialId: material.id },
      orderBy: { observedAt: "asc" },
    });

    expect(preturi.length).toBe(2);
    expect(preturi.map((p) => Number(p.price)).sort()).toEqual([57.9, 61.5]);
  });

  it("nu cade cand magazinul nu intoarce nimic", async () => {
    process.env.SCRAPER_ACTIV = "true";
    await imbatraneste(2);

    const { cauta } = sursaFalsa([]);
    const rezultat = await cautaMaterialeProaspete(NUME, null, "1A", cauta);

    expect(rezultat.cerutLaFurnizor).toBe(true);
    expect(rezultat.observatiiNoi).toBe(0);
    // Catalogul local ramane raspunsul, si el e bun.
    expect(rezultat.materiale).toHaveLength(1);
  });
});
