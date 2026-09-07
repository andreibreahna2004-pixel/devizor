import "server-only";
import { AI_MODEL } from "@/lib/ai/client";
import { prisma } from "@/lib/db";

/**
 * Citirea unei pagini cu modelul se scrie in `AiRun`, ca generarea unui deviz.
 *
 * Un apel care costa bani apartine tabelului de audit: altfel nimeni nu poate
 * raspunde la "de ce a crescut factura luna asta". Se trece firma din a carei
 * cautare a pornit apelul — catalogul e national, dar cheltuiala are un vinovat.
 *
 * Scrierea nu are voie sa strice cautarea: la orice eroare se merge mai departe.
 */
export async function noteazaRulareMateriale(intrare: {
  orgId: string;
  userId?: string | null;
  magazin: string;
  interogare: string;
  produse: number;
  inputTokens: number;
  outputTokens: number;
  durataMs: number;
  eroare?: string;
}): Promise<void> {
  await prisma.aiRun
    .create({
      data: {
        orgId: intrare.orgId,
        userId: intrare.userId ?? null,
        kind: "MATERIALE",
        // Modelul se scrie o singura data, in `lib/ai/client.ts`. Un literal copiat
        // aici ar ramane in urma la prima schimbare si ar minti tocmai in audit.
        model: AI_MODEL,
        brief: `${intrare.magazin}: ${intrare.interogare}`,
        inputTokens: intrare.inputTokens,
        outputTokens: intrare.outputTokens,
        linesProposed: intrare.produse,
        durationMs: intrare.durataMs,
        error: intrare.eroare ?? null,
      },
    })
    .catch(() => {});
}
