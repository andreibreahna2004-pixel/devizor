import { PrismaClient } from "@prisma/client";

// In dev, Next reincarca modulele la fiecare salvare; fara singleton s-ar
// deschide cate un pool de conexiuni la fiecare hot reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
