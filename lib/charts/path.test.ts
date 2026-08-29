import { describe, expect, it } from "vitest";
import { areaPath, scaleaza, smoothPath } from "./path";

/**
 * Ce se verifica aici e ca graficul nu deseneaza valori care nu exista in date.
 * O curba care depaseste intre doua puncte arata o luna cu incasari negative
 * sau un virf care nu s-a intimplat — pe un panou financiar, asta e o eroare de
 * continut, nu de stil.
 */

/** Puncte de pe curba, esantionate din traseul SVG cu un canvas de geometrie. */
function esantioneazaY(d: string, pasi = 40): number[] {
  // Bezierul cubic se evalueaza direct din comenzile "C": nu avem nevoie de DOM.
  const comenzi = d.match(/[MC][^MC]*/g) ?? [];
  let curent: [number, number] = [0, 0];
  const y: number[] = [];

  for (const comanda of comenzi) {
    const n = (comanda.slice(1).match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

    if (comanda[0] === "M") {
      curent = [n[0], n[1]];
      y.push(n[1]);
      continue;
    }

    const [c1x, c1y, c2x, c2y, x, yy] = n;
    for (let i = 1; i <= pasi; i++) {
      const t = i / pasi;
      const u = 1 - t;
      y.push(
        u * u * u * curent[1] +
          3 * u * u * t * c1y +
          3 * u * t * t * c2y +
          t * t * t * yy,
      );
    }
    void c1x;
    void c2x;
    curent = [x, yy];
  }

  return y;
}

describe("smoothPath", () => {
  it("nu deseneaza nimic pentru o lista goala", () => {
    expect(smoothPath([])).toBe("");
  });

  it("uneste doua puncte cu o linie dreapta, fara curba", () => {
    const d = smoothPath([
      { x: 0, y: 10 },
      { x: 10, y: 20 },
    ]);
    expect(d).toBe("M 0 10 L 10 20");
  });

  it("trece exact prin fiecare punct dat", () => {
    const puncte = [
      { x: 0, y: 50 },
      { x: 10, y: 20 },
      { x: 20, y: 80 },
      { x: 30, y: 35 },
    ];
    const d = smoothPath(puncte);

    for (const p of puncte) {
      expect(d).toContain(`${p.x} ${p.y}`);
    }
  });

  it("nu coboara sub minimul datelor intre doua puncte", () => {
    // Cazul care rupe o spline obisnuita: salt de la zero la o valoare mare si
    // inapoi. Catmull-Rom ar trage curba sub zero inainte de virf.
    const puncte = [
      { x: 0, y: 100 },
      { x: 10, y: 100 },
      { x: 20, y: 0 },
      { x: 30, y: 100 },
      { x: 40, y: 100 },
    ];

    const y = esantioneazaY(smoothPath(puncte));
    const min = Math.min(...y);
    const max = Math.max(...y);

    // In SVG y creste in jos: 0 e virful, 100 e baza.
    expect(min).toBeGreaterThanOrEqual(-0.001);
    expect(max).toBeLessThanOrEqual(100.001);
  });

  it("ramine monotona pe o serie crescatoare", () => {
    const puncte = [
      { x: 0, y: 100 },
      { x: 10, y: 90 },
      { x: 20, y: 30 },
      { x: 30, y: 28 },
      { x: 40, y: 5 },
    ];

    const y = esantioneazaY(smoothPath(puncte));
    for (let i = 1; i < y.length; i++) {
      expect(y[i]).toBeLessThanOrEqual(y[i - 1] + 0.001);
    }
  });

  it("tine linia dreapta cind toate valorile sint egale", () => {
    const puncte = [0, 1, 2, 3, 4].map((i) => ({ x: i * 10, y: 42 }));
    const y = esantioneazaY(smoothPath(puncte));
    for (const v of y) expect(v).toBeCloseTo(42, 6);
  });
});

describe("areaPath", () => {
  it("inchide traseul pe linia de baza", () => {
    const d = areaPath(
      [
        { x: 0, y: 10 },
        { x: 10, y: 20 },
        { x: 20, y: 5 },
      ],
      40,
    );
    expect(d.endsWith("L 20 40 L 0 40 Z")).toBe(true);
  });

  it("nu deseneaza nimic pentru o lista goala", () => {
    expect(areaPath([], 40)).toBe("");
  });
});

describe("scaleaza", () => {
  it("intinde valorile pe toata latimea", () => {
    const p = scaleaza([1, 2, 3], 100, 50);
    expect(p[0].x).toBe(0);
    expect(p[2].x).toBe(100);
  });

  it("pune maximul sus si minimul jos", () => {
    const p = scaleaza([0, 10], 100, 50);
    expect(p[1].y).toBeLessThan(p[0].y);
  });

  it("aseaza linia jos, pe zero, cind toata seria e zero", () => {
    // O luna fara documente trebuie sa se vada ca zero, nu ca o linie prin
    // mijlocul casetei. Fara cazul asta, impartirea la interval zero ar da NaN
    // si traseul ar deveni "M 0 NaN", adica nimic desenat.
    const p = scaleaza([0, 0, 0], 100, 50);
    for (const punct of p) {
      expect(Number.isFinite(punct.y)).toBe(true);
      expect(punct.y).toBe(50);
    }
  });

  it("tine baza la zero, nu la minimul seriei", () => {
    // Doua valori apropiate si mari nu au voie sa umple caseta: diferenta de
    // 2% intre ele trebuie sa se vada ca 2%, nu ca un munte.
    const p = scaleaza([100, 102], 100, 100);
    const diferenta = Math.abs(p[0].y - p[1].y);
    expect(diferenta).toBeLessThan(5);
  });

  it("duce sus valorile egale si pozitive, fiindca egaleaza maximul", () => {
    const p = scaleaza([7, 7, 7], 100, 50);
    for (const punct of p) expect(punct.y).toBe(0);
  });

  it("scaleaza pe maximul impus, ca doua serii sa fie comparabile", () => {
    const mica = scaleaza([0, 10], 100, 50, 0, 100);
    const mare = scaleaza([0, 100], 100, 50, 0, 100);
    // Seria mica trebuie sa ramina jos, nu sa umple caseta ca cea mare.
    expect(mica[1].y).toBeGreaterThan(mare[1].y);
  });
});

describe("scaleaza cu minim impus", () => {
  it("implicit pastreaza baza la zero, ca pe panou", () => {
    const p = scaleaza([100, 102], 100, 50);
    // Variatie de 2% peste o baza de zero: punctele raman aproape lipite sus.
    expect(Math.abs(p[0].y - p[1].y)).toBeLessThan(2);
  });

  it("cu minim impus, o variatie mica devine vizibila", () => {
    // Pretul unui material: 320 -> 340 e 6%, si trebuie sa se vada.
    const p = scaleaza([320, 340], 100, 50, 0, 340, 310);
    expect(Math.abs(p[0].y - p[1].y)).toBeGreaterThan(20);
  });

  it("minimul impus aseaza valoarea egala cu el pe podea", () => {
    const p = scaleaza([310, 340], 100, 50, 0, 340, 310);
    expect(p[0].y).toBe(50);
    expect(p[1].y).toBe(0);
  });

  it("nu schimba nimic pentru apelurile existente", () => {
    expect(scaleaza([0, 10, 5], 100, 40, 0)).toEqual(scaleaza([0, 10, 5], 100, 40, 0, undefined, undefined));
  });
});
