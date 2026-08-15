import { z } from "zod";
import { isAiConfigured } from "@/lib/ai/client";
import { type GenerationEvent, generateEstimate } from "@/lib/ai/generate-estimate";
import { prisma } from "@/lib/db";
import {
  addEstimateLine,
  ensureSection,
  isEditable,
  recalculateEstimate,
} from "@/lib/estimates/service";
import { badRequest, notFound, requireUserApi, unauthorized } from "@/lib/tenant";

/**
 * Adaugarea de linii intr-un deviz care exista deja, pornind de la o fraza
 * scrisa in cuvinte normale: "am sapat 12 mc cu excavatorul si am turnat beton".
 *
 * Fluxul e acelasi ca la generarea unui deviz nou — SSE, cu liniile salvate pe
 * masura ce apar — dar nu se creeaza nimic: liniile se adauga la coada devizului
 * si sectiunile se refolosesc daca exista deja cu acelasi nume.
 */

export const maxDuration = 300;

const requestSchema = z.object({
  text: z
    .string()
    .min(5, "Scrie ce ai lucrat, in cateva cuvinte")
    .max(4000),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id } = await params;
  const estimate = await prisma.estimate.findFirst({
    where: { id, orgId: user.orgId },
    select: { id: true, status: true, mode: true },
  });

  if (!estimate) return notFound("Devizul nu a fost gasit");
  if (!isEditable(estimate.status)) {
    return badRequest("Devizul nu mai e ciorna si nu poate fi modificat");
  }

  // Liniile noi intra la coada, dupa cele existente.
  const last = await prisma.estimateLine.findFirst({
    where: { estimateId: estimate.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  let sortOrder = (last?.sortOrder ?? -1) + 1;

  const existingSections = await prisma.estimateSection.findMany({
    where: { estimateId: estimate.id },
    select: { id: true, name: true },
  });
  const sectionIds = new Map(existingSections.map((s) => [s.name, s.id]));

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      let lineCount = 0;
      let failure: string | null = null;

      try {
        const events = generateEstimate(estimate.mode, user.orgName, {
          text: parsed.data.text,
          incremental: true,
        });

        for await (const event of events) {
          if (event.type === "section" && !sectionIds.has(event.name)) {
            const sectionId = await ensureSection(
              estimate.id,
              event.name,
              sectionIds.size,
            );
            sectionIds.set(event.name, sectionId);
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

          if (event.type === "error") failure = event.message;

          send(event satisfies GenerationEvent);
        }
      } catch (error) {
        failure = error instanceof Error ? error.message : "Eroare necunoscuta";
        console.error("Adaugarea liniilor a esuat", error);
        send({ type: "error", message: failure });
      }

      try {
        const totals = await recalculateEstimate(estimate.id);
        send({ type: "done", lines: lineCount, totals, failed: Boolean(failure) });
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
      "X-Accel-Buffering": "no",
    },
  });
}
