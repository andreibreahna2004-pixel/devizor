/**
 * Tipareste un cookie de sesiune valid pentru contul demo.
 * Doar pentru dezvoltare si testare locala a rutelor de API.
 * Ruleaza cu: npm run dev:token
 */
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const prisma = new PrismaClient();

async function main() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET lipseste din .env");

  const user = await prisma.user.findFirstOrThrow({
    where: { email: "demo@devizor.ro" },
    include: { memberships: { take: 1 } },
  });

  const token = await new SignJWT({
    userId: user.id,
    orgId: user.memberships[0].orgId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(new Date(Date.now() + 3_600_000))
    .sign(new TextEncoder().encode(secret));

  console.log(token);
}

main().finally(() => prisma.$disconnect());
