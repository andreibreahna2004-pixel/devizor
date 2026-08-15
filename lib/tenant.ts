import "server-only";
import { redirect } from "next/navigation";
import { type CurrentUser, getCurrentUser } from "@/lib/auth";

/**
 * Poarta prin care trece orice pagina si orice actiune din aplicatie.
 *
 * Regula: nu se scrie niciodata un query fara `orgId`-ul intors de aici. Nu
 * folositi id-uri de firma venite din request (body, query string, form) —
 * singura sursa de adevar este sesiunea.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Varianta pentru route handlers, unde vrem 401 in loc de redirect. */
export async function requireUserApi(): Promise<CurrentUser | null> {
  return getCurrentUser();
}

export function unauthorized(): Response {
  return Response.json({ error: "Neautentificat" }, { status: 401 });
}

export function forbidden(message = "Nu ai drepturi pentru aceasta actiune"): Response {
  return Response.json({ error: message }, { status: 403 });
}

export function badRequest(message: string, details?: unknown): Response {
  return Response.json({ error: message, details }, { status: 400 });
}

export function notFound(message = "Resursa nu a fost gasita"): Response {
  return Response.json({ error: message }, { status: 404 });
}

/** Doar OWNER si ADMIN pot schimba setarile firmei si emite documente. */
export function canManage(role: string): boolean {
  return role === "OWNER" || role === "ADMIN";
}
