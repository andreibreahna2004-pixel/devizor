import "server-only";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "@/lib/db";

const COOKIE_NAME = "devizor_session";
const SESSION_DAYS = 30;

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 16) {
    throw new Error(
      "AUTH_SECRET lipseste sau e prea scurt. Genereaza unul cu: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return new TextEncoder().encode(value);
}

export interface SessionPayload {
  userId: string;
  orgId: string;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSession(payload: SessionPayload): Promise<void> {
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires,
    path: "/",
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/**
 * Citeste sesiunea din cookie. `cache` o memoizeaza pe durata unui request, ca
 * mai multe componente server sa nu verifice acelasi token de zece ori.
 */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret());
    const userId = payload.userId;
    const orgId = payload.orgId;
    if (typeof userId !== "string" || typeof orgId !== "string") return null;
    return { userId, orgId };
  } catch {
    // Token expirat sau semnatura invalida — tratam ca neautentificat.
    return null;
  }
});

export interface CurrentUser {
  userId: string;
  orgId: string;
  name: string;
  email: string;
  role: string;
  orgName: string;
}

/**
 * Sesiunea validata impotriva bazei de date: verifica si ca utilizatorul chiar
 * mai are acces la firma din token. Fara asta, un membru scos din firma ar
 * ramane inauntru pana la expirarea cookie-ului.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;

  const membership = await prisma.membership.findUnique({
    where: { userId_orgId: { userId: session.userId, orgId: session.orgId } },
    include: { user: true, org: { select: { name: true } } },
  });
  if (!membership) return null;

  return {
    userId: membership.userId,
    orgId: membership.orgId,
    name: membership.user.name,
    email: membership.user.email,
    role: membership.role,
    orgName: membership.org.name,
  };
});
