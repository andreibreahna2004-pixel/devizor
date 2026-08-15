"use client";

import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/app/actions/auth";
import { IconLogout } from "@/components/icons";

/**
 * Meniul de cont din antetul de pe telefon.
 *
 * Pe ecran lat, numele, firma si butonul de iesire au unde sa stea: numele in
 * antet, iesirea la capatul barei verticale. Pe telefon nu incap pe un rand de
 * 360px alaturi de logo si de comutatorul de tema, iar pana acum iesirea din
 * cont pur si simplu nu exista acolo — bara verticala e ascunsa sub `lg`.
 * Initialele deschid restul.
 */
export function UserMenu({
  name,
  email,
  orgName,
  initials,
}: {
  name: string;
  email: string;
  orgName: string;
  initials: string;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  // Escape si atingerea in afara inchid meniul. Ascultatorii se pun doar cat e
  // deschis: pe o pagina de deviz cu multe randuri, un handler global de
  // pointer care ruleaza mereu se simte la derulare.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Contul lui ${name}`}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 font-titlu text-sm font-semibold text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-40 w-60 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5"
          style={{ boxShadow: "var(--shadow-pop)" }}
        >
          <div className="border-b border-[var(--border)] px-3 py-2.5">
            <p className="truncate text-sm font-medium text-ink-900">{name}</p>
            <p className="truncate text-xs text-ink-500">{email}</p>
            <p className="mt-1 truncate text-xs font-medium text-ink-700">
              {orgName}
            </p>
          </div>

          <form action={logoutAction}>
            <button
              type="submit"
              role="menuitem"
              className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-ink-700 hover:bg-ink-50 hover:text-ink-900"
            >
              <IconLogout className="h-[18px] w-[18px]" />
              Iesi din cont
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
