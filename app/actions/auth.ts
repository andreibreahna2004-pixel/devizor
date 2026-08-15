"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createSession,
  destroySession,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createDefaultSeries } from "@/lib/numbering/series";

export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const loginSchema = z.object({
  email: z.string().email("Adresa de email nu pare valida"),
  password: z.string().min(1, "Introdu parola"),
});

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    include: { memberships: { orderBy: { createdAt: "asc" }, take: 1 } },
  });

  // Acelasi mesaj pentru email inexistent si parola gresita: altfel formularul
  // devine un instrument de verificat ce adrese sunt inregistrate.
  const invalid = { error: "Email sau parola gresita" };
  if (!user) return invalid;

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) return invalid;

  const membership = user.memberships[0];
  if (!membership) {
    return { error: "Contul nu este asociat niciunei firme. Contacteaza administratorul." };
  }

  await createSession({ userId: user.id, orgId: membership.orgId });
  redirect("/dashboard");
}

const registerSchema = z
  .object({
    name: z.string().min(2, "Scrie numele tau"),
    email: z.string().email("Adresa de email nu pare valida"),
    password: z.string().min(8, "Parola trebuie sa aiba minim 8 caractere"),
    orgName: z.string().min(2, "Scrie denumirea firmei"),
    cui: z
      .string()
      .min(2, "Completeaza CUI-ul")
      .transform((v) => v.replace(/^RO/i, "").trim()),
    address: z.string().min(3, "Completeaza adresa sediului"),
    city: z.string().min(2, "Completeaza localitatea"),
    countyCode: z.string().min(4, "Alege judetul"),
  });

export async function registerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = registerSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
    orgName: String(formData.get("orgName") ?? "").trim(),
    cui: String(formData.get("cui") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    countyCode: String(formData.get("countyCode") ?? "").trim(),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const data = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    return { fieldErrors: { email: "Exista deja un cont cu acest email" } };
  }

  const passwordHash = await hashPassword(data.password);
  const slug = await uniqueSlug(data.orgName);

  const { userId, orgId } = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: data.orgName,
        slug,
        cui: data.cui,
        address: data.address,
        city: data.city,
        countyCode: data.countyCode,
      },
    });

    const user = await tx.user.create({
      data: { name: data.name, email: data.email, passwordHash },
    });

    await tx.membership.create({
      data: { userId: user.id, orgId: org.id, role: "OWNER" },
    });

    await createDefaultSeries(tx, org.id);

    return { userId: user.id, orgId: org.id };
  });

  await createSession({ userId, orgId });
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !result[key]) result[key] = issue.message;
  }
  return result;
}

async function uniqueSlug(name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "firma";

  let candidate = base;
  let suffix = 1;
  while (await prisma.organization.findUnique({ where: { slug: candidate } })) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}
