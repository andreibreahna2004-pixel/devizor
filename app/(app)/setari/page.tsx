import type { Metadata } from "next";
import { isAiConfigured } from "@/lib/ai/client";
import { prisma } from "@/lib/db";
import { toNumber } from "@/lib/money";
import { canManage, requireUser } from "@/lib/tenant";
import { OrgSettingsForm } from "./org-settings-form";
import { SeriesSettings } from "./series-settings";

export const metadata: Metadata = { title: "Setari" };

export default async function SettingsPage() {
  const user = await requireUser();

  const [org, series, aiRuns] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: user.orgId } }),
    prisma.documentSeries.findMany({
      where: { orgId: user.orgId },
      orderBy: { kind: "asc" },
    }),
    prisma.aiRun.aggregate({
      where: { orgId: user.orgId },
      _count: true,
      _sum: { inputTokens: true, outputTokens: true, cacheReadTokens: true },
    }),
  ]);

  const manage = canManage(user.role);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Setari</h1>
        <p className="mt-1 text-sm text-ink-500">
          Datele firmei apar pe toate devizele si facturile.
        </p>
      </div>

      {!manage && (
        <div className="card border-amber-200 bg-amber-50 px-5 py-3.5">
          <p className="text-sm text-amber-900">
            Ai rol de membru — poti vedea setarile, dar nu le poti modifica.
          </p>
        </div>
      )}

      <OrgSettingsForm
        canManage={manage}
        org={{
          name: org.name,
          cui: org.cui,
          vatPayer: org.vatPayer,
          regCom: org.regCom,
          address: org.address,
          city: org.city,
          countyCode: org.countyCode,
          postalCode: org.postalCode,
          email: org.email,
          phone: org.phone,
          iban: org.iban,
          bank: org.bank,
          defaultVatRate: toNumber(org.defaultVatRate),
          defaultMode: org.defaultMode,
        }}
      />

      <SeriesSettings
        canManage={manage}
        series={series.map((s) => ({
          kind: s.kind,
          series: s.series,
          nextNumber: s.nextNumber,
        }))}
      />

      <section className="card p-5">
        <h2 className="font-semibold text-ink-900">Generare cu AI</h2>
        {isAiConfigured() ? (
          <>
            <p className="mt-1 text-sm text-emerald-700">Configurata si activa.</p>
            <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-ink-500">Devize generate</dt>
                <dd className="tabular font-medium text-ink-900">{aiRuns._count}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Tokeni trimisi</dt>
                <dd className="tabular font-medium text-ink-900">
                  {(aiRuns._sum.inputTokens ?? 0).toLocaleString("ro-RO")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Tokeni cititi din cache</dt>
                <dd className="tabular font-medium text-ink-900">
                  {(aiRuns._sum.cacheReadTokens ?? 0).toLocaleString("ro-RO")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Tokeni generati</dt>
                <dd className="tabular font-medium text-ink-900">
                  {(aiRuns._sum.outputTokens ?? 0).toLocaleString("ro-RO")}
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="mt-1 max-w-2xl text-sm text-ink-600">
            Neconfigurata. Adauga <code className="text-ink-900">ANTHROPIC_API_KEY</code>{" "}
            in fisierul <code className="text-ink-900">.env</code> si reporneste
            aplicatia. Fara ea, tot restul aplicatiei functioneaza normal — doar
            generarea automata a devizelor e indisponibila.
          </p>
        )}
      </section>
    </div>
  );
}
