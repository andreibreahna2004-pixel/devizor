import { z } from "zod";
import { isValidCountyCode } from "@/lib/counties";

/**
 * Indicele de manopera pe judet, dintr-un API.
 *
 * Furnizorii nu vand manopera, deci nu exista pret de raft de citit. Ce se
 * poate citi e cat de scumpa e munca intr-un judet fata de media pe tara — din
 * statistica oficiala sau dintr-un serviciu care o impacheteaza.
 *
 * ------------------------------------------------------------------
 * CE TREBUIE SA INTOARCA API-UL
 * ------------------------------------------------------------------
 * `GET {MANOPERA_API_URL}` cu `Authorization: Bearer {cheia}`:
 *
 *   {
 *     "period": "2026-06-01",              // optional; lipsa = acum
 *     "national": 42.5,                     // optional, lei/ora la nivel national
 *     "counties": [
 *       { "county": "RO-B",  "index": 1.18 },
 *       { "county": "RO-CJ", "index": 1.04 },
 *       { "county": "RO-BT", "index": 0.87 }
 *     ]
 *   }
 *
 * `index` e raportul fata de media nationala: 1.0 = media. Alternativ, se poate
 * trimite `value` in lei/ora, si indicele se calculeaza fata de `national`.
 */

const judetSchema = z
  .object({
    county: z.string().min(1),
    index: z.number().positive().finite().optional(),
    value: z.number().positive().finite().optional(),
  })
  .refine((j) => j.index !== undefined || j.value !== undefined, {
    message: "fiecare judet are nevoie de `index` sau de `value`",
  });

const raspunsSchema = z.object({
  period: z.string().nullable().optional(),
  national: z.number().positive().finite().nullable().optional(),
  counties: z.array(judetSchema),
});

export interface LaborIndexObservation {
  countyCode: string;
  /** Raport fata de media nationala: 1.0 = media. */
  value: number;
  period: Date;
  sourceUrl: string | null;
}

export interface LaborSource {
  name: string;
  fetch(): Promise<LaborIndexObservation[]>;
}

export class LaborSourceError extends Error {}

export interface LaborSourceConfig {
  baseUrl: string;
  apiKey?: string | null;
  name?: string;
  fetchImpl?: typeof fetch;
}

export function createApiLaborSource(config: LaborSourceConfig): LaborSource {
  const { baseUrl, apiKey, name = "API manopera", fetchImpl = fetch } = config;

  return {
    name,
    async fetch(): Promise<LaborIndexObservation[]> {
      const raspuns = await fetchImpl(baseUrl, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      });

      if (!raspuns.ok) {
        throw new LaborSourceError(`${name} a raspuns ${raspuns.status}`);
      }

      const parsat = raspunsSchema.safeParse(await raspuns.json());
      if (!parsat.success) {
        throw new LaborSourceError(
          `${name} a intors un raspuns neasteptat: ` +
            parsat.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; "),
        );
      }

      const acum = new Date();
      const dataBruta = parsat.data.period ? new Date(parsat.data.period) : acum;
      const period = Number.isNaN(dataBruta.getTime()) ? acum : dataBruta;
      const national = parsat.data.national ?? null;

      const observatii: LaborIndexObservation[] = [];

      for (const j of parsat.data.counties) {
        const countyCode = j.county.trim().toUpperCase();
        // Un judet necunoscut se arunca, nu se salveaza pe alt cod: un indice
        // legat de o zona inexistenta ar ajusta preturi in dreptul nimanui.
        if (!isValidCountyCode(countyCode)) continue;

        // `index` bate `value`: e deja raportul cerut. Din `value` iese doar
        // daca stim media nationala fata de care sa-l raportam.
        const value =
          j.index ?? (national && national > 0 ? j.value! / national : null);
        if (value === null || !Number.isFinite(value) || value <= 0) continue;

        observatii.push({
          countyCode,
          value: Math.round(value * 10000) / 10000,
          period,
          sourceUrl: baseUrl,
        });
      }

      return observatii;
    },
  };
}

export function isLaborApiConfigured(): boolean {
  return Boolean(process.env.MANOPERA_API_URL?.trim());
}

export function laborApiFromEnv(fetchImpl?: typeof fetch): LaborSource | null {
  const baseUrl = process.env.MANOPERA_API_URL?.trim();
  if (!baseUrl) return null;

  return createApiLaborSource({
    baseUrl,
    apiKey: process.env.MANOPERA_API_KEY?.trim() || null,
    name: process.env.MANOPERA_API_NUME?.trim() || "API manopera",
    fetchImpl,
  });
}
