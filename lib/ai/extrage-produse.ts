import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { parse } from "node-html-parser";
import { z } from "zod";
import { type PriceObservation, parseNumar } from "@/lib/materials/import";
import {
  type ConfigSite,
  type SelectoareSite,
  absolut,
  dinSelectoare,
  unitateDinText,
} from "@/lib/materials/scraper/extract";
import { filtreazaPlauzibile } from "@/lib/materials/scraper/plauzibil";
import { AI_EXTRAGERE_EFFORT, AI_EXTRAGERE_MAX_TOKENS, AI_MODEL, getAiClient, isAiConfigured } from "./client";

/**
 * Cand nici un standard si nici un tipar nu prind, pagina o citeste modelul.
 *
 * De ce exista stratul asta: selectoarele scrise fara sa vezi pagina sunt o
 * presupunere, si raman o presupunere si la client. Un model care se uita la
 * pagina n-are nevoie sa stie dinainte cum se cheama clasele magazinului, si nu
 * se rupe la un redesign.
 *
 * Trei lucruri il tin onest si ieftin:
 *
 *  - **e ultimul strat.** Se cheama numai daca cele deterministe n-au dat nimic;
 *    un magazin care pune JSON-LD nu costa niciodata niciun token.
 *  - **ce spune se verifica in pagina.** Denumirea si cifra trebuie sa apara in
 *    textul adus. Un model care n-a gasit nimic poate completa din ce stie despre
 *    materiale, iar `MaterialPrice` creste si nu se rescrie: un pret inventat ar
 *    ramane in catalog pentru totdeauna.
 *  - **isi lasa in urma selectoarele.** Intoarce si prin ce le-a gasit, iar daca
 *    selectoarele acelea dau acelasi lucru pe aceeasi pagina, se salveaza. De la a
 *    doua cautare magazinul se citeste gratuit, cu selectoare scrise pe pagina
 *    reala. Adica un apel per magazin per redesign, nu per cautare.
 */

/** Peste atat pagina se taie: ~15k tokeni, cat trebuie pentru o lista de rezultate. */
const MAX_CARACTERE_IMPLICIT = 60_000;

const selectorSchema = z.string().trim().min(1).max(200);

const raspunsSchema = z.object({
  produse: z
    .array(
      z.object({
        denumire: z.string().trim().min(3).max(200),
        /** Sir, nu numar: pe pagina scrie "1.234,56", si asa il si verificam. */
        pret: z.string().trim().min(1).max(40),
        um: z.string().trim().max(20).optional(),
        url: z.string().trim().max(500).optional(),
      }),
    )
    .max(60),
  selectoare: z
    .object({
      card: selectorSchema,
      denumire: selectorSchema,
      pret: selectorSchema,
      pretVechi: selectorSchema.optional(),
      um: selectorSchema.optional(),
      link: selectorSchema.optional(),
    })
    .nullable()
    .optional(),
});

const SISTEM = `Esti un cititor de pagini de magazin. Primesti textul unei pagini de rezultate de la un magazin romanesc de materiale de constructii si intorci produsele din lista de rezultate.

Reguli:
- Scrie numai produse care sunt in pagina. Daca pagina nu are lista de produse, intoarce lista goala. Nu completa din ce stii despre materiale: fiecare cifra ajunge intr-un catalog de preturi.
- Pretul se copiaza exact cum e scris in pagina, cu tot cu separatoare ("1.234,56"). Daca produsul e redus, ia pretul curent, nu pe cel taiat.
- Nu lua din pagina: cosul, livrarea, filtrele, produsele recomandate din subsol, bannerele cu "de la X lei".
- Unitatea, daca e scrisa langa pret ("lei/mp"), altfel las-o goala.
- La "selectoare" scrie setul de selectoare CSS prin care ai gasit produsele in pagina asta, ca aplicatia sa le poata citi singura data viitoare. Daca nu esti sigur ca selectoarele prind exact cardurile de produs, scrie null.`;

export interface ExtragereAi {
  observatii: PriceObservation[];
  /** Selectoarele propuse, doar daca s-au verificat pe aceeasi pagina. */
  selectoare: SelectoareSite | null;
  folosire: { inputTokens: number; outputTokens: number; durataMs: number };
}

const GOL: ExtragereAi = {
  observatii: [],
  selectoare: null,
  folosire: { inputTokens: 0, outputTokens: 0, durataMs: 0 },
};

export function extragereAiActiva(): boolean {
  if (process.env.SCRAPER_AI?.trim().toLowerCase() === "false") return false;
  return isAiConfigured();
}

export async function extrageCuAi(
  html: string,
  config: ConfigSite,
  interogare: string,
  acum: Date,
  client?: Anthropic,
): Promise<ExtragereAi> {
  if (!client && !extragereAiActiva()) return GOL;

  const pagina = condenseaza(html);
  if (pagina.trim().length === 0) return GOL;

  const inceput = Date.now();
  const anthropic = client ?? getAiClient();

  const raspuns = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: AI_EXTRAGERE_MAX_TOKENS,
    output_config: {
      effort: AI_EXTRAGERE_EFFORT,
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["produse"],
          properties: {
            produse: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["denumire", "pret"],
                properties: {
                  denumire: { type: "string" },
                  pret: { type: "string" },
                  um: { type: "string" },
                  url: { type: "string" },
                },
              },
            },
            selectoare: {
              type: ["object", "null"],
              additionalProperties: false,
              required: ["card", "denumire", "pret"],
              properties: {
                card: { type: "string" },
                denumire: { type: "string" },
                pret: { type: "string" },
                pretVechi: { type: "string" },
                um: { type: "string" },
                link: { type: "string" },
              },
            },
          },
        },
      },
    },
    // Un singur breakpoint, ca la generatorul de deviz: sistemul se cacheaza,
    // pagina vine dupa, in mesaj, deci nu invalideaza nimic.
    system: [{ type: "text", text: SISTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Magazin: ${config.nume}\nCautarea omului: ${interogare}\n\n# Pagina\n\n${pagina}`,
      },
    ],
  });

  const folosire = {
    inputTokens: raspuns.usage.input_tokens,
    outputTokens: raspuns.usage.output_tokens,
    durataMs: Date.now() - inceput,
  };

  const text = raspuns.content.find((b) => b.type === "text")?.text ?? "";
  let citit: z.infer<typeof raspunsSchema>;
  try {
    citit = raspunsSchema.parse(JSON.parse(text));
  } catch {
    // Ce nu trece de zod nu produce observatie, ca peste tot in aplicatie.
    return { ...GOL, folosire };
  }

  const brute: PriceObservation[] = [];
  for (const p of citit.produse) {
    const pret = parseNumar(p.pret.split("/")[0]);
    if (pret === null) continue;

    brute.push({
      name: p.denumire,
      unit: unitateDinText(p.um ?? p.pret),
      price: pret,
      countyCode: null,
      observedAt: acum,
      supplier: config.nume,
      sourceUrl: absolut(config.baseUrl, p.url ?? null),
    });
  }

  // `textPagina` e ce s-a trimis modelului: verificarea intreaba daca denumirea si
  // cifra chiar sunt acolo, nu daca modelul crede ca sunt.
  const observatii = filtreazaPlauzibile(brute, { textPagina: pagina, interogare });

  return {
    observatii,
    selectoare: selectoareVerificate(citit.selectoare ?? null, html, config, acum, observatii),
    folosire,
  };
}

/**
 * Selectoarele se pastreaza numai daca dau acelasi lucru pe aceeasi pagina.
 *
 * Un selector care nu se verifica ar fi tot o presupunere — exact ce am incercat
 * sa scoatem din cod — si ar sta apoi in baza, cu aerul unui fapt.
 */
function selectoareVerificate(
  propuse: SelectoareSite | null | undefined,
  html: string,
  config: ConfigSite,
  acum: Date,
  observatii: PriceObservation[],
): SelectoareSite | null {
  if (!propuse || observatii.length === 0) return null;

  const cuEle = filtreazaPlauzibile(
    dinSelectoare(html, { ...config, selectoare: propuse }, acum),
    { interogare: "" },
  );

  // Nu se cere identitate perfecta: modelul poate citi si produse pe care
  // selectorul le rateaza. Se cere sa prinda majoritatea si sa nu inventeze.
  const nume = new Set(cuEle.map((o) => o.name));
  const comune = observatii.filter((o) => nume.has(o.name)).length;

  return comune >= Math.ceil(observatii.length / 2) ? propuse : null;
}

/**
 * Pagina, redusa la ce se citeste din ea.
 *
 * Se arunca ce n-are cum sa contina un pret afisat — scripturi, stiluri, desene —
 * si raman textul, legaturile si `alt`-urile. Fara asta, o pagina de magazin de
 * doua megaocteti ar fi in cea mai mare parte cod trimis degeaba.
 */
export function condenseaza(html: string, maxCaractere = maxDinMediu()): string {
  const document = parse(html, { blockTextElements: { script: false, style: false, noscript: false } });

  for (const nod of document.querySelectorAll("script, style, noscript, svg, iframe, template")) {
    nod.remove();
  }

  const bucati: string[] = [];
  for (const nod of document.querySelectorAll("a, img, [class], [id], p, span, div, li")) {
    const propriu = nod.childNodes
      .filter((c) => c.nodeType === 3)
      .map((c) => c.rawText)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    const alt = nod.getAttribute("alt")?.trim();
    const href = nod.getAttribute("href")?.trim();

    if (propriu) bucati.push(propriu);
    else if (alt) bucati.push(alt);
    if (href && propriu) bucati.push(`-> ${href}`);
  }

  const text = bucati.join("\n");
  if (text.length <= maxCaractere) return text;

  // Se taie la o granita de linie, nu in mijlocul unui pret, si se spune cat s-a
  // lasat afara — o trunchiere tacuta ar arata pe ecran ca o pagina fara produse.
  const taiat = text.slice(0, maxCaractere);
  const capat = taiat.lastIndexOf("\n");
  console.warn(
    `[furnizor] pagina taiata la ${maxCaractere} caractere din ${text.length}`,
  );
  return capat > 0 ? taiat.slice(0, capat) : taiat;
}

function maxDinMediu(): number {
  const din = Number(process.env.SCRAPER_AI_MAX_CARACTERE);
  return Number.isFinite(din) && din > 0 ? din : MAX_CARACTERE_IMPLICIT;
}
