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

/**
 * Linia are patru preturi unitare, ca articolul dintr-un deviz romanesc:
 * material, manopera, utilaj, transport.
 *
 * Materialul si manopera sint obligatorii — orice lucrare are macar una dintre
 * ele, si un 0 explicit e informatie (o demolare n-are material). Utilajul si
 * transportul lipsesc de pe majoritatea liniilor, deci sint optionale si intra
 * cu 0: a cere modelului sa scrie doua zerouri pe fiecare linie ar umple
 * raspunsul cu zgomot fara sa adauge nimic.
 */
export const lineSchema = z.object({
  ...baseLineShape,
  pret_material: z.number().nonnegative().finite(),
  pret_manopera: z.number().nonnegative().finite(),
  pret_utilaj: z.number().nonnegative().finite().optional().default(0),
  pret_transport: z.number().nonnegative().finite().optional().default(0),
});

export const addLinesSchema = z.object({
  sectiune: z.string().min(1),
  linii: z.array(lineSchema).min(1),
});

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
  proposeSteps: "propune_pasi",
  clarify: "cere_clarificare",
} as const;

/**
 * Pasii pe care omul nu i-a spus, dar care fac parte din lucrare.
 *
 * Nu intra in deviz. Din devizul asta iese o factura, iar un pas dedus gresit
 * ar fi munca facturata si neexecutata — de aceea propunerile ies pe alt canal
 * decat liniile si asteapta bifa omului.
 *
 * Cantitatea e optionala anume: la "am schimbat gresia" stii ca s-a demolat
 * pardoseala veche, dar nu si cita. Mai bine o propunere fara cifra, pe care
 * omul o completeaza, decat una inventata care pare masurata.
 */
const stepShape = {
  cod_norma: z.string().trim().min(4).max(12).optional(),
  denumire: z.string().min(3).max(300),
  um: z.string().min(1).max(16),
  cantitate: z.number().nonnegative().optional(),
  motiv: z.string().min(1).max(400),
};

export const proposeStepsSchema = z.object({
  pasi: z.array(z.object(stepShape)).min(1).max(20),
});

const proposeStepsTool: Anthropic.Tool = {
  name: TOOL_NAMES.proposeSteps,
  description:
    "Propune pasii care fac parte din lucrare dar pe care omul nu i-a spus. NU intra in deviz: " +
    "omul ii vede intr-o caseta separata, in ordinea executiei, si bifeaza ce s-a facut. " +
    "Foloseste-l pentru tot ce deduci — la 'am schimbat gresia': demontarea pardoselii vechi, " +
    "pregatirea stratului suport, chituirea rosturilor, transportul molozului. " +
    "In 'adauga_linii_deviz' pui doar ce a spus omul explicit. Apeleaza-l o singura data, " +
    "cu toti pasii, in ordine cronologica: intii pregatirea, apoi executia, la urma finisarea " +
    "si curatenia.",
  input_schema: {
    type: "object",
    properties: {
      pasi: {
        type: "array",
        description: "Pasii, in ordinea in care se executa pe santier.",
        items: {
          type: "object",
          properties: {
            cod_norma: {
              type: "string",
              description:
                "Codul din indicator, daca ai cautat si ai gasit norma potrivita. Optional.",
            },
            denumire: {
              type: "string",
              description: "Ce se executa la pasul asta, ca intr-un deviz.",
            },
            um: {
              type: "string",
              description: "Unitatea de masura: mp, mc, ml, buc, kg, ora.",
            },
            cantitate: {
              type: "number",
              description:
                "Cantitatea, DOAR daca rezulta din ce a spus omul (gresie pe 6 mp -> " +
                "demolare 6 mp). Daca nu ai de unde s-o stii, las-o goala: omul o completeaza. " +
                "Nu inventa cifre.",
            },
            motiv: {
              type: "string",
              description:
                "De ce face parte din lucrare, in cuvinte simple. " +
                "Ex: 'gresia noua nu se monteaza peste cea veche'.",
            },
          },
          required: ["denumire", "um", "motiv"],
        },
      },
    },
    required: ["pasi"],
  },
};

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
 * Unealta de adaugare a liniilor.
 *
 * E o constanta, nu se construieste per cerere, deci ramane in prefixul care se
 * citeste din cache la generarile urmatoare.
 */
const addLinesTool: Anthropic.Tool = {
  name: TOOL_NAMES.addLines,
  description:
    "Adauga linii in deviz, grupate intr-o sectiune (stadiu fizic). Apeleaza-l de mai multe ori, " +
    "cate o data pentru fiecare sectiune, pe masura ce parcurgi lucrarea. Fiecare linie care are " +
    "norma in indicator poarta codul ei, gasit intai cu 'cauta_norma'. Pretul unei linii se scrie " +
    "defalcat pe patru componente: material, manopera, utilaj si transport.",
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
            pret_utilaj: {
              type: "number",
              description:
                "Costul utilajului imputat unei unitati de masura, in lei fara TVA: chiria si " +
                "ora de functionare a excavatorului, macaralei, maiului compactor, betonierei, " +
                "schelei inchiriate. Lasa-l gol la lucrarile executate manual — majoritatea.",
            },
            pret_transport: {
              type: "number",
              description:
                "Costul transportului imputat unei unitati de masura, in lei fara TVA: aducerea " +
                "materialului la santier si evacuarea molozului, cand se factureaza separat, nu " +
                "cand e deja inclus in pretul materialului. Lasa-l gol daca nu e cazul.",
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
};

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

export const estimateTools: Anthropic.Tool[] = [
  searchNormTool,
  addLinesTool,
  proposeStepsTool,
  clarifyTool,
];
