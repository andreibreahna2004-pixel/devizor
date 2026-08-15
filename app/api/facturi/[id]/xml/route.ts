import { prisma } from "@/lib/db";
import { buildInvoiceXml, validateForEfactura } from "@/lib/efactura/ubl";
import { invoiceToUbl } from "@/lib/efactura/from-invoice";
import { getInvoiceForView } from "@/lib/invoices/service";
import { notFound, requireUserApi, unauthorized } from "@/lib/tenant";

/**
 * Exportul XML pentru e-Factura (SPV).
 *
 * Validam inainte de a genera si intoarcem problemele in romana. E mai bine sa
 * afle utilizatorul aici ca lipseste judetul beneficiarului, decat sa fie
 * respins de SPV cu un cod de eroare pe care nu-l poate interpreta.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUserApi();
  if (!user) return unauthorized();

  const { id } = await params;
  const invoice = await getInvoiceForView(user.orgId, id);
  if (!invoice) return notFound("Factura nu a fost gasita");

  const ubl = invoiceToUbl(invoice);
  const problems = validateForEfactura(ubl);

  // Doar problemele care ar duce la respingere blocheaza exportul; avertismentele
  // despre unitatea de masura nu, pentru ca exportul cade oricum pe "bucata".
  const blocking = problems.filter((p) => !p.field.includes(".unit"));
  if (blocking.length > 0) {
    return Response.json(
      {
        error: "Factura nu poate fi exportata in e-Factura",
        problems: blocking,
      },
      { status: 422 },
    );
  }

  const xml = buildInvoiceXml(ubl);

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      efacturaXml: xml,
      efacturaStatus: "GENERATA",
      efacturaGeneratedAt: new Date(),
    },
  });

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="efactura-${invoice.fullNumber}.xml"`,
      "Cache-Control": "private, no-store",
    },
  });
}
