/**
 * Tema aleasa de om, tinuta in localStorage.
 *
 * Nu sta pe server si nu intra in sesiune: e o preferinta a browserului, nu a
 * contului. Acelasi om poate lucra pe monitorul de la birou ziua si pe laptop
 * seara, si nu vrea aceeasi tema in amindoua.
 */

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "devizor-tema";

/**
 * Scriptul care pune tema pe <html> INAINTE de prima pictura.
 *
 * Ruleaza sincron, in <head>: daca ar astepta hidratarea React, pagina ar
 * aparea o clipa alba si abia apoi s-ar innegri. Tot el rezolva preferinta
 * sistemului, ca paleta intunecata sa fie scrisa o singura data in CSS, nu si
 * intr-un `@media` care ar trebui tinut in sincron cu ea.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var theme =
      stored === "dark" || stored === "light"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    document.documentElement.dataset.theme = theme;
  } catch (e) {
    // Mod privat sau localStorage blocat — tema deschisa e implicita.
    document.documentElement.dataset.theme = "light";
  }
})();
`.trim();
