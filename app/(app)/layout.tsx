import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { IconLogout } from "@/components/icons";
import { BottomNav, NavLinks } from "@/components/nav-links";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { requireUser } from "@/lib/tenant";

/** "Andrei Popescu" -> "AP". Tine loc de poza, pe care aplicatia n-o cere. */
function initiale(nume: string): string {
  return nume
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Aplicatia umple ecranul: fara rama, fara colturi rotunjite si fara plafon de
 * latime. Pe un deviz in modul separat, tabelul are sapte coloane si fiecare
 * pixel de latime e o coloana care nu mai trebuie ingustata.
 *
 * Sub `lg` schimba forma, nu doar dimensiunile: bara verticala dispare, iar
 * navigatia coboara intr-o bara de tab-uri lipita de marginea de jos, unde
 * ajunge degetul mare. Sus ramane un antet subtire, lipit la derulare, cu
 * numele aplicatiei si contul — atat cat trebuie ca sa stii unde esti.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="panel flex min-h-screen flex-col lg:flex-row">
      {/* Bara verticala: doar iconite cu eticheta dedesubt, ca sa ramina lata
          cat un deget si sa lase tot restul latimii tabelului de deviz. */}
      <aside className="hidden shrink-0 border-[var(--border)] bg-[var(--rail)] lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[96px] lg:flex-col lg:border-r">
        <div className="flex items-center justify-center py-6">
          <Link href="/dashboard" title={user.orgName}>
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-600 text-base font-bold text-white">
              D
            </span>
          </Link>
        </div>

        <NavLinks />

        <div className="mt-auto px-3 pb-5">
          <form action={logoutAction}>
            <button type="submit" className="rail-item rail-item-idle">
              <IconLogout className="h-[22px] w-[22px]" />
              Iesi
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Antetul de pe telefon. Lipit sus, ca sa nu pierzi numele sectiunii
            cand derulezi un deviz de saizeci de linii. */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-glass)] px-4 backdrop-blur lg:hidden">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">
              D
            </span>
            <span className="font-titlu text-sm font-semibold tracking-tight text-ink-900">
              Devizor
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <UserMenu
              name={user.name}
              email={user.email}
              orgName={user.orgName}
              initials={initiale(user.name)}
            />
          </div>
        </header>

        <header className="hidden items-center justify-end gap-3 lg:flex lg:px-8 lg:pt-6">
          <ThemeToggle />

          <div className="flex items-center gap-3">
            <div className="min-w-0 text-right">
              <p className="truncate text-sm font-medium text-ink-900">{user.name}</p>
              <p className="truncate text-xs text-ink-500" title={user.email}>
                {user.orgName}
              </p>
            </div>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 font-titlu text-sm font-semibold text-brand-700">
              {initiale(user.name)}
            </span>
          </div>
        </header>

        <main className="spatiu-bara min-w-0 flex-1 px-4 pt-5 sm:px-5 lg:px-8 lg:pb-10 lg:pt-4">
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
