import { describe, expect, it } from "vitest";
import type { Reteta } from "./index";
import { calculeazaConsum, cereAlegere } from "./calcul";
import { getReteta } from "./index";

const fix: Reteta = {
  id: "test-fix",
  denumire: "Lucrare de proba",
  categorie: "Proba",
  um: "mp",
  materiale: [
    {
      denumire: "Adeziv",
      um: "kg",
      consum: [4, 5],
      ambalaj: { um: "sac 25 kg", continut: 25 },
      sursa: "practica curenta",
    },
    { denumire: "Amorsa", um: "l", consum: [0.1, 0.2], sursa: "practica curenta" },
  ],
  rezervaImplicita: 10,
};

const peMm: Reteta = {
  id: "test-mm",
  denumire: "Lucrare pe grosime",
  categorie: "Proba",
  um: "mp",
  parametru: { cheie: "grosime", eticheta: "Grosimea", implicit: 10, sufix: "mm" },
  materiale: [{ denumire: "Mortar", um: "kg", peMm: [1.4, 1.6], sursa: "practica curenta" }],
  rezervaImplicita: 5,
};

const peVarianta: Reteta = {
  id: "test-varianta",
  denumire: "Lucrare pe variante",
  categorie: "Proba",
  um: "mp",
  parametru: { cheie: "varianta", eticheta: "Placa", optiuni: ["mica", "mare"] },
  materiale: [
    {
      denumire: "Adeziv",
      um: "kg",
      peVarianta: { mica: [2, 3], mare: [6, 8] },
      sursa: "practica curenta",
    },
  ],
  rezervaImplicita: 10,
};

describe("calculeazaConsum", () => {
  it("inmulteste consumul fix cu cantitatea", () => {
    const [adeziv, amorsa] = calculeazaConsum(fix, { cantitate: 10, rezervaProcent: 0 });

    expect(adeziv.netMin).toBe(40);
    expect(adeziv.netMax).toBe(50);
    expect(amorsa.netMin).toBe(1);
    expect(amorsa.netMax).toBe(2);
  });

  it("adauga rezerva peste cantitatea neta", () => {
    const [adeziv] = calculeazaConsum(fix, { cantitate: 10, rezervaProcent: 10 });

    expect(adeziv.netMin).toBe(40);
    expect(adeziv.min).toBe(44);
    expect(adeziv.max).toBe(55);
  });

  it("rotunjeste ambalajele in sus, nu la cel mai apropiat", () => {
    // 44 kg = 1,76 saci, deci 2. Un sac cumparat pe jumatate tot un sac e.
    const [adeziv] = calculeazaConsum(fix, { cantitate: 10, rezervaProcent: 10 });
    expect(adeziv.ambalajeMin).toBe(2);
    expect(adeziv.ambalajeMax).toBe(3);
    expect(adeziv.ambalajUm).toBe("sac 25 kg");
  });

  it("nu inventeaza ambalaje pentru materialele vindute in vrac", () => {
    const [, amorsa] = calculeazaConsum(fix, { cantitate: 10, rezervaProcent: 0 });
    expect(amorsa.ambalajeMin).toBeNull();
    expect(amorsa.ambalajUm).toBeNull();
  });

  it("scaleaza consumul pe milimetru cu grosimea", () => {
    const subtire = calculeazaConsum(peMm, { cantitate: 10, grosime: 5, rezervaProcent: 0 });
    const gros = calculeazaConsum(peMm, { cantitate: 10, grosime: 20, rezervaProcent: 0 });

    expect(subtire[0].netMin).toBe(70);
    expect(gros[0].netMin).toBe(280);
    // De patru ori grosimea inseamna de patru ori materialul.
    expect(gros[0].netMin / subtire[0].netMin).toBe(4);
  });

  it("nu intoarce nimic pentru un consum pe milimetru fara grosime", () => {
    // Zero ar fi citit ca "nu ai nevoie", si ar fi fals.
    expect(calculeazaConsum(peMm, { cantitate: 10, rezervaProcent: 0 })).toHaveLength(0);
    expect(calculeazaConsum(peMm, { cantitate: 10, grosime: 0, rezervaProcent: 0 })).toHaveLength(0);
  });

  it("alege consumul dupa varianta ceruta", () => {
    const mica = calculeazaConsum(peVarianta, { cantitate: 10, varianta: "mica", rezervaProcent: 0 });
    const mare = calculeazaConsum(peVarianta, { cantitate: 10, varianta: "mare", rezervaProcent: 0 });

    expect(mica[0].netMin).toBe(20);
    expect(mare[0].netMin).toBe(60);
  });

  it("nu intoarce nimic pentru o varianta nealeasa sau inexistenta", () => {
    expect(calculeazaConsum(peVarianta, { cantitate: 10, rezervaProcent: 0 })).toHaveLength(0);
    expect(
      calculeazaConsum(peVarianta, { cantitate: 10, varianta: "urias", rezervaProcent: 0 }),
    ).toHaveLength(0);
  });

  it("rotunjeste cantitatile la doua zecimale", () => {
    const [, amorsa] = calculeazaConsum(fix, { cantitate: 3.33, rezervaProcent: 7 });
    expect(amorsa.netMin).toBe(0.33);
    expect(amorsa.min).toBe(0.35);
  });
});

describe("cereAlegere", () => {
  it("nu cere nimic la retetele fara parametru", () => {
    expect(cereAlegere(fix, { cantitate: 10, rezervaProcent: 0 })).toBe(false);
  });

  it("cere grosimea cind lipseste", () => {
    expect(cereAlegere(peMm, { cantitate: 10, rezervaProcent: 0 })).toBe(true);
    expect(cereAlegere(peMm, { cantitate: 10, grosime: 12, rezervaProcent: 0 })).toBe(false);
  });

  it("cere varianta cind lipseste", () => {
    expect(cereAlegere(peVarianta, { cantitate: 10, rezervaProcent: 0 })).toBe(true);
    expect(cereAlegere(peVarianta, { cantitate: 10, varianta: "mica", rezervaProcent: 0 })).toBe(false);
  });
});

describe("pe date reale", () => {
  it("40 mp de gresie 60x120 cu rezerva 10% cer 9-11 saci de adeziv", () => {
    const reteta = getReteta("gresie-pardoseala");
    expect(reteta).not.toBeNull();

    const rezultat = calculeazaConsum(reteta!, {
      cantitate: 40,
      varianta: "60x120",
      rezervaProcent: 10,
    });
    const adeziv = rezultat.find((m) => m.denumire.includes("Adeziv"));

    // 5-6 kg/mp x 40 mp = 200-240 kg, plus 10% = 220-264 kg, adica 9-11 saci.
    expect(adeziv?.min).toBe(220);
    expect(adeziv?.max).toBe(264);
    expect(adeziv?.ambalajeMin).toBe(9);
    expect(adeziv?.ambalajeMax).toBe(11);
  });

  it("un mp de tencuiala de 12 mm cere 16,8-19,2 kg de mortar", () => {
    const reteta = getReteta("tencuiala-interior");
    const rezultat = calculeazaConsum(reteta!, { cantitate: 1, grosime: 12, rezervaProcent: 0 });
    const mortar = rezultat.find((m) => m.denumire.includes("Mortar"));

    expect(mortar?.netMin).toBe(16.8);
    expect(mortar?.netMax).toBe(19.2);
  });
});
