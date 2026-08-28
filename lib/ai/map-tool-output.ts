import {
  TOOL_NAMES,
  addLinesSchema,
  clarificationInputSchema,
  proposeStepsSchema,
} from "./tools";
import { round4 } from "@/lib/money";
import { getNorma } from "@/lib/norme";
import { computeEstimateLine } from "@/lib/pricing/calculator";

/**
 * Traducerea apelurilor de unealta in liniile de deviz.
 *
 * Modul pur, fara acces la baza de date sau la retea: aici se decide ce ajunge
 * in fata omului, deci merita testat direct. Bucla agentica din
 * `generate-estimate.ts` doar il alimenteaza cu ce a intors modelul.
 */

export interface GeneratedLine {
  section: string;
  /** Codul din indicatoare (C, RpC sau Ts), cand lucrarea are norma potrivita. */
  code: string | null;
  /**
   * Normele intre care descrierea nu departajeaza, inclusiv cea aleasa, ca sa
   * poata comuta omul linia din editor. Doar coduri care exista in indicator.
   */
  alternativeCodes: string[];
  name: string;
  unit: string;
  quantity: number;
  materialUnitPrice: number;
  laborUnitPrice: number;
  equipmentUnitPrice: number;
  transportUnitPrice: number;
  unitPrice: number;
  total: number;
  justification: string;
  confidence: "MARE" | "MEDIE" | "MICA";
}

/**
 * Un pas dedus, propus omului. Nu e linie de deviz si nu devine una pina nu-l
 * bifeaza cineva — vezi `propune_pasi` din tools.ts.
 */
export interface ProposedStep {
  code: string | null;
  name: string;
  unit: string;
  /** null cind nu rezulta din ce a spus omul: o completeaza el. */
  quantity: number | null;
  reason: string;
}

export type MappedEvent =
  | { type: "section"; name: string }
  | { type: "line"; line: GeneratedLine }
  | { type: "steps"; steps: ProposedStep[] }
  | { type: "question"; question: string };

const CONFIDENCE_MAP = {
  mare: "MARE",
  medie: "MEDIE",
  mica: "MICA",
} as const;

/**
 * Un apel de unealta -> evenimentele pe care le vede interfata.
 *
 * Intoarce lista goala pentru orice apel pe care nu-l putem interpreta:
 * modelul primeste separat, prin `tool_result`, explicatia a ce a gresit.
 */
export function mapToolCall(toolName: string, input: unknown): MappedEvent[] {
  if (toolName === TOOL_NAMES.addLines) {
    const parsed = addLinesSchema.safeParse(input);
    if (!parsed.success) return [];

    const events: MappedEvent[] = [{ type: "section", name: parsed.data.sectiune }];

    for (const line of parsed.data.linii) {
      const materialUnitPrice = round4(line.pret_material);
      const laborUnitPrice = round4(line.pret_manopera);
      const equipmentUnitPrice = round4(line.pret_utilaj);
      const transportUnitPrice = round4(line.pret_transport);

      const totals = computeEstimateLine({
        quantity: line.cantitate,
        materialUnitPrice,
        laborUnitPrice,
        equipmentUnitPrice,
        transportUnitPrice,
      });

      // Cand codul exista in indicator, denumirea si unitatea vin de acolo:
      // o linie care poarta un cod oficial trebuie sa spuna ce spune norma.
      // Un cod inventat nu se lipeste de linie — ramane lucrarea scrisa liber.
      const norma = line.cod_norma ? getNorma(line.cod_norma) : null;

      events.push({
        type: "line",
        line: {
          section: parsed.data.sectiune,
          code: norma?.cod ?? null,
          alternativeCodes: resolveAlternatives(line.coduri_alternative, norma?.cod),
          name: norma?.denumire ?? line.denumire,
          unit: norma?.um ?? line.um,
          quantity: round4(line.cantitate),
          materialUnitPrice,
          laborUnitPrice,
          equipmentUnitPrice,
          transportUnitPrice,
          unitPrice: totals.unitPrice,
          total: totals.total,
          justification: line.justificare,
          confidence: CONFIDENCE_MAP[line.incredere],
        },
      });
    }

    return events;
  }

  if (toolName === TOOL_NAMES.proposeSteps) {
    const parsed = proposeStepsSchema.safeParse(input);
    if (!parsed.success) return [];

    const steps = parsed.data.pasi.map((pas) => {
      // Acelasi tratament ca la linii: codul care nu exista in indicator se
      // arunca, iar denumirea si unitatea vin din norma cind codul e bun. Un
      // cod oficial fals e citit de beneficiar ca un angajament.
      const norma = pas.cod_norma ? getNorma(pas.cod_norma) : null;

      return {
        code: norma?.cod ?? null,
        name: norma?.denumire ?? pas.denumire,
        unit: norma?.um ?? pas.um,
        quantity: pas.cantitate === undefined ? null : round4(pas.cantitate),
        reason: pas.motiv,
      };
    });

    return [{ type: "steps", steps }];
  }

  if (toolName === TOOL_NAMES.clarify) {
    const parsed = clarificationInputSchema.safeParse(input);
    if (!parsed.success) return [];
    return [{ type: "question", question: parsed.data.intrebare }];
  }

  return [];
}

/**
 * Variantele propuse, curatate.
 *
 * Lista contine si codul ales, pe prima pozitie: altfel, dupa ce omul comuta pe
 * alta norma, nu ar mai avea cum sa revina la cea de la care a plecat.
 *
 * Aceeasi regula ca la codul liniei: un cod care nu exista in indicator se
 * arunca, ca sa nu ajunga in fata omului un cod oficial inventat. O singura
 * varianta ramasa nu e o alegere, deci nu se afiseaza deloc.
 */
function resolveAlternatives(
  coduri: string[] | undefined,
  chosen: string | undefined,
): string[] {
  if (!coduri || coduri.length === 0) return [];

  const found = new Set<string>();
  if (chosen) found.add(chosen);
  for (const cod of coduri) {
    const norma = getNorma(cod);
    if (norma) found.add(norma.cod);
  }

  return found.size > 1 ? [...found] : [];
}

/**
 * Codurile de norma pe care modelul le-a trimis si care nu exista in indicator.
 *
 * Liniile lor au intrat oricum, ca lucrari scrise liber — o denumire buna fara
 * cod e mai utila decat nimic — dar modelul afla prin `tool_result` care coduri
 * a inventat, ca sa le caute corect.
 */
export function unknownNormCodes(input: unknown): string[] {
  const parsed = addLinesSchema.safeParse(input);
  if (!parsed.success) return [];

  return parsed.data.linii
    .map((line) => line.cod_norma)
    .filter((cod): cod is string => Boolean(cod) && !getNorma(cod as string));
}

/**
 * Liniile pe care modelul le-a trimis fara pret.
 *
 * Nu sunt o eroare — o lucrare pentru care nu are niciun reper de piata e mai
 * bine trimisa cu 0 decat cu o cifra inventata — dar modelul afla prin
 * `tool_result` cate au ramas asa, ca sa le poata completa daca poate.
 */
export function pricelessLines(input: unknown): string[] {
  const parsed = addLinesSchema.safeParse(input);
  if (!parsed.success) return [];

  return parsed.data.linii
    .filter(
      (line) =>
        line.pret_material === 0 &&
        line.pret_manopera === 0 &&
        line.pret_utilaj === 0 &&
        line.pret_transport === 0,
    )
    .map((line) => line.denumire);
}
