import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { allocateDocumentNumber, createDefaultSeries, formatFullNumber } from "./series";

const prisma = new PrismaClient();

/**
 * Testul care conteaza: numerotarea sub concurenta. Ruleaza pe baza de date
 * reala, pentru ca exact comportamentul Postgres la update-uri concurente e
 * ce vrem sa verificam — un mock ar testa mock-ul.
 *
 * Necesita DATABASE_URL catre o baza de date de test cu migrarile aplicate.
 */

let orgId: string;

beforeAll(async () => {
  await prisma.$connect();

  const org = await prisma.organization.create({
    data: {
      name: "Test Numerotare SRL",
      slug: `test-numerotare-${Date.now()}`,
      cui: "12345678",
      address: "Str. Testului 1",
      city: "SECTOR 1",
      countyCode: "RO-B",
    },
  });
  orgId = org.id;
  await createDefaultSeries(prisma, orgId);
});

afterAll(async () => {
  if (orgId) {
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  }
  await prisma.$disconnect().catch(() => {});
});

describe("formatFullNumber", () => {
  it("completeaza cu zerouri pana la 6 cifre", () => {
    expect(formatFullNumber("FCT", 42)).toBe("FCT-000042");
    expect(formatFullNumber("DVZ", 1)).toBe("DVZ-000001");
    expect(formatFullNumber("FCT", 1234567)).toBe("FCT-1234567");
  });
});

describe("allocateDocumentNumber", () => {
  it("aloca numere consecutive", async () => {
    const first = await allocateDocumentNumber(prisma, orgId, "DEVIZ");
    const second = await allocateDocumentNumber(prisma, orgId, "DEVIZ");

    expect(first.series).toBe("DVZ");
    expect(second.number).toBe(first.number + 1);
    expect(second.fullNumber).toBe(formatFullNumber("DVZ", second.number));
  });

  it(
    "50 de emiteri simultane produc 50 de numere distincte, fara goluri",
    async () => {
      const CONCURRENT = 50;

      const results = await Promise.all(
        Array.from({ length: CONCURRENT }, () =>
          allocateDocumentNumber(prisma, orgId, "FACTURA"),
        ),
      );

      const numbers = results.map((r) => r.number).sort((a, b) => a - b);
      const unique = new Set(numbers);

      expect(unique.size).toBe(CONCURRENT);

      // Secventa trebuie sa fie continua: fara goluri intre primul si ultimul.
      for (let i = 1; i < numbers.length; i++) {
        expect(numbers[i]).toBe(numbers[i - 1] + 1);
      }
    },
    30_000,
  );

  it("respinge o serie inexistenta", async () => {
    await expect(
      allocateDocumentNumber(prisma, orgId, "FACTURA", "NU-EXISTA"),
    ).rejects.toThrow(/nu exista/i);
  });

  it(
    "rollback-ul tranzactiei elibereaza numarul alocat",
    async () => {
      const before = await prisma.documentSeries.findFirstOrThrow({
        where: { orgId, kind: "PROFORMA" },
      });

      await prisma
        .$transaction(async (tx) => {
          await allocateDocumentNumber(tx, orgId, "PROFORMA");
          throw new Error("esec simulat la salvarea documentului");
        })
        .catch(() => {});

      const after = await prisma.documentSeries.findFirstOrThrow({
        where: { orgId, kind: "PROFORMA" },
      });

      // Daca numarul nu s-ar da inapoi, secventa ar avea un gol permanent.
      expect(after.nextNumber).toBe(before.nextNumber);
    },
  );
});
