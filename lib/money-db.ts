import { Prisma } from "@prisma/client";
import { round } from "./money";

/**
 * Conversia numerelor catre coloanele Decimal din Postgres.
 *
 * Sta separat de `lib/money.ts` pentru ca importa clientul Prisma. Modulul de
 * aritmetica e folosit si in browser, unde acel import ar aduce tot ORM-ul in
 * bundle degeaba.
 */
export function toDecimal(value: number, decimals = 2): Prisma.Decimal {
  return new Prisma.Decimal(round(value, decimals).toFixed(decimals));
}
