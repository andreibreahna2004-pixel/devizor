import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { AI_EFFORT, AI_MAX_TOKENS, AI_MODEL, getAiClient } from "./client";
import { type EstimateBrief, buildBriefMessage, buildSystemBlocks } from "./prompts";
import {
  type GeneratedLine,
  type ProposedStep,
  mapToolCall,
  pricelessLines,
  unknownNormCodes,
} from "./map-tool-output";
import {
  TOOL_NAMES,
  addLinesSchema,
  estimateTools,
  proposeStepsSchema,
  searchInputSchema,
} from "./tools";
import { searchNorme } from "@/lib/norme";

/**
 * Bucla agentica prin care AI-ul construieste devizul.
 *
 * E scrisa manual, nu cu tool runner-ul din SDK, pentru ca fiecare apel de
 * unealta trebuie transformat imediat in evenimente pentru interfata: liniile
 * apar in editor pe masura ce modelul le produce, nu la finalul turei. Cu
 * acumularea manuala a `input_json_delta` putem emite o sectiune in clipa in
 * care modelul a terminat de scris acel apel, inainte ca tura sa se incheie.
 *
 * Nimic din ce iese de aici nu se salveaza singur. Rezultatul e o propunere pe
 * care omul o verifica in editor, preturi cu tot.
 */

export type GenerationEvent =
  | { type: "status"; message: string }
  | { type: "section"; name: string }
  | { type: "line"; line: GeneratedLine }
  /** Pasi dedusi, propusi omului. Nu sint linii si nu se salveaza. */
  | { type: "steps"; steps: ProposedStep[] }
  | { type: "question"; question: string }
  | { type: "summary"; text: string }
  | { type: "usage"; usage: GenerationUsage }
  | { type: "error"; message: string };

export type { GeneratedLine, ProposedStep };

export interface GenerationUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  linesProposed: number;
  durationMs: number;
}

/** Oprire de siguranta: fara ea, o bucla care se incapataneaza ar rula la nesfarsit. */
const MAX_TURNS = 24;

interface PendingToolCall {
  id: string;
  name: string;
  input: unknown;
}

export async function* generateEstimate(
  orgName: string,
  brief: EstimateBrief,
): AsyncGenerator<GenerationEvent> {
  const startedAt = Date.now();
  const client = getAiClient();

  const tools = estimateTools;
  const systemBlocks = buildSystemBlocks(orgName, brief.incremental);

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildBriefMessage(brief) },
  ];

  const usage: GenerationUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    linesProposed: 0,
    durationMs: 0,
  };

  yield { type: "status", message: "AI-ul analizeaza lucrarea..." };

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const stream = client.messages.stream({
      model: AI_MODEL,
      max_tokens: AI_MAX_TOKENS,
      thinking: { type: "adaptive" },
      output_config: { effort: AI_EFFORT },
      system: systemBlocks,
      tools,
      messages,
    });

    // Acumulam JSON-ul fiecarui apel de unealta pe masura ce vine, ca sa putem
    // emite liniile imediat ce un apel s-a inchis.
    const partialJson = new Map<number, string>();
    const blockMeta = new Map<number, { id: string; name: string }>();
    const emitted = new Set<number>();
    const pending: PendingToolCall[] = [];
    let stopEarly: "question" | null = null;

    for await (const event of stream) {
      if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          blockMeta.set(event.index, {
            id: event.content_block.id,
            name: event.content_block.name,
          });
          partialJson.set(event.index, "");
        }
        continue;
      }

      if (event.type === "content_block_delta") {
        if (event.delta.type === "input_json_delta") {
          partialJson.set(
            event.index,
            (partialJson.get(event.index) ?? "") + event.delta.partial_json,
          );
        }
        continue;
      }

      if (event.type !== "content_block_stop") continue;

      const meta = blockMeta.get(event.index);
      if (!meta || emitted.has(event.index)) continue;
      emitted.add(event.index);

      const raw = partialJson.get(event.index) ?? "";
      let input: unknown;
      try {
        // Un apel fara argumente trimite string gol, nu "{}".
        input = raw.trim() === "" ? {} : JSON.parse(raw);
      } catch {
        yield {
          type: "error",
          message: `AI-ul a trimis un apel de unealta invalid (${meta.name}). Incearca din nou.`,
        };
        return;
      }

      pending.push({ id: meta.id, name: meta.name, input });

      // Emitem catre interfata acum, inainte sa se incheie tura.
      for (const uiEvent of mapToolCall(meta.name, input)) {
        if (uiEvent.type === "line") usage.linesProposed += 1;
        if (uiEvent.type === "question") stopEarly = "question";
        yield uiEvent;
      }
    }

    const message = await stream.finalMessage();

    usage.inputTokens += message.usage.input_tokens ?? 0;
    usage.outputTokens += message.usage.output_tokens ?? 0;
    usage.cacheReadTokens += message.usage.cache_read_input_tokens ?? 0;
    usage.cacheWriteTokens += message.usage.cache_creation_input_tokens ?? 0;

    // Refuzul vine ca raspuns valid, nu ca eroare — se verifica inainte de continut.
    if (message.stop_reason === "refusal") {
      yield {
        type: "error",
        message:
          "AI-ul a refuzat cererea. Reformuleaza descrierea lucrarii si incearca din nou.",
      };
      usage.durationMs = Date.now() - startedAt;
      yield { type: "usage", usage };
      return;
    }

    if (message.stop_reason === "max_tokens") {
      yield {
        type: "error",
        message:
          "Raspunsul a fost prea lung si s-a oprit. Imparte lucrarea in mai multe devize sau descrie-o mai concis.",
      };
      usage.durationMs = Date.now() - startedAt;
      yield { type: "usage", usage };
      return;
    }

    messages.push({ role: "assistant", content: message.content });

    if (stopEarly === "question") {
      // Intrebarea a fost deja emisa; asteptam raspunsul omului.
      usage.durationMs = Date.now() - startedAt;
      yield { type: "usage", usage };
      return;
    }

    if (message.stop_reason !== "tool_use") {
      const summary = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text.trim())
        .filter(Boolean)
        .join("\n\n");

      if (summary) yield { type: "summary", text: summary };

      usage.durationMs = Date.now() - startedAt;
      yield { type: "usage", usage };
      return;
    }

    // Raspundem la fiecare apel — toate rezultatele intr-un singur mesaj user.
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of pending) {
      results.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: runTool(call),
      });
    }

    if (results.length === 0) {
      yield {
        type: "error",
        message: "AI-ul s-a oprit fara sa produca linii. Incearca din nou.",
      };
      usage.durationMs = Date.now() - startedAt;
      yield { type: "usage", usage };
      return;
    }

    messages.push({ role: "user", content: results });
  }

  yield {
    type: "error",
    message:
      "Generarea a atins limita de pasi fara sa se incheie. Liniile produse pana acum sunt in editor.",
  };
  usage.durationMs = Date.now() - startedAt;
  yield { type: "usage", usage };
}

/** Textul pe care il vede modelul ca rezultat al apelului. */
function runTool(call: PendingToolCall): string {
  if (call.name === TOOL_NAMES.searchNorm) {
    const parsed = searchInputSchema.safeParse(call.input);
    if (!parsed.success) return "Interogare invalida. Trimite cel putin doua caractere.";

    const found = searchNorme(parsed.data.interogare, 25);
    if (found.length === 0) {
      return (
        `Nicio norma pentru "${parsed.data.interogare}". Incearca alte cuvinte, mai ` +
        `putine sau in limbajul indicatorului. Daca lucrarea chiar nu are norma ` +
        `(termosistem, tamplarie PVC, centrale termice), adaug-o fara cod_norma.`
      );
    }

    // Normele din Ts nu au unitate in sursa: acolo o alege modelul si o scrie
    // el in `um`, ca la lucrarile fara norma.
    return found
      .map((n) => `${n.cod} | ${n.denumire} | ${n.um ?? "U.M. o alegi tu"}`)
      .join("\n");
  }

  if (call.name === TOOL_NAMES.addLines) {
    const parsed = addLinesSchema.safeParse(call.input);
    if (!parsed.success) {
      return `Argumente invalide, niciuna dintre linii nu a intrat: ${parsed.error.issues
        .map((i) => `${i.path.join(".")} ${i.message}`)
        .join("; ")}`;
    }

    const notes: string[] = [
      `${parsed.data.linii.length} linii adaugate in sectiunea "${parsed.data.sectiune}".`,
    ];

    const unknown = unknownNormCodes(parsed.data);
    if (unknown.length > 0) {
      notes.push(
        `Codurile ${unknown.join(", ")} nu exista in indicator, iar liniile lor au ` +
          `intrat fara cod. Cauta-le cu cauta_norma si spune codul corect in nota finala.`,
      );
    }

    const priceless = pricelessLines(parsed.data);
    if (priceless.length > 0) {
      notes.push(
        `Au intrat fara pret: ${priceless.join(", ")}. Daca ai un reper rezonabil ` +
          `pentru ele, spune-l in nota finala; altfel omul le oferteaza separat.`,
      );
    }

    return notes.join(" ");
  }

  if (call.name === TOOL_NAMES.proposeSteps) {
    const parsed = proposeStepsSchema.safeParse(call.input);
    if (!parsed.success) {
      return `Argumente invalide, niciun pas nu a fost propus: ${parsed.error.issues
        .map((i) => `${i.path.join(".")} ${i.message}`)
        .join("; ")}`;
    }
    return (
      `${parsed.data.pasi.length} pasi propusi. Sint doar propuneri: omul ii vede ` +
      `intr-o caseta separata si bifeaza ce s-a executat. Nu-i mai adauga si cu ` +
      `adauga_linii_deviz — ar intra de doua ori.`
    );
  }

  if (call.name === TOOL_NAMES.clarify) {
    return "Intrebarea a fost transmisa. Asteapta raspunsul inainte de a continua.";
  }

  return `Unealta necunoscuta: ${call.name}`;
}
