/**
 * Seed demonstrativ.
 *
 * Creeaza o firma completa, cu un beneficiar si un proiect, ca sa se poata
 * umbla prin aplicatie imediat dupa instalare. Nu exista catalog de incarcat:
 * devizele se scriu direct, cu preturile firmei. Ruleaza cu `npm run db:seed`.
 *
 * Idempotent: rularea a doua oara nu dubleaza nimic.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_EMAIL = "demo@devizor.ro";
const DEMO_PASSWORD = "devizor123";

async function main() {
  console.log("Se pregateste contul demo...");

  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    console.log(`Contul ${DEMO_EMAIL} exista deja. Nimic de facut.`);
    return;
  }

  const org = await prisma.organization.create({
    data: {
      name: "Construct Expert SRL",
      slug: "construct-expert",
      cui: "12345678",
      vatPayer: true,
      regCom: "J12/1234/2020",
      address: "Str. Constructorilor nr. 12",
      city: "Cluj-Napoca",
      countyCode: "RO-CJ",
      postalCode: "400001",
      email: "office@construct-expert.ro",
      phone: "0264 111 222",
      iban: "RO49AAAA1B31007593840000",
      bank: "Banca Transilvania",
      defaultVatRate: 21,
    },
  });

  await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      name: "Andrei Popescu",
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
      memberships: { create: { orgId: org.id, role: "OWNER" } },
    },
  });

  await prisma.documentSeries.createMany({
    data: (["DEVIZ", "FACTURA", "PROFORMA", "SITUATIE"] as const).map((kind) => ({
      orgId: org.id,
      kind,
      series: { DEVIZ: "DVZ", FACTURA: "FCT", PROFORMA: "PRO", SITUATIE: "SIT" }[kind],
      isDefault: true,
    })),
  });

  await prisma.vatRate.createMany({
    data: [
      {
        label: "Cota standard",
        rate: 21,
        validFrom: new Date("2025-08-01"),
        isDefault: true,
      },
      { label: "Cota redusa", rate: 11, validFrom: new Date("2025-08-01") },
      { label: "Scutit", rate: 0, validFrom: new Date("2000-01-01") },
    ],
    skipDuplicates: true,
  });

  const client = await prisma.client.create({
    data: {
      orgId: org.id,
      type: "PERSOANA_JURIDICA",
      name: "Imobiliare Nord SRL",
      cui: "87654321",
      vatPayer: true,
      regCom: "J12/999/2019",
      address: "Bd. Eroilor nr. 5",
      city: "Cluj-Napoca",
      countyCode: "RO-CJ",
      postalCode: "400002",
      email: "contact@imobiliarenord.ro",
      phone: "0264 333 444",
    },
  });

  const project = await prisma.project.create({
    data: {
      orgId: org.id,
      clientId: client.id,
      name: "Casa P+1 Floresti",
      description: "Locuinta unifamiliala, amprenta 120 mp",
      address: "Str. Salcamilor nr. 8",
      city: "Floresti",
      countyCode: "RO-CJ",
    },
  });

  console.log("Cont demo pregatit.");
  console.log(`  Email:  ${DEMO_EMAIL}`);
  console.log(`  Parola: ${DEMO_PASSWORD}`);
  console.log(`  Firma:  ${org.name}`);
  console.log(`  Beneficiar: ${client.name} · Proiect: ${project.name}`);
  console.log("  Deviz demo: npm run demo:deviz");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
