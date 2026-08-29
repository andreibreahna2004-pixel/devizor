import { describe, expect, it } from "vitest";
import { aduna, bucketsFor, delta, ultima } from "./buckets";

/**
 * Bucketarea a fost mutata din `lib/dashboard/metrics.ts`, unde era privata si
 * `server-only`. Aici se testeaza direct, fara baza de date — si se fixeaza
 * diferenta dintre bani (se aduna) si preturi (nu se aduna, se poarta mai
 * departe).
 */

const acum = new Date(2026, 7, 28, 15, 0, 0); // 28 august 2026

describe("bucketsFor", () => {
  it("da granularitatea potrivita lungimii perioadei", () => {
    expect(bucketsFor("1L", acum)).toHaveLength(30); // zile
    expect(bucketsFor("3L", acum)).toHaveLength(13); // saptamini
    expect(bucketsFor("6L", acum)).toHaveLength(6); // luni
    expect(bucketsFor("1A", acum)).toHaveLength(12);
  });

  it("ultimul interval contine ziua curenta", () => {
    for (const range of ["1L", "3L", "6L", "1A"] as const) {
      const b = bucketsFor(range, acum);
      expect(b[b.length - 1].start.getTime()).toBeLessThanOrEqual(acum.getTime());
    }
  });

  it("intervalele sunt in ordine crescatoare", () => {
    const b = bucketsFor("1A", acum);
    for (let i = 1; i < b.length; i++) {
      expect(b[i].start.getTime()).toBeGreaterThan(b[i - 1].start.getTime());
    }
  });
});

describe("aduna — pentru bani", () => {
  const buckets = bucketsFor("6L", acum);

  it("insumeaza ce cade in acelasi interval", () => {
    const luna = buckets[buckets.length - 1].start;
    const sume = aduna(
      [
        { data: new Date(luna.getTime() + 3600e3), valoare: 100 },
        { data: new Date(luna.getTime() + 7200e3), valoare: 50.5 },
      ],
      buckets,
    );
    expect(sume[sume.length - 1]).toBe(150.5);
  });

  it("ignora ce e mai vechi decat primul interval", () => {
    const vechi = new Date(buckets[0].start.getTime() - 86400e3 * 40);
    const sume = aduna([{ data: vechi, valoare: 999 }], buckets);
    expect(sume.reduce((s, v) => s + v, 0)).toBe(0);
  });

  it("un interval fara documente ramane zero", () => {
    expect(aduna([], buckets)).toEqual(new Array(buckets.length).fill(0));
  });
});

describe("ultima — pentru preturi", () => {
  const buckets = bucketsFor("6L", acum);

  it("nu aduna doua observatii din aceeasi luna: pretul nu se dubleaza", () => {
    const luna = buckets[buckets.length - 1].start;
    const v = ultima(
      [
        { data: new Date(luna.getTime() + 3600e3), valoare: 320 },
        { data: new Date(luna.getTime() + 7200e3), valoare: 340 },
      ],
      buckets,
    );
    expect(v[v.length - 1]).toBe(340); // ultima observatie, nu 660
  });

  it("poarta ultimul pret peste lunile fara observatii", () => {
    const v = ultima([{ data: buckets[1].start, valoare: 300 }], buckets);
    expect(v[1]).toBe(300);
    expect(v[v.length - 1]).toBe(300); // nimeni n-a masurat, dar pretul exista
  });

  it("nu deseneaza nimic inaintea primei masuratori", () => {
    const v = ultima([{ data: buckets[3].start, valoare: 300 }], buckets);
    expect(v[0]).toBeNull();
    expect(v[2]).toBeNull();
    expect(v[3]).toBe(300);
  });

  it("o observatie dinaintea ferestrei da pretul de pornire", () => {
    const inainte = new Date(buckets[0].start.getTime() - 86400e3 * 10);
    const v = ultima([{ data: inainte, valoare: 280 }], buckets);
    expect(v[0]).toBe(280);
  });

  it("fara nicio observatie nu inventeaza niciun punct", () => {
    expect(ultima([], buckets)).toEqual(new Array(buckets.length).fill(null));
  });
});

describe("delta", () => {
  it("crestere procentuala fata de perioada anterioara", () => {
    expect(delta(120, 100)).toBe(20);
    expect(delta(80, 100)).toBe(-20);
  });

  it("de la zero nu exista procent, deci null", () => {
    expect(delta(50, 0)).toBeNull();
    expect(delta(0, 0)).toBe(0);
  });
});
