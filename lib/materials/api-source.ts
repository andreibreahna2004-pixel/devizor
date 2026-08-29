import { z } from "zod";
import { isValidCountyCode } from "@/lib/counties";
import { type PriceObservation, type PriceSource } from "./import";

/**
 * Sursa de preturi care citeste de la un API.
 *
 * Transportul se injecteaza (`fetchImpl`), nu se ia din global. Nu e o
 * pedanterie: fara el, tot lantul — cerere, validare, mapare, scriere — n-ar
 * putea fi verificat decat lovind un server real. Asa se testeaza intreg, cu un
 * API prefacut, iar cel adevarat doar se substituie.
 *
 * ------------------------------------------------------------------
 * CE TREBUIE SA INTOARCA API-UL
 * ------------------------------------------------------------------
 * `GET {PRETURI_API_URL}?page=1` cu antetul `Authorization: Bearer {cheia}`,
 * si un JSON de forma:
 *
 *   {
 *     "items": [
 *       {
 *         "name": "Ciment Portland CEM II 42,5R 40 kg",
 *         "unit": "sac",
 *         "price": 26.5,
 *         "county": "RO-CJ",          // optional; lipsa = pret national
 *         "observedAt": "2026-08-28",  // optional; lipsa = acum
 *         "supplier": "Nume furnizor", // optional
 *         "url": "https://..."         // optional, ca omul sa poata verifica
 *       }
 *     ],
 *     "nextPage": 2                    // optional; lipsa sau null = ultima pagina
 *   }
 *
 * Daca API-ul tau raspunde altfel, singurul loc de schimbat e `raspunsSchema`
 * si maparea de sub el. Restul aplicatiei nu cunoaste forma raspunsului.
 */

const itemSchema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1),
  price: z.number().nonnegative().finite(),
  county: z.string().nullable().optional(),
  observedAt: z.string().nullable().optional(),
  supplier: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
});

const raspunsSchema = z.object({
  items: z.array(itemSchema),
  nextPage: z.number().int().positive().nullable().optional(),
});

export interface ApiSourceConfig {
  baseUrl: string;
  apiKey?: string | null;
  /** Numele afisat in fata omului. */
  name?: string;
  /** Injectat in teste; implicit `fetch`-ul global. */
  fetchImpl?: typeof fetch;
  /** Oprire de siguranta: un API care raspunde mereu cu `nextPage` n-ar termina. */
  maxPages?: number;
}

export class ApiSourceError extends Error {}

/**
 * Un item din API -> o observatie, sau `null` daca nu e de incredere.
 *
 * Un judet necunoscut nu opreste importul si nici nu se pastreaza ca atare: se
 * trece pe national. Mai bine un pret pe tara, spus ca atare, decat unul legat
 * de o zona care nu exista.
 */
function laObservatie(
  item: z.infer<typeof itemSchema>,
  acum: Date,
): PriceObservation {
  const county = item.county?.trim().toUpperCase() ?? "";
  const data = item.observedAt ? new Date(item.observedAt) : acum;

  return {
    name: item.name.trim(),
    unit: item.unit.trim(),
    price: item.price,
    countyCode: county && isValidCountyCode(county) ? county : null,
    observedAt: Number.isNaN(data.getTime()) ? acum : data,
    supplier: item.supplier?.trim() || null,
    sourceUrl: item.url?.trim() || null,
  };
}

export function createApiPriceSource(config: ApiSourceConfig): PriceSource {
  const {
    baseUrl,
    apiKey,
    name = "API preturi",
    fetchImpl = fetch,
    maxPages = 50,
  } = config;

  return {
    name,
    async fetch(): Promise<PriceObservation[]> {
      const acum = new Date();
      const observatii: PriceObservation[] = [];

      let page: number | null = 1;
      let pagini = 0;

      while (page !== null && pagini < maxPages) {
        const url = new URL(baseUrl);
        url.searchParams.set("page", String(page));

        const raspuns = await fetchImpl(url.toString(), {
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        });

        if (!raspuns.ok) {
          throw new ApiSourceError(
            `${name} a raspuns ${raspuns.status} pentru pagina ${page}`,
          );
        }

        const brut: unknown = await raspuns.json();
        const parsat = raspunsSchema.safeParse(brut);
        if (!parsat.success) {
          // Un raspuns de forma gresita opreste importul, nu il lasa sa scrie pe
          // jumatate: preturile ajung in fata omului ca reper, iar o umplere
          // partiala ar arata la fel cu una completa.
          throw new ApiSourceError(
            `${name} a intors un raspuns neasteptat la pagina ${page}: ` +
              parsat.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; "),
          );
        }

        for (const item of parsat.data.items) {
          observatii.push(laObservatie(item, acum));
        }

        page = parsat.data.nextPage ?? null;
        pagini++;
      }

      return observatii;
    },
  };
}

/** Adevarat cand exista configuratie pentru un API de preturi. */
export function isPriceApiConfigured(): boolean {
  return Boolean(process.env.PRETURI_API_URL?.trim());
}

/**
 * Sursa configurata din mediu, sau `null` cand nu e nimic setat.
 *
 * Ca si cheia de AI: lipsa configuratiei nu strica nimic, doar importul automat
 * e indisponibil. Listele de preturi si introducerea manuala merg mai departe.
 */
export function priceApiFromEnv(fetchImpl?: typeof fetch): PriceSource | null {
  const baseUrl = process.env.PRETURI_API_URL?.trim();
  if (!baseUrl) return null;

  return createApiPriceSource({
    baseUrl,
    apiKey: process.env.PRETURI_API_KEY?.trim() || null,
    name: process.env.PRETURI_API_NUME?.trim() || "API preturi",
    fetchImpl,
  });
}
