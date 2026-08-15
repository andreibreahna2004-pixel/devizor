import "server-only";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

/**
 * Fontul documentelor PDF.
 *
 * Fonturile implicite din @react-pdf/renderer (Helvetica) nu au diacriticele
 * romanesti corecte — ș si ț cu virgula dedesubt (U+0219 / U+021B) apar ca
 * patratele goale sau cad pe formele cu sedila, care sunt gresite in romana.
 * Liberation Sans le acopera complet si e inclus in `assets/fonts`.
 */

export const PDF_FONT = "LiberationSans";

let registered = false;

export function registerPdfFonts(): void {
  if (registered) return;

  const dir = path.join(process.cwd(), "assets", "fonts");

  Font.register({
    family: PDF_FONT,
    fonts: [
      { src: path.join(dir, "LiberationSans-Regular.ttf"), fontWeight: 400 },
      { src: path.join(dir, "LiberationSans-Bold.ttf"), fontWeight: 700 },
    ],
  });

  // Fara asta, react-pdf rupe cuvintele lungi in mijloc, iar denumirile de
  // articole din deviz sunt lungi.
  Font.registerHyphenationCallback((word) => [word]);

  registered = true;
}
