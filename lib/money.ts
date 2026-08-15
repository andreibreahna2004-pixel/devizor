/**
 * Aritmetica si formatarea banilor.
 *
 * Modul pur, fara dependinte de baza de date: e importat si de componentele
 * client, iar un import de `@prisma/client` de aici ar trage tot clientul
 * Prisma in bundle-ul de browser. Conversia catre coloane Decimal sta separat,
 * in `lib/money-db.ts`.
 */

/**
 * Rotunjire zecimala corecta (half-up), fara artefactele virgulei mobile.
 *
 * `Math.round(1.005 * 100) / 100` da 1.00 pentru ca 1.005 e stocat binar ca
 * 1.00499999999999989. Trucul cu notatia exponentiala re-parseaza literalul
 * zecimal, deci scalarea nu mai trece prin inmultire binara.
 */
export function round(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return 0;

  const negative = value < 0;
  const abs = Math.abs(value);
  const asString = String(abs);

  // Numerele deja in forma exponentiala (foarte mici / foarte mari) nu pot fi
  // scalate prin string. Sunt oricum in afara ordinului de marime al banilor.
  const shifted = asString.includes("e")
    ? abs * 10 ** decimals
    : Number(`${asString}e${decimals}`);

  const roundedInt = Math.round(shifted);
  const result = Number(`${roundedInt}e-${decimals}`);

  return negative ? -result : result;
}

/** Rotunjire la bani (2 zecimale) — pentru valori si totaluri. */
export const round2 = (value: number) => round(value, 2);

/** Rotunjire la 4 zecimale — pentru preturi unitare si cantitati. */
export const round4 = (value: number) => round(value, 4);

/**
 * Orice reprezentare numerica venita din baza de date, ca number.
 *
 * Tipul e structural, nu `Prisma.Decimal`, tocmai ca modulul sa ramana pur:
 * un Decimal se potriveste prin `toString()`.
 */
export type Numeric = number | string | { toString(): string } | null | undefined;

export function toNumber(value: Numeric): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = typeof value === "string" ? Number(value) : Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

const leiFormatter = new Intl.NumberFormat("ro-RO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const qtyFormatter = new Intl.NumberFormat("ro-RO", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

/** "12.345,67" — format romanesc, fara simbolul monedei. */
export function formatLei(value: Numeric): string {
  return leiFormatter.format(round2(toNumber(value)));
}

/** "1.250,5" — cantitati, fara zerouri inutile la final. */
export function formatQty(value: Numeric): string {
  return qtyFormatter.format(round4(toNumber(value)));
}

const UNITS = [
  "zero", "unu", "doua", "trei", "patru", "cinci", "sase", "sapte", "opt", "noua",
  "zece", "unsprezece", "doisprezece", "treisprezece", "paisprezece", "cincisprezece",
  "saisprezece", "saptesprezece", "optsprezece", "nouasprezece",
];
const TENS = [
  "", "", "douazeci", "treizeci", "patruzeci", "cincizeci",
  "saizeci", "saptezeci", "optzeci", "nouazeci",
];

function underThousand(n: number): string {
  if (n < 20) return UNITS[n];
  if (n < 100) {
    const rest = n % 10;
    return TENS[Math.floor(n / 10)] + (rest ? ` si ${UNITS[rest]}` : "");
  }
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const prefix = hundreds === 1 ? "o suta" : `${UNITS[hundreds]} sute`;
  return rest ? `${prefix} ${underThousand(rest)}` : prefix;
}

/**
 * Suma in litere, pentru facturi. Multe firme o cer inca pe document.
 * Ex. 1234.50 -> "una mie doua sute treizeci si patru lei si 50 bani".
 */
export function amountInWords(value: number): string {
  const total = round2(Math.abs(value));
  const lei = Math.floor(total);
  const bani = Math.round((total - lei) * 100);

  let words: string;
  if (lei === 0) {
    words = "zero";
  } else if (lei < 1000) {
    words = underThousand(lei);
  } else if (lei < 1_000_000) {
    const thousands = Math.floor(lei / 1000);
    const rest = lei % 1000;
    const prefix = thousands === 1 ? "una mie" : `${underThousand(thousands)} mii`;
    words = rest ? `${prefix} ${underThousand(rest)}` : prefix;
  } else {
    const millions = Math.floor(lei / 1_000_000);
    const rest = lei % 1_000_000;
    const prefix = millions === 1 ? "un milion" : `${underThousand(millions)} milioane`;
    const restWords = rest ? ` ${amountInWords(rest).replace(/ lei.*$/, "")}` : "";
    words = `${prefix}${restWords}`;
  }

  const sign = value < 0 ? "minus " : "";
  return `${sign}${words} lei si ${String(bani).padStart(2, "0")} bani`;
}
