import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { importaIndiciManopera, importaObservatii, indiceManopera } from "./service";

const prisma = new PrismaClient();

/**
 * Scrierea in catalog, pe baza reala.
 *
 * Ce se verifica aici nu se poate verifica altfel: ca un import rulat de doua
 * ori nu umple tabelul cu copii, si ca totusi nu suprascrie nimic — cele doua
 * cerinte trag in directii opuse si se pot strica una pe alta la orice
 * modificare. Un mock ar testa mock-ul.
 *
 * Necesita DATABASE_URL catre o baza cu migrarile aplicate.
 */

// Nume unic, ca rularea sa nu se incurce cu datele de demo din aceeasi baza.
const NUME = `Test import ${Date.now()}`;
const PERIOADA = new Date("1990-01-01T00:00:00.000Z");
const JUDET = "RO-TL";

const observatie = (price: number, zi: string, countyCode: string | null = "RO-CJ") => ({
  name: NUME,
  unit: "sac",
  price,
  countyCode,
  observedAt: new Date(`${zi}T00:00:00.000Z`),
  supplier: "Furnizor de test",
  sourceUrl: "https://example.invalid/pret",
});

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.material.deleteMany({ where: { name: NUME } }).catch(() => {});
  await prisma.laborIndex
    .deleteMany({ where: { countyCode: JUDET, period: PERIOADA } })
    .catch(() => {});
  await prisma.$disconnect().catch(() => {});
});

describe("importaObservatii", () => {
  it("creeaza materialul o singura data si scrie observatia", async () => {
    const rezultat = await importaObservatii([observatie(26.5, "2026-01-15")], "FURNIZOR");

    expect(rezultat).toEqual({ materialeNoi: 1, observatii: 1, duplicate: 0 });

    const material = await prisma.material.findFirstOrThrow({ where: { name: NUME } });
    const preturi = await prisma.materialPrice.findMany({ where: { materialId: material.id } });

    expect(preturi).toHaveLength(1);
    expect(preturi[0].source).toBe("FURNIZOR");
    expect(preturi[0].supplier).toBe("Furnizor de test");
    expect(Number(preturi[0].price)).toBe(26.5);
  });

  it("nu scrie a doua oara aceeasi observatie", async () => {
    const rezultat = await importaObservatii([observatie(26.5, "2026-01-15")], "FURNIZOR");

    expect(rezultat).toEqual({ materialeNoi: 0, observatii: 0, duplicate: 1 });

    const material = await prisma.material.findFirstOrThrow({ where: { name: NUME } });
    const preturi = await prisma.materialPrice.findMany({ where: { materialId: material.id } });
    expect(preturi).toHaveLength(1);
  });

  it("adauga un pret nou fara sa-l stearga pe cel vechi", async () => {
    const rezultat = await importaObservatii([observatie(28.9, "2026-02-15")], "FURNIZOR");

    expect(rezultat.observatii).toBe(1);
    expect(rezultat.materialeNoi).toBe(0);

    const material = await prisma.material.findFirstOrThrow({ where: { name: NUME } });
    const preturi = await prisma.materialPrice.findMany({
      where: { materialId: material.id },
      orderBy: { observedAt: "asc" },
    });

    // Doua randuri, in ordinea in care s-au observat: de aici iese graficul.
    expect(preturi.map((p) => Number(p.price))).toEqual([26.5, 28.9]);
  });

  it("acelasi pret in alt judet e alta observatie", async () => {
    const rezultat = await importaObservatii(
      [observatie(26.5, "2026-01-15", "RO-B")],
      "FURNIZOR",
    );

    expect(rezultat.observatii).toBe(1);
    expect(rezultat.duplicate).toBe(0);
  });
});

describe("importaIndiciManopera", () => {
  it("scrie indicele, apoi il revizuieste in acelasi rand", async () => {
    const primul = await importaIndiciManopera([
      { countyCode: JUDET, value: 0.91, period: PERIOADA, sourceUrl: "https://example.invalid" },
    ]);
    expect(primul).toEqual({ scrisi: 1, actualizati: 0 });

    const revizuit = await importaIndiciManopera([
      { countyCode: JUDET, value: 0.94, period: PERIOADA, sourceUrl: "https://example.invalid" },
    ]);
    expect(revizuit).toEqual({ scrisi: 0, actualizati: 1 });

    const randuri = await prisma.laborIndex.findMany({
      where: { countyCode: JUDET, period: PERIOADA },
    });

    // O perioada, un adevar: statistica revizuita o inlocuieste pe cea provizorie.
    expect(randuri).toHaveLength(1);
    expect(Number(randuri[0].value)).toBe(0.94);
  });

  it("indiceManopera intoarce null pentru un judet fara date", async () => {
    expect(await indiceManopera(null)).toBeNull();
    expect(await indiceManopera("RO-XX")).toBeNull();
  });

  it("indiceManopera intoarce valoarea importata", async () => {
    expect(await indiceManopera(JUDET)).toBe(0.94);
  });
});
