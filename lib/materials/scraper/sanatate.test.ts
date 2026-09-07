import { afterEach, describe, expect, it } from "vitest";
import {
  deAnuntatRobots,
  noteazaRezultat,
  poateFiIntrebat,
  reseteazaSanatate,
} from "./sanatate";

/**
 * Cand se lasa un magazin in pace.
 *
 * Cu patru magazine, unul care nu da niciodata nimic costa la fiecare cautare o
 * pagina, un timeout si, la capat, un apel de model. Racirea e ce face ca greseala
 * sa fie ieftina.
 */

afterEach(() => {
  reseteazaSanatate();
  delete process.env.SCRAPER_RACIRE_MS;
});

describe("sanatatea magazinelor", () => {
  it("intreaba un magazin nou", () => {
    expect(poateFiIntrebat("hornbach")).toBe(true);
  });

  it("mai incearca de doua ori dupa un gol", () => {
    noteazaRezultat("hornbach", "gol");
    expect(poateFiIntrebat("hornbach")).toBe(true);
    noteazaRezultat("hornbach", "gol");
    expect(poateFiIntrebat("hornbach")).toBe(true);
  });

  it("il lasa in pace dupa al treilea gol la rand", () => {
    for (let i = 0; i < 3; i++) noteazaRezultat("hornbach", "gol");
    expect(poateFiIntrebat("hornbach")).toBe(false);
  });

  it("il intreaba din nou dupa ce trece racirea", () => {
    process.env.SCRAPER_RACIRE_MS = "1000";
    const acum = 1_000_000;
    for (let i = 0; i < 3; i++) noteazaRezultat("hornbach", "gol", acum);

    expect(poateFiIntrebat("hornbach", acum + 500)).toBe(false);
    expect(poateFiIntrebat("hornbach", acum + 1500)).toBe(true);
  });

  it("uita esecurile dupa o reusita", () => {
    noteazaRezultat("hornbach", "gol");
    noteazaRezultat("hornbach", "gol");
    noteazaRezultat("hornbach", "reusit");
    noteazaRezultat("hornbach", "gol");

    expect(poateFiIntrebat("hornbach")).toBe(true);
  });

  it("intra in racire imediat cand magazinul blocheaza", () => {
    // 403 sau 429 nu e o cadere trecatoare: e un raspuns. Insistenta n-aduce
    // produse.
    noteazaRezultat("hornbach", "blocat");
    expect(poateFiIntrebat("hornbach")).toBe(false);
  });

  it("tine socoteala separat pentru fiecare magazin", () => {
    for (let i = 0; i < 3; i++) noteazaRezultat("hornbach", "gol");

    expect(poateFiIntrebat("hornbach")).toBe(false);
    expect(poateFiIntrebat("dedeman")).toBe(true);
  });

  it("anunta interdictia din robots o singura data", () => {
    // Altfel, cu patru magazine si o cautare pe minut, logul devine zgomot.
    expect(deAnuntatRobots("dedeman")).toBe(true);
    expect(deAnuntatRobots("dedeman")).toBe(false);
    expect(deAnuntatRobots("hornbach")).toBe(true);
  });
});
