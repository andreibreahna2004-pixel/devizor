import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function RootPage() {
  // Sesiunea se verifica in baza de date, ca un cookie ramas de la un cont
  // sters sa duca direct la login, nu prin /dashboard.
  const user = await getCurrentUser();
  redirect(user ? "/dashboard" : "/login");
}
