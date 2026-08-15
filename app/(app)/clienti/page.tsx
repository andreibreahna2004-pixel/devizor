import type { Metadata } from "next";
import { countyLabel } from "@/lib/efactura/ubl";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/tenant";
import { ClientList } from "./client-list";

export const metadata: Metadata = { title: "Clienti" };

export default async function ClientsPage() {
  const user = await requireUser();

  const clients = await prisma.client.findMany({
    where: { orgId: user.orgId },
    orderBy: { name: "asc" },
    include: { _count: { select: { invoices: true, estimates: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Clienti</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-500">
          Datele de aici ajung pe facturi. Judetul e obligatoriu pentru e-Factura,
          iar pentru Bucuresti localitatea trebuie sa fie sectorul.
        </p>
      </div>

      <ClientList
        clients={clients.map((c) => ({
          id: c.id,
          type: c.type,
          name: c.name,
          cui: c.cui,
          vatPayer: c.vatPayer,
          regCom: c.regCom,
          cnp: c.cnp,
          address: c.address,
          city: c.city,
          countyCode: c.countyCode,
          countyName: countyLabel(c.countyCode),
          postalCode: c.postalCode,
          email: c.email,
          phone: c.phone,
          documentCount: c._count.invoices + c._count.estimates,
          invoiceCount: c._count.invoices,
        }))}
      />
    </div>
  );
}
