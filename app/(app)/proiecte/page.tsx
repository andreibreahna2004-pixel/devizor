import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { toNumber } from "@/lib/money";
import { requireUser } from "@/lib/tenant";
import { ProjectList } from "./project-list";

export const metadata: Metadata = { title: "Proiecte" };

export default async function ProjectsPage() {
  const user = await requireUser();

  const [projects, clients] = await Promise.all([
    prisma.project.findMany({
      where: { orgId: user.orgId },
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { id: true, name: true } },
        estimates: { select: { grandTotal: true } },
        _count: { select: { estimates: true, invoices: true } },
      },
    }),
    prisma.client.findMany({
      where: { orgId: user.orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Proiecte</h1>
        <p className="mt-1 text-sm text-ink-500">
          Santierele si obiectivele pe care lucrezi. Un proiect leaga devizele si
          facturile de acelasi amplasament.
        </p>
      </div>

      <ProjectList
        clients={clients}
        projects={projects.map((project) => ({
          id: project.id,
          name: project.name,
          description: project.description,
          address: project.address,
          city: project.city,
          countyCode: project.countyCode,
          clientId: project.clientId,
          clientName: project.client?.name ?? null,
          estimateCount: project._count.estimates,
          invoiceCount: project._count.invoices,
          estimatedValue: project.estimates.reduce(
            (sum, e) => sum + toNumber(e.grandTotal),
            0,
          ),
        }))}
      />

      {projects.length > 0 && (
        <p className="text-sm text-ink-500">
          Vezi{" "}
          <Link href="/devize" className="link">
            toate devizele
          </Link>{" "}
          sau{" "}
          <Link href="/facturi" className="link">
            facturile
          </Link>
          .
        </p>
      )}
    </div>
  );
}

export const dynamic = "force-dynamic";
