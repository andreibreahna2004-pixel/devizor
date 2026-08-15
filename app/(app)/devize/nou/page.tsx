import type { Metadata } from "next";
import Link from "next/link";
import { isAiConfigured } from "@/lib/ai/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/tenant";
import { NewEstimateForm } from "./new-estimate-form";

export const metadata: Metadata = { title: "Deviz nou" };

export default async function NewEstimatePage() {
  const user = await requireUser();

  const [clients, projects, org] = await Promise.all([
    prisma.client.findMany({
      where: { orgId: user.orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.project.findMany({
      where: { orgId: user.orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, clientId: true },
    }),
    prisma.organization.findUniqueOrThrow({
      where: { id: user.orgId },
      select: { defaultMode: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/devize" className="link text-sm">
          ← Devize
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-ink-900">Deviz nou</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-500">
          Descrie lucrarea in cuvintele tale. AI-ul stabileste lucrarile,
          calculeaza cantitatile si propune preturi orientative, cu calculul scris
          langa fiecare linie. Preturile le corectezi tu in editor.
        </p>
      </div>

      <NewEstimateForm
        clients={clients}
        projects={projects}
        aiConfigured={isAiConfigured()}
        defaultMode={org.defaultMode}
      />
    </div>
  );
}
