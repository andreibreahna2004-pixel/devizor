import { z } from "zod";
import { AI_MODEL, isAiConfigured } from "@/lib/ai/client";
import { type GenerationEvent, generateEstimate } from "@/lib/ai/generate-estimate";
import { countyName, isValidCountyCode } from "@/lib/counties";
import { prisma } from "@/lib/db";
import {
  addEstimateLine,
  createDraftEstimate,
  ensureSection,
  recalculateEstimate,
  replaceSuggestions,
} from "@/lib/estimates/service";
import { badRequest, requireUserApi, unauthorized } from "@/lib/tenant";

/**
 * Generarea devizului cu AI, ca flux SSE.
 *
 * Devizul se creeaza ca ciorna INAINTE de a porni generarea, iar liniile se
 * salveaza pe masura ce apar. Generarea unei case intregi dureaza minute bune;
 * daca omul inchide laptopul la jumatate, munca de pana atunci trebuie sa fie
 * in baza de date, nu doar in starea paginii.
 */

export const maxDuration = 300;

const requestSchema = z.object({
  title: z.string().min(2, "Da un titlu devizului").max(200),
  brief: z.string().min(20, "Descrie lucrarea in cel putin 20 de caractere").max(20000),
  clientId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  workType: z.string().nullable().optional(),
  builtArea: z.number().positive().nullable().optional(),
  floors: z.string().nullable().optional(),
  finishLevel: z.string().nullable().optional(),
  /// Cod ISO 3166-2:RO. Se verifica la fel ca oriunde vine un judet din browser.
  county: z.string().nullable().optional(),
  retrospective: z.boolean().optional(),
});

export async function POST(request: Request) {
  const user = await requireUserApi();
  if (!user) return unauthorized();

  if (!isAiConfigured()) {
    return badRequest(
      "Generarea cu AI nu este configurata. Adauga ANTHROPIC_API_KEY in fisierul .env si reporneste aplicatia.",
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return badRequest("Cerere invalida");
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Date invalide");
  }
  const input = parsed.data;

  // Verificam ca beneficiarul si proiectul apartin firmei din sesiune —
  // id-urile vin din browser si nu au incredere.
  if (input.clientId) {
    const owned = await prisma.client.findFirst({
      where: { id: input.clientId, orgId: user.orgId },
      select: { id: true },
    });
    if (!owned) return badRequest("Beneficiarul selectat nu exista");
  }
  if (input.projectId) {
    const owned = await prisma.project.findFirst({
      where: { id: input.projectId, orgId: user.orgId },
      select: { id: true },
    });
    if (!owned) return badRequest("Proiectul selectat nu exista");
  }

  // Judetul vine din browser: se pastreaza doar daca e un cod real, altfel
  // devizul ar purta o zona inventata si reperele de pret s-ar lega de nimic.
  const countyCode =
    input.county && isValidCountyCode(input.county) ? input.county : null;

  const estimate = await createDraftEstimate(user.orgId, {
    title: input.title,
    countyCode,
    clientId: input.clientId ?? null,
    projectId: input.projectId ?? null,
    aiBrief: input.brief,
  });

  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      send({
        type: "created",
        estimateId: estimate.id,
        fullNumber: estimate.fullNumber,
      });

      const sectionIds = new Map<string, string>();
      let sortOrder = 0;
      let lineCount = 0;
      let failure: string | null = null;

      try {
        const events = generateEstimate(user.orgName, {
          text: input.brief,
          workType: input.workType,
          builtArea: input.builtArea,
          floors: input.floors,
          finishLevel: input.finishLevel,
          // Numele, nu codul: modelul stie ce e "Cluj", nu ce e "RO-CJ".
          county: countyCode ? countyName(countyCode) : null,
          retrospective: input.retrospective,
        });

        for await (const event of events) {
          if (event.type === "section") {
            if (!sectionIds.has(event.name)) {
              const id = await ensureSection(
                estimate.id,
                event.name,
                sectionIds.size,
              );
              sectionIds.set(event.name, id);
            }
          }

          if (event.type === "line") {
            const line = event.line;
            const saved = await addEstimateLine(estimate.id, {
              sectionId: sectionIds.get(line.section) ?? null,
              code: line.code,
              name: line.name,
              unit: line.unit,
              quantity: line.quantity,
              materialUnitPrice: line.materialUnitPrice,
              laborUnitPrice: line.laborUnitPrice,
              equipmentUnitPrice: line.equipmentUnitPrice,
              transportUnitPrice: line.transportUnitPrice,
              sortOrder: sortOrder++,
              aiGenerated: true,
              aiJustification: line.justification,
              aiConfidence: line.confidence,
              aiAlternativeCodes: line.alternativeCodes,
            });
            lineCount += 1;
            send({ ...event, line: { ...line, id: saved.id } });
            continue;
          }

          if (event.type === "usage") {
            await recordAiRun(user, estimate.id, input.brief, event.usage, null);
            send(event);
            continue;
          }

          // La fel ca la adaugarea in deviz existent: propunerile se salveaza,
          // ca sa le gaseasca omul in editor dupa ce se deschide devizul.
          if (event.type === "steps") {
            await replaceSuggestions(estimate.id, event.steps);
          }

          if (event.type === "error") failure = event.message;

          send(event satisfies GenerationEvent);
        }
      } catch (error) {
        failure = error instanceof Error ? error.message : "Eroare necunoscuta";
        console.error("Generarea devizului a esuat", error);
        send({ type: "error", message: failure });
        await recordAiRun(user, estimate.id, input.brief, null, failure);
      }

      try {
        const totals = await recalculateEstimate(estimate.id);
        send({
          type: "done",
          estimateId: estimate.id,
          lines: lineCount,
          totals,
          durationMs: Date.now() - startedAt,
          failed: Boolean(failure),
        });
      } catch (error) {
        console.error("Recalcularea totalurilor a esuat", error);
        send({
          type: "error",
          message: "Liniile s-au salvat, dar recalcularea totalurilor a esuat.",
        });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Fara asta, un proxy care tamponeaza raspunsul ar livra tot fluxul la final.
      "X-Accel-Buffering": "no",
    },
  });
}

async function recordAiRun(
  user: { orgId: string; userId: string },
  estimateId: string,
  brief: string,
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    linesProposed: number;
    durationMs: number;
  } | null,
  error: string | null,
): Promise<void> {
  try {
    await prisma.aiRun.create({
      data: {
        orgId: user.orgId,
        userId: user.userId,
        kind: "DEVIZ",
        // Din constanta, nu scris de mina: auditul trebuie sa spuna ce model a
        // fost chemat efectiv, iar un literal copiat aici ar ramine in urma la
        // prima schimbare de model si ar minti tocmai in tabelul de audit.
        model: AI_MODEL,
        brief,
        estimateId,
        error,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        cacheReadTokens: usage?.cacheReadTokens ?? 0,
        cacheWriteTokens: usage?.cacheWriteTokens ?? 0,
        linesProposed: usage?.linesProposed ?? 0,
        durationMs: usage?.durationMs ?? 0,
      },
    });
  } catch (err) {
    // Auditul nu are voie sa strice generarea.
    console.error("Nu am putut inregistra rularea AI", err);
  }
}
