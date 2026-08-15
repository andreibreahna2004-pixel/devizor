"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconClient,
  IconDeviz,
  IconFactura,
  IconPanou,
  IconProiect,
  IconSetari,
} from "@/components/icons";

type NavLink = {
  href: string;
  label: string;
  Icon: (props: { className?: string }) => React.ReactElement;
};

const LINKS: NavLink[] = [
  { href: "/dashboard", label: "Panou", Icon: IconPanou },
  { href: "/devize", label: "Devize", Icon: IconDeviz },
  { href: "/facturi", label: "Facturi", Icon: IconFactura },
  { href: "/proiecte", label: "Proiecte", Icon: IconProiect },
  { href: "/clienti", label: "Clienti", Icon: IconClient },
  { href: "/setari", label: "Setari", Icon: IconSetari },
];

/**
 * `/devize` se aprinde si pe `/devize/123/situatii`, dar `/dashboard` numai pe
 * el insusi — altfel ar ramane aprins peste tot, fiind prefixul nimanui.
 */
function useIsActive() {
  const pathname = usePathname();

  return (href: string) => {
    if (href === "/dashboard") return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };
}

/** Bara verticala de pe ecran lat. */
export function NavLinks() {
  const isActive = useIsActive();

  return (
    <nav aria-label="Navigare principala">
      <ul className="flex flex-col px-2.5 py-1">
        {LINKS.map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <li key={href} className="w-full">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`rail-item ${active ? "rail-item-active" : "rail-item-idle"}`}
              >
                <Icon className="h-[22px] w-[22px]" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Bara de tab-uri de pe telefon.
 *
 * Cele sase sectiuni incap pe un rand chiar si pe un ecran de 360px, deci nu se
 * ascunde niciuna intr-un meniu "mai mult": pe santier se sare des intre deviz
 * si factura, iar o sectiune ascunsa inseamna doua atingeri in loc de una.
 */
export function BottomNav() {
  const isActive = useIsActive();

  return (
    <nav
      aria-label="Navigare principala"
      className="bara-jos fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--rail)] lg:hidden"
    >
      <ul className="grid h-16 grid-cols-6">
        {LINKS.map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`tab-item ${active ? "tab-item-activ" : ""}`}
              >
                <span className="tab-pastila">
                  <Icon className="h-[21px] w-[21px]" />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
