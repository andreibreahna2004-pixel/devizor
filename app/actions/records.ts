"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isValidCountyCode } from "@/lib/counties";
import { toDecimal } from "@/lib/money-db";
import { canManage, requireUser } from "@/lib/tenant";

/** Beneficiari, proiecte si setarile firmei. */

export interface RecordResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !out[key]) out[key] = issue.message;
  }
  return out;
}

const optional = (value: FormDataEntryValue | null): string | null => {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
};

// ---------------------------------------------------------------------------
// Beneficiari
// ---------------------------------------------------------------------------

const clientSchema = z.object({
  id: z.string().nullable(),
  type: z.enum(["PERSOANA_FIZICA", "PERSOANA_JURIDICA"]),
  name: z.string().min(2, "Scrie denumirea beneficiarului").max(200),
  cui: z.string().nullable(),
  vatPayer: z.boolean(),
  regCom: z.string().nullable(),
  cnp: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  countyCode: z.string().nullable(),
  postalCode: z.string().nullable(),
  email: z.string().email("Email invalid").nullable().or(z.literal("").transform(() => null)),
  phone: z.string().nullable(),
});

export async function saveClient(formData: FormData): Promise<RecordResult> {
  const user = await requireUser();

  const parsed = clientSchema.safeParse({
    id: optional(formData.get("id")),
    type: String(formData.get("type") ?? "PERSOANA_JURIDICA"),
    name: String(formData.get("name") ?? "").trim(),
    cui: optional(formData.get("cui"))?.replace(/^RO/i, "").trim() ?? null,
    vatPayer: formData.get("vatPayer") === "on",
    regCom: optional(formData.get("regCom")),
    cnp: optional(formData.get("cnp")),
    address: optional(formData.get("address")),
    city: optional(formData.get("city")),
    countyCode: optional(formData.get("countyCode")),
    postalCode: optional(formData.get("postalCode")),
    email: optional(formData.get("email")),
    phone: optional(formData.get("phone")),
  });

  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  const data = parsed.data;
  if (data.countyCode && !isValidCountyCode(data.countyCode)) {
    return { ok: false, fieldErrors: { countyCode: "Judet invalid" } };
  }

  const { id, ...fields } = data;

  if (id) {
    const updated = await prisma.client.updateMany({
      where: { id, orgId: user.orgId },
      data: fields,
    });
    if (updated.count === 0) return { ok: false, error: "Beneficiarul nu a fost gasit" };
  } else {
    await prisma.client.create({ data: { ...fields, orgId: user.orgId } });
  }

  revalidatePath("/clienti");
  return { ok: true };
}

export async function deleteClient(id: string): Promise<RecordResult> {
  const user = await requireUser();

  // Un beneficiar care apare pe o factura emisa nu se sterge — factura trebuie
  // sa ramana verificabila.
  const invoices = await prisma.invoice.count({
    where: { clientId: id, orgId: user.orgId },
  });
  if (invoices > 0) {
    return {
      ok: false,
      error: `Beneficiarul are ${invoices} facturi si nu poate fi sters.`,
    };
  }

  await prisma.client.deleteMany({ where: { id, orgId: user.orgId } });
  revalidatePath("/clienti");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Proiecte
// ---------------------------------------------------------------------------

const projectSchema = z.object({
  id: z.string().nullable(),
  name: z.string().min(2, "Scrie denumirea proiectului").max(200),
  clientId: z.string().nullable(),
  description: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  countyCode: z.string().nullable(),
});

export async function saveProject(formData: FormData): Promise<RecordResult> {
  const user = await requireUser();

  const parsed = projectSchema.safeParse({
    id: optional(formData.get("id")),
    name: String(formData.get("name") ?? "").trim(),
    clientId: optional(formData.get("clientId")),
    description: optional(formData.get("description")),
    address: optional(formData.get("address")),
    city: optional(formData.get("city")),
    countyCode: optional(formData.get("countyCode")),
  });

  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  const { id, ...fields } = parsed.data;

  if (fields.clientId) {
    const owned = await prisma.client.count({
      where: { id: fields.clientId, orgId: user.orgId },
    });
    if (owned === 0) return { ok: false, error: "Beneficiarul nu exista" };
  }

  if (id) {
    const updated = await prisma.project.updateMany({
      where: { id, orgId: user.orgId },
      data: fields,
    });
    if (updated.count === 0) return { ok: false, error: "Proiectul nu a fost gasit" };
  } else {
    await prisma.project.create({ data: { ...fields, orgId: user.orgId } });
  }

  revalidatePath("/proiecte");
  return { ok: true };
}

export async function deleteProject(id: string): Promise<RecordResult> {
  const user = await requireUser();
  await prisma.project.deleteMany({ where: { id, orgId: user.orgId } });
  revalidatePath("/proiecte");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Setarile firmei
// ---------------------------------------------------------------------------

const orgSchema = z.object({
  name: z.string().min(2, "Scrie denumirea firmei").max(200),
  cui: z.string().min(2, "Completeaza CUI-ul"),
  vatPayer: z.boolean(),
  regCom: z.string().nullable(),
  address: z.string().min(3, "Completeaza adresa"),
  city: z.string().min(2, "Completeaza localitatea"),
  countyCode: z.string().min(4, "Alege judetul"),
  postalCode: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  iban: z.string().nullable(),
  bank: z.string().nullable(),
  defaultVatRate: z.number().min(0).max(100),
});

const num = (value: FormDataEntryValue | null, fallback: number): number => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
};

export async function saveOrganization(formData: FormData): Promise<RecordResult> {
  const user = await requireUser();
  if (!canManage(user.role)) {
    return { ok: false, error: "Nu ai drepturi sa modifici setarile firmei" };
  }

  const parsed = orgSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    cui: String(formData.get("cui") ?? "").replace(/^RO/i, "").trim(),
    vatPayer: formData.get("vatPayer") === "on",
    regCom: optional(formData.get("regCom")),
    address: String(formData.get("address") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    countyCode: String(formData.get("countyCode") ?? "").trim(),
    postalCode: optional(formData.get("postalCode")),
    email: optional(formData.get("email")),
    phone: optional(formData.get("phone")),
    iban: optional(formData.get("iban")),
    bank: optional(formData.get("bank")),
    defaultVatRate: num(formData.get("defaultVatRate"), 21),
  });

  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
  if (!isValidCountyCode(parsed.data.countyCode)) {
    return { ok: false, fieldErrors: { countyCode: "Judet invalid" } };
  }

  const data = parsed.data;

  await prisma.organization.update({
    where: { id: user.orgId },
    data: {
      ...data,
      defaultVatRate: toDecimal(data.defaultVatRate, 2),
    },
  });

  revalidatePath("/setari");
  return { ok: true };
}

const seriesSchema = z.object({
  kind: z.enum(["DEVIZ", "FACTURA", "PROFORMA", "SITUATIE"]),
  series: z
    .string()
    .min(1, "Seria nu poate fi goala")
    .max(10)
    .regex(/^[A-Z0-9-]+$/, "Doar litere mari, cifre si liniuta"),
  nextNumber: z.number().int().positive(),
});

export async function saveSeries(formData: FormData): Promise<RecordResult> {
  const user = await requireUser();
  if (!canManage(user.role)) {
    return { ok: false, error: "Nu ai drepturi sa modifici seriile" };
  }

  const parsed = seriesSchema.safeParse({
    kind: String(formData.get("kind") ?? ""),
    series: String(formData.get("series") ?? "").trim().toUpperCase(),
    nextNumber: Number(formData.get("nextNumber") ?? 1),
  });

  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  const { kind, series, nextNumber } = parsed.data;

  // Scaderea contorului ar produce numere duplicate pe documente deja emise.
  const existing = await prisma.documentSeries.findFirst({
    where: { orgId: user.orgId, kind, series },
  });
  if (existing && nextNumber < existing.nextNumber) {
    return {
      ok: false,
      error: `Numarul urmator nu poate scadea sub ${existing.nextNumber} — ar produce duplicate.`,
    };
  }

  await prisma.documentSeries.upsert({
    where: { orgId_kind_series: { orgId: user.orgId, kind, series } },
    create: { orgId: user.orgId, kind, series, nextNumber, isDefault: true },
    update: { nextNumber },
  });

  revalidatePath("/setari");
  return { ok: true };
}
