import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Autentificare" };

export default async function LoginPage() {
  // Se verifica sesiunea validata in baza de date, nu doar semnatura token-ului:
  // un cookie ramas de la un utilizator care nu mai exista trebuie sa arate
  // formularul de login, nu sa fie trimis catre /dashboard, care l-ar trimite
  // inapoi aici la nesfarsit.
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink-900">Intra in cont</h1>
      <p className="mt-1.5 text-sm text-ink-500">
        Nu ai cont?{" "}
        <Link href="/register" className="link font-medium">
          Inregistreaza-ti firma
        </Link>
      </p>

      <div className="mt-8">
        <LoginForm />
      </div>
    </div>
  );
}
