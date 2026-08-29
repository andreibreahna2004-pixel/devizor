"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Tab-urile din capul paginii Materiale.
 *
 * Consumurile nu-si iau intrare proprie in bara de jos: acolo sunt sapte
 * sectiuni, cite ~51px pe un ecran de 360px, si a opta ar face tinta prea mica
 * (vezi comentariul din `components/nav-links.tsx`). Sub Materiale e si locul
 * lor firesc — tot despre materiale e vorba, o data cu pretul, o data cu
 * cantitatea.
 */

const TABS = [
  { href: "/materiale", eticheta: "Preturi" },
  { href: "/materiale/consumuri", eticheta: "Consumuri" },
];

export function MaterialsTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b border-[var(--border)]" aria-label="Sectiuni materiale">
      {TABS.map((tab) => {
        const activ = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={activ ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              activ
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-ink-500 hover:text-ink-800"
            }`}
          >
            {tab.eticheta}
          </Link>
        );
      })}
    </nav>
  );
}
