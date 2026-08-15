import { getEstimateForView } from "@/lib/estimates/service";
import { type EstimatePdfScope, renderEstimatePdf } from "@/lib/pdf/documents";
import { badRequest, notFound, requireUserApi, unauthorized } from "@/lib/tenant";

const SCOPES: EstimatePdfScope[] = ["TOT", "MATERIALE", "MANOPERA"];

const FILE_PREFIX: Record<EstimatePdfScope, string> = {
  TOT: "deviz",
  MATERIALE: "deviz-materiale",
  MANOPERA: "deviz-manopera",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUserApi();
  if (!user) return unauthorized();

  const raw = (
    new URL(request.url).searchParams.get("parte") ?? "TOT"
  ).toUpperCase() as EstimatePdfScope;

  if (!SCOPES.includes(raw)) {
    return badRequest("Parte necunoscuta. Foloseste materiale sau manopera.");
  }

  const { id } = await params;
  const estimate = await getEstimateForView(user.orgId, id);
  if (!estimate) return notFound("Devizul nu a fost gasit");

  // Un deviz cu un singur pret pe linie nu se poate rupe in doua.
  if (raw !== "TOT" && estimate.mode !== "SEPARAT") {
    return badRequest(
      "Devizul are un singur pret pe linie, deci nu se tipareste separat.",
    );
  }

  const pdf = await renderEstimatePdf(estimate, raw);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // inline: se deschide in browser; utilizatorul salveaza daca vrea.
      "Content-Disposition": `inline; filename="${FILE_PREFIX[raw]}-${estimate.fullNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
