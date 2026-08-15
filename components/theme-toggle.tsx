"use client";

import { useEffect, useState } from "react";
import { IconLuna, IconSoare } from "@/components/icons";
import { type Theme, THEME_STORAGE_KEY } from "@/lib/theme";

/**
 * Comutatorul de tema.
 *
 * Starea adevarata sta pe <html data-theme>, pusa de scriptul din layout
 * inainte de prima pictura. Componenta o citeste de acolo dupa montare — nu la
 * randare — pentru ca serverul nu are de unde sti ce tema are browserul, iar o
 * ghicire ar da nepotrivire de hidratare.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Mod privat: tema tine pina la reincarcare, ceea ce e destul.
    }
  }

  // Pina la montare nu stim tema, iar un buton care spune "Intuneric" cind
  // aplicatia e deja intunecata deruteaza. Rezervam locul si atit.
  if (theme === null) {
    return <div className={className ?? "h-10 w-10 lg:h-9 lg:w-9"} aria-hidden="true" />;
  }

  const spreDark = theme === "light";

  return (
    <button
      type="button"
      onClick={toggle}
      title={spreDark ? "Treci pe tema intunecata" : "Treci pe tema deschisa"}
      aria-label={spreDark ? "Treci pe tema intunecata" : "Treci pe tema deschisa"}
      className={
        // Pe telefon butonul e cat un deget; pe ecran lat se strange la marimea
        // de mouse, ca sa nu domine antetul.
        className ??
        "inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 lg:h-9 lg:w-9"
      }
    >
      {spreDark ? <IconLuna className="h-[18px] w-[18px]" /> : <IconSoare className="h-[18px] w-[18px]" />}
    </button>
  );
}
