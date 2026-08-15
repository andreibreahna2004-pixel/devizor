import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * Uneltele pe care le are AI-ul la dispozitie cand construieste un deviz.
 *
 * Trei reguli au modelat setul:
 *
 *  1. Lucrarea se numeste ca in indicatoarele de norme de deviz. Modelul cauta
 *     norma cu `cauta_norma` si trimite codul ei; denumirea vine atunci din
 *     indicator, nu din ce a scris modelul. Unitatea la fel, cind sursa o are:
 *     la Ts si RpC lipseste si ramine cea trimisa de model.
 *  2. Pretul propus de model e o estimare de piata, nu o oferta. Fiecare linie
 *     poarta un nivel de incredere si intra in editor nemarcata ca verificata,
 *     ca omul sa treaca prin ea inainte de a trimite ceva unui beneficiar.
 *  3. AI-ul are voie sa nu stie. `cere_clarificare` exista ca sa poata intreba
 *     "fundatie continua sau radier?" in loc sa ghiceasca.
 */

const CONFIDENCE = ["mare", "medie", "mica"] as const;

export type EstimateMode = "COMBINAT" | "SEPARAT";

// --- schemele cu care validam ce intoarce modelul ---------------------------

const baseLineShape = {
  /** Codul din indicatoare (C, RpC sau Ts), cand lucrarea are norma potrivita. */
  cod_norma: z.string().trim().min(4).max(12).optional(),
  /**
   * Celelalte norme intre care descrierea nu departajeaza. Nu opresc nimic:
   * linia intra cu cea aleasa, iar omul comuta din editor daca a nimerit alta.
   */
  coduri_alternative: z.array(z.string().trim().min(4).max(12)).max(3).optional(),
  denumire: z.string().min(3),
  um: z.string().min(1),
  cantitate: z.number().positive().finite(),
  justificare: z.string().min(1),
  incredere: z.enum(CONFIDENCE),
};

export const combinedLineSchema = z.object({
  ...baseLineShape,
  pret_unitar: z.number().nonnegative().finite(),
});

export const splitLineSchema = z.object({
  ...baseLineShape,
  pret_material: z.number().nonnegative().finite(),
  pret_manopera: z.number().nonnegative().finite(),
});

export const combinedAddLinesSchema = z.object({
  sectiune: z.string().min(1),
  linii: z.array(combinedLineSchema).min(1),
});

export const splitAddLinesSchema = z.object({
  sectiune: z.string().min(1),
  linii: z.array(splitLineSchema).min(1),
});

export function addLinesSchemaFor(mode: EstimateMode) {
  return mode === "SEPARAT" ? splitAddLinesSchema : combinedAddLinesSchema;
}

export const clarificationInputSchema = z.object({
  intrebare: z.string().min(1),
});

export const searchInputSchema = z.object({
  interogare: z.string().min(2),
});

export type ClarificationInput = z.infer<typeof clarificationInputSchema>;
export type SearchInput = z.infer<typeof searchInputSchema>;

export const TOOL_NAMES = {
  searchNorm: "cauta_norma",
  addLines: "adauga_linii_deviz",
  clarify: "cere_clarificare",
} as const;

const SECTION_DESCRIPTION =
  "Stadiul fizic: 'Terasamente', 'Infrastructura', 'Suprastructura', 'Invelitoare', " +
  "'Inchideri si compartimentari', 'Termoizolatii si fatade', 'Instalatii sanitare', " +
  "'Instalatii electrice', 'Instalatii termice', 'Finisaje interioare', 'Tamplarie', " +
  "'Organizare de santier'.";

const JUSTIFICATION_DESCRIPTION =
  "Cum ai obtinut cantitatea, cu cifrele folosite. Ex: 'perimetru 46 ml x " +
  "h 2,80 m = 128,8 mp, minus goluri 18 mp = 110,8 mp'. Beneficiarul citeste " +
  "acest text ca sa verifice devizul, deci scrie calculul, nu o descriere vaga.";

const CONFIDENCE_DESCRIPTION =
  "'mare' = cantitatea rezulta direct din datele primite. " +
  "'medie' = ai folosit o ipoteza rezonabila de proiectare. " +
  "'mica' = ai estimat, omul trebuie sa verifice obligatoriu.";

const baseLineProperties = {
  cod_norma: {
    type: "string",
    description:
      "Codul normei, exact cum l-a intors 'cauta_norma' (ex. 'CA02C1' din indicatorul C, " +
      "'TS A 03' din terasamente, 'RPCJ12A1' din reparatii). Cand il trimiti, denumirea se ia " +
      "din indicator, nu de la tine — la fel si unitatea, daca norma o are. " +
      "Lasa-l gol doar pentru lucrarile care nu au norma potrivita in indicatoare.",
  },
  coduri_alternative: {
    type: "array",
    items: { type: "string" },
    description:
      "Celelalte coduri intoarse de 'cauta_norma' care s-ar potrivi aceleiasi lucrari, cand " +
      "descrierea nu spune care e. Le trimiti doar cand inseamna altceva executat " +
      "(beton simplu fata de beton armat, sapatura manuala fata de mecanica) — nu si cand " +
      "difera doar prin marime sau conditii, unde alegi tu si nu trimiti nimic aici. " +
      "Maximum 3. Omul le vede in editor si comuta linia cu un click, deci nu intreba.",
  },
  denumire: {
    type: "string",
    description:
      "Denumirea lucrarii, asa cum ar aparea intr-un deviz: ce se executa, din ce " +
      "material si cu ce grosime/dimensiune. Ex: 'Zidarie din BCA de 30 cm cu adeziv'. " +
      "Cand trimiti si 'cod_norma', scrie tot denumirea — se foloseste daca codul e gresit.",
  },
  um: {
    type: "string",
    description: "Unitatea de masura: mc, mp, ml, buc, kg, to, ora.",
  },
  cantitate: {
    type: "number",
    description: "Cantitatea, in unitatea de masura a liniei. Numar pozitiv.",
  },
  justificare: { type: "string", description: JUSTIFICATION_DESCRIPTION },
  incredere: {
    type: "string",
    enum: [...CONFIDENCE],
    description: CONFIDENCE_DESCRIPTION,
  },
} as const;

/**
 * Uneltele pentru un deviz cu un singur pret pe linie.
 *
 * Sunt constante per mod, deci raman in prefixul care se citeste din cache la
 * generarile urmatoare.
 */
const combinedTools: Anthropic.Tool[] = [
  {
    name: TOOL_NAMES.addLines,
    description:
      "Adauga linii in deviz, grupate intr-o sectiune (stadiu fizic). Apeleaza-l de mai multe ori, " +
      "cate o data pentru fiecare sectiune, pe masura ce parcurgi lucrarea. Fiecare linie care are " +
      "norma in indicator poarta codul ei, gasit intai cu 'cauta_norma'.Fiecare linie poarta " +
      "un pret unitar orientativ, cu materialul si manopera la un loc; omul il corecteaza in editor.",
    input_schema: {
      type: "object",
      properties: {
        sectiune: { type: "string", description: SECTION_DESCRIPTION },
        linii: {
          type: "array",
          description: "Liniile de adaugat in aceasta sectiune.",
          items: {
            type: "object",
            properties: {
              ...baseLineProperties,
              pret_unitar: {
                type: "number",
                description:
                  "Pret unitar orientativ in lei, fara TVA, cu materialul si manopera incluse, " +
                  "la nivelul de piata al judetului. Daca nu ai un reper rezonabil, trimite 0 " +
                  "si scrie in justificare de ce.",
              },
            },
            required: [
              "denumire",
              "um",
              "cantitate",
              "pret_unitar",
              "justificare",
              "incredere",
            ],
          },
        },
      },
      required: ["sectiune", "linii"],
    },
  },
];

/** Uneltele pentru un deviz cu materialele si manopera pe coloane separate. */
const splitTools: Anthropic.Tool[] = [
  {
    name: TOOL_NAMES.addLines,
    description:
      "Adauga linii in deviz, grupate intr-o sectiune (stadiu fizic). Apeleaza-l de mai multe ori, " +
      "cate o data pentru fiecare sectiune, pe masura ce parcurgi lucrarea. Fiecare linie care are " +
      "norma in indicator poarta codul ei, gasit intai cu 'cauta_norma'.Devizul se intocmeste " +
      "cu materialele si manopera separate, deci fiecare linie are doua preturi unitare.",
    input_schema: {
      type: "object",
      properties: {
        sectiune: { type: "string", description: SECTION_DESCRIPTION },
        linii: {
          type: "array",
          description: "Liniile de adaugat in aceasta sectiune.",
          items: {
            type: "object",
            properties: {
              ...baseLineProperties,
              pret_material: {
                type: "number",
                description:
                  "Costul orientativ al materialelor pe unitatea de masura, in lei fara TVA. " +
                  "0 pentru lucrarile pur de manopera (demolari, sapaturi manuale, montaj).",
              },
              pret_manopera: {
                type: "number",
                description:
                  "Costul orientativ al manoperei pe unitatea de masura, in lei fara TVA. " +
                  "0 pentru liniile care sunt doar furnizare de material.",
              },
            },
            required: [
              "denumire",
              "um",
              "cantitate",
              "pret_material",
              "pret_manopera",
              "justificare",
              "incredere",
            ],
          },
        },
      },
      required: ["sectiune", "linii"],
    },
  },
];

const searchNormTool: Anthropic.Tool = {
  name: TOOL_NAMES.searchNorm,
  description:
    "Cauta lucrari in indicatoarele de norme de deviz C (constructii), RpC (reparatii) si " +
    "Ts (terasamente) dupa cuvinte cheie ('tencuieli interioare manual', 'zidarie caramida', " +
    "'sapatura manuala pamint'). Intoarce codul, denumirea oficiala si unitatea de masura — la " +
    "Ts si RpC unitatea lipseste din sursa si o alegi tu. Cauta inainte de a adauga linii, ca " +
    "devizul sa poarte codurile oficiale.",
  input_schema: {
    type: "object",
    properties: {
      interogare: {
        type: "string",
        description:
          "Cuvinte cheie separate prin spatiu. Toate trebuie sa se regaseasca in norma, " +
          "deci foloseste 2-4 cuvinte relevante, fara diacritice. Indicatoarele sint scrise in " +
          "limbajul anilor '80: 'timplarie', nu 'tamplarie PVC'; 'zugraveli', nu 'vopsit'.",
      },
    },
    required: ["interogare"],
  },
};

const clarifyTool: Anthropic.Tool = {
  name: TOOL_NAMES.clarify,
  description:
    "Pune o intrebare omului cand un detaliu lipsa schimba semnificativ devizul (peste ~10% din " +
    "valoare) si nu poate fi acoperit printr-o ipoteza rezonabila. Opreste generarea pana la " +
    "raspuns, deci foloseste-l doar cand chiar conteaza. Pentru detalii minore, alege o ipoteza, " +
    "scrie-o in justificare si continua.",
  input_schema: {
    type: "object",
    properties: {
      intrebare: {
        type: "string",
        description:
          "Intrebarea, scurta si concreta, cu variantele posibile. " +
          "Ex: 'Fundatia e continua din beton armat sau radier general? " +
          "Diferenta e de circa 15% din valoarea structurii.'",
      },
    },
    required: ["intrebare"],
  },
};

export function estimateToolsFor(mode: EstimateMode): Anthropic.Tool[] {
  return [
    searchNormTool,
    ...(mode === "SEPARAT" ? splitTools : combinedTools),
    clarifyTool,
  ];
}
