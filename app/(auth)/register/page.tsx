import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Inregistrare firma" };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink-900">
        Inregistreaza-ti firma
      </h1>
      <p className="mt-1.5 text-sm text-ink-500">
        Ai deja cont?{" "}
        <Link href="/login" className="link font-medium">
          Intra in cont
        </Link>
      </p>

      <div className="mt-8">
        <RegisterForm />
      </div>
    </div>
  );
}
