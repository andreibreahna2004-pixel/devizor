import { getInvoiceForView } from "@/lib/invoices/service";
import { renderInvoicePdf } from "@/lib/pdf/documents";
import { notFound, requireUserApi, unauthorized } from "@/lib/tenant";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUserApi();
  if (!user) return unauthorized();

  const { id } = await params;
  const invoice = await getInvoiceForView(user.orgId, id);
  if (!invoice) return notFound("Factura nu a fost gasita");

  const pdf = await renderInvoicePdf(invoice);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="factura-${invoice.fullNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
