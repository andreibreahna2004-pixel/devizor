import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

/**
 * Doua familii, cu roluri separate.
 *
 * Poppins e geometric si rotund — da tonul titlurilor si al navigatiei. Dar are
 * cifre proportionale: intr-o coloana de sume, un "1" ocupa mai putin decit un
 * "8" si cifrele nu se mai aliniaza pe virgula. De aceea tot ce e text de lucru
 * si mai ales tot ce e cifra sta pe Inter, care are cifre tabulare adevarate.
 */
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Devizor — devize si facturi pentru constructii",
    template: "%s · Devizor",
  },
  description:
    "Descrii lucrarea in cuvinte, primesti devizul cu articole, cantitati si preturi. Facturi si e-Factura incluse.",
};

/**
 * `viewportFit: "cover"` lasa pagina sa intre sub crestatura si sub bara de
 * gesturi de pe telefon; fara ea, `env(safe-area-inset-bottom)` raporteaza zero
 * si bara de navigatie de jos ar sta lipita de marginea ecranului.
 *
 * `maximumScale` ramine nescris anume: aplicatia se citeste toata ziua pe
 * santier, iar cine are nevoie sa mareasca trebuie sa poata.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ro" className={`${poppins.variable} ${inter.variable}`} suppressHydrationWarning>
      <body>
        {/* Pune tema pe <html> inainte de prima pictura — vezi lib/theme.ts.
            Sta primul in <body>, deci ruleaza inainte sa se parseze restul
            paginii. `suppressHydrationWarning` pe <html> pentru ca atributul
            `data-theme` e pus de script, nu trimis de server. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
