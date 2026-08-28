import { getEstimateForView } from "@/lib/estimates/service";
import { renderEstimatePdf } from "@/lib/pdf/documents";
import { notFound, requireUserApi, unauthorized } from "@/lib/tenant";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUserApi();
  if (!user) return unauthorized();

  const { id } = await params;
  const estimate = await getEstimateForView(user.orgId, id);
  if (!estimate) return notFound("Devizul nu a fost gasit");

  const pdf = await renderEstimatePdf(estimate);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // inline: se deschide in browser; utilizatorul salveaza daca vrea.
      "Content-Disposition": `inline; filename="deviz-${estimate.fullNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
