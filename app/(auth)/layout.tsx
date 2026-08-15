import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Panoul de prezentare — ascuns pe mobil, unde conteaza doar formularul. */}
      <aside className="promo-panel hidden px-12 py-14 lg:flex lg:w-[42%] lg:flex-col lg:justify-between">
        <div>
          <Link href="/" className="text-xl font-semibold tracking-tight">
            Devizor
          </Link>
          <p className="mt-14 max-w-md text-3xl font-semibold leading-tight">
            Descrii lucrarea in cuvinte.
            <br />
            Primesti devizul cu lucrari, cantitati si preturi.
          </p>
          <ul className="promo-muted mt-10 space-y-4">
            <li className="flex gap-3">
              <span className="promo-accent">—</span>
              Preturile le scrii tu, pe fiecare linie. Fara catalog de intretinut
              si fara cifre care se schimba in spate.
            </li>
            <li className="flex gap-3">
              <span className="promo-accent">—</span>
              Fiecare cantitate propusa are calculul scris langa ea. Verifici si
              corectezi inainte sa trimiti.
            </li>
            <li className="flex gap-3">
              <span className="promo-accent">—</span>
              Din deviz iese factura, cu XML de e-Factura pentru SPV.
            </li>
          </ul>
        </div>
        <p className="promo-muted text-sm">
          Facut pentru firmele de constructii din Romania.
        </p>
      </aside>

      {/* Comutatorul sta si aici: cine prefera tema deschisa dar are sistemul pe
          intuneric ar ajunge altfel pe un login intunecat, fara nicio cale de a-l
          schimba inainte de a intra in cont. */}
      <main className="relative flex flex-1 items-center justify-center px-5 py-12">
        <div className="absolute right-5 top-5">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
