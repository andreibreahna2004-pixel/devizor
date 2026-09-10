import { describe, expect, it } from "vitest";
import {
  type ObservatieMagazin,
  PRAG_IMPRASTIERE,
  agregatPentruUnitate,
  agregatePentruTermen,
  mediana,
  observatiiDinCatalog,
  potrivesteTermen,
} from "./agregat";

const ZI = new Date("2026-09-09T00:00:00.000Z");

function obs(
  magazin: string,
  price: number,
  unit = "mp",
  peste: Partial<ObservatieMagazin> = {},
): ObservatieMagazin {
  return {
    name: `${magazin} ${price}`,
    unit,
    price,
    magazin,
    observedAt: ZI,
    sourceUrl: `https://${magazin.toLowerCase()}.invalid/p/${price}`,
    ...peste,
  };
}

describe("mediana", () => {
  it("da valoarea din mijloc la numar impar", () => {
    expect(mediana([10, 30, 20])).toBe(20);
  });

  it("da media celor doua din mijloc la numar par", () => {
    expect(mediana([10, 20, 30, 40])).toBe(25);
  });

  it("da null pe lista goala", () => {
    expect(mediana([])).toBeNull();
  });

  it("intoarce singurul element cand e unul", () => {
    expect(mediana([87.89])).toBe(87.89);
  });

  it("nu depinde de ordinea de la intrare", () => {
    expect(mediana([40, 10, 30, 20])).toBe(mediana([10, 20, 30, 40]));
  });
});

describe("agregatPentruUnitate", () => {
  it("cintareste la fel un magazin cu multe rezultate si unul cu putine", () => {
    // Cazul care conteaza. Hornbach da 20 de articole scumpe, Dedeman doua
    // ieftine. Mediana peste toate observatiile ar fi in zona Hornbach, adica
    // "media pe doua magazine" ar descrie de fapt asortimentul unuia.
    const multe = Array.from({ length: 20 }, (_, i) => obs("Hornbach", 200 + i));
    const putine = [obs("Dedeman", 88), obs("Dedeman", 92)];

    const a = agregatPentruUnitate([...multe, ...putine], "parchet", "mp")!;

    // Medianele pe magazin: Dedeman 90, Hornbach 209,5. Mediana lor: 149,75.
    expect(a.mediana).toBe(149.75);
    expect(a.nrMagazine).toBe(2);
    expect(a.nrObservatii).toBe(22);

    // Mediana peste toate observatiile ar fi fost peste 200: e chiar greseala
    // pe care un magazin, un vot o previne.
    expect(a.mediana).toBeLessThan(200);
  });

  it("nu amesteca unitatile, si spune cate au ramas afara", () => {
    const date = [
      obs("Dedeman", 88, "mp"),
      obs("Hornbach", 209, "mp"),
      obs("Hornbach", 286.33, "pachet"),
      obs("Brico", 12, "buc"),
    ];

    const a = agregatPentruUnitate(date, "parchet", "mp")!;
    expect(a.nrObservatii).toBe(2);
    expect(a.max).toBe(209);
    // Nu se tace ce n-a intrat: asa arata o medie necinstita.
    expect(a.altaUnitate).toEqual([
      { unit: "pachet", nr: 1 },
      { unit: "buc", nr: 1 },
    ]);
  });

  it("numara magazine distincte, nu observatii", () => {
    const a = agregatPentruUnitate(
      [obs("Dedeman", 10), obs("Dedeman", 20), obs("Dedeman", 30)],
      "ciment",
      "mp",
    )!;
    expect(a.nrMagazine).toBe(1);
    expect(a.nrObservatii).toBe(3);
  });

  it("da extremele din toate observatiile, iar pe magazin din ale magazinului", () => {
    const a = agregatPentruUnitate(
      [obs("Dedeman", 88), obs("Dedeman", 120), obs("Hornbach", 209)],
      "parchet",
      "mp",
    )!;
    expect(a.min).toBe(88);
    expect(a.max).toBe(209);

    const dedeman = a.magazine.find((m) => m.magazin === "Dedeman")!;
    expect(dedeman.min).toBe(88);
    expect(dedeman.max).toBe(120);
    expect(dedeman.mediana).toBe(104);
  });

  it("ridica steagul de imprastiere la prag si nu sub el", () => {
    const laPrag = agregatPentruUnitate(
      [obs("Dedeman", 100), obs("Hornbach", 100 * PRAG_IMPRASTIERE)],
      "parchet",
      "mp",
    )!;
    expect(laPrag.imprastiereMare).toBe(true);

    const subPrag = agregatPentruUnitate(
      [obs("Dedeman", 100), obs("Hornbach", 190)],
      "parchet",
      "mp",
    )!;
    expect(subPrag.imprastiere).toBe(1.9);
    expect(subPrag.imprastiereMare).toBe(false);
  });

  it("da agregat si cu un singur magazin, dar il numara ca unul", () => {
    // Interfata citeste `nrMagazine` ca sa scrie raspicat ca e un pret de la un
    // magazin, nu o piata. Deci contractul trebuie tinut aici.
    const a = agregatPentruUnitate([obs("Dedeman", 88)], "parchet", "mp")!;
    expect(a.nrMagazine).toBe(1);
    expect(a.mediana).toBe(88);
    expect(a.imprastiere).toBe(1);
  });

  it("arunca preturile imposibile", () => {
    const a = agregatPentruUnitate(
      [obs("Dedeman", 0), obs("Dedeman", -5), obs("Hornbach", 100), obs("Brico", 120)],
      "parchet",
      "mp",
    )!;
    expect(a.nrObservatii).toBe(2);
    expect(a.magazine.map((m) => m.magazin)).toEqual(["Brico", "Hornbach"]);
  });

  it("acopera toata fereastra cu celMaiVechi si celMaiNou", () => {
    const vechi = new Date("2026-09-01T00:00:00.000Z");
    const nou = new Date("2026-09-09T00:00:00.000Z");
    const a = agregatPentruUnitate(
      [
        obs("Dedeman", 88, "mp", { observedAt: vechi }),
        obs("Hornbach", 209, "mp", { observedAt: nou }),
      ],
      "parchet",
      "mp",
    )!;
    expect(a.celMaiVechi).toEqual(vechi);
    expect(a.celMaiNou).toEqual(nou);
  });

  it("da ca exemplu articolul cel mai apropiat de mediana magazinului, cu link", () => {
    const a = agregatPentruUnitate(
      [
        obs("Dedeman", 40, "mp", { name: "Ieftin", sourceUrl: "https://d.invalid/ieftin" }),
        obs("Dedeman", 100, "mp", { name: "Mijloc", sourceUrl: "https://d.invalid/mijloc" }),
        obs("Dedeman", 260, "mp", { name: "Scump", sourceUrl: "https://d.invalid/scump" }),
      ],
      "parchet",
      "mp",
    )!;

    const dedeman = a.magazine[0];
    expect(dedeman.mediana).toBe(100);
    expect(dedeman.exemplu.name).toBe("Mijloc");
    // Provenienta la vedere: cifra trebuie sa se poata verifica la sursa.
    expect(dedeman.exemplu.sourceUrl).toBe("https://d.invalid/mijloc");
  });

  it("nu depinde de ordinea observatiilor de la intrare", () => {
    const date = [obs("Hornbach", 209), obs("Dedeman", 88), obs("Brico", 120)];
    const a = agregatPentruUnitate(date, "parchet", "mp")!;
    const b = agregatPentruUnitate([...date].reverse(), "parchet", "mp")!;

    expect(b.mediana).toBe(a.mediana);
    // Si ecranul e acelasi: magazinele ies alfabetic, nu in ordinea sosirii.
    expect(b.magazine.map((m) => m.magazin)).toEqual(a.magazine.map((m) => m.magazin));
    expect(a.magazine.map((m) => m.magazin)).toEqual(["Brico", "Dedeman", "Hornbach"]);
  });

  it("da null cand nu exista nimic pe unitatea cerută", () => {
    expect(agregatPentruUnitate([], "parchet", "mp")).toBeNull();
    expect(agregatPentruUnitate([obs("Dedeman", 12, "buc")], "parchet", "mp")).toBeNull();
  });
});

describe("agregatePentruTermen", () => {
  it("pune prima unitatea cu cele mai multe observatii si nu converteste nimic", () => {
    const date = [
      obs("Dedeman", 88, "mp"),
      obs("Hornbach", 209, "mp"),
      obs("Hornbach", 286.33, "pachet"),
    ];

    const toate = agregatePentruTermen(date, "parchet");
    expect(toate.map((a) => a.unit)).toEqual(["mp", "pachet"]);
    expect(toate[0].nrObservatii).toBe(2);
    expect(toate[1].mediana).toBe(286.33);
  });
});

describe("potrivesteTermen", () => {
  it("cere toate cuvintele, fara diacritice si fara majuscule", () => {
    expect(potrivesteTermen("Adeziv gresie si faianta 25 kg", "adeziv gresie")).toBe(true);
    expect(potrivesteTermen("Plasă din fibră de sticlă", "plasa fibra")).toBe(true);
    expect(potrivesteTermen("Adeziv gresie", "adeziv parchet")).toBe(false);
  });

  it("nu potriveste pe termen gol", () => {
    expect(potrivesteTermen("Orice", "")).toBe(false);
  });

  it("nu confunda grosimile: 5 nu prinde 15", () => {
    // Cazul care conteaza. Ca subsir, "5" se afla in "15", si polistirenul de 5
    // cm ar intra in aceeasi mediana cu cel de 15, la preturi de citeva ori
    // diferite. Nu s-ar arunca nimic si nu s-ar vedea nimic pe ecran.
    expect(potrivesteTermen("Polistiren expandat EPS 5 cm", "polistiren expandat 5")).toBe(true);
    expect(potrivesteTermen("Polistiren expandat EPS 15 cm", "polistiren expandat 5")).toBe(false);
    expect(potrivesteTermen("Polistiren expandat EPS 15 cm", "polistiren expandat 15")).toBe(true);
  });

  it("prinde cifra si cand e lipita de litere sau semne", () => {
    // "12,5" din denumire se rupe in bucatile "12" si "5", deci termenul "12" il
    // gaseste; iar "gips-carton" nu impiedica potrivirea pe "carton".
    expect(potrivesteTermen("Placa de gips-carton 12,5 mm", "gips carton 12")).toBe(true);
    expect(potrivesteTermen("Blocuri BCA 10 cm", "bca 10")).toBe(true);
    expect(potrivesteTermen("Blocuri BCA 100 cm", "bca 10")).toBe(false);
  });
});

describe("observatiiDinCatalog", () => {
  const ZI = new Date("2026-09-09T00:00:00.000Z");

  const materiale = [
    { id: "m1", name: "Parchet laminat 12 mm", unit: "mp" },
    { id: "m2", name: "Adeziv gresie 25 kg", unit: "sac" },
  ];

  it("leaga pretul de materialul lui, cu denumire si unitate", () => {
    const obs = observatiiDinCatalog(materiale, [
      {
        materialId: "m2",
        price: 26.5,
        supplier: "Dedeman",
        sourceUrl: "https://d.invalid/p/1",
        observedAt: ZI,
      },
    ]);

    expect(obs).toHaveLength(1);
    expect(obs[0].name).toBe("Adeziv gresie 25 kg");
    expect(obs[0].unit).toBe("sac");
    expect(obs[0].magazin).toBe("Dedeman");
    expect(obs[0].price).toBe(26.5);
  });

  it("arunca pretul orfan in loc sa-l lege de altcineva", () => {
    // Greseala care ar trece tacut: un pret fara materialul lui, luat cu
    // denumirea si unitatea altuia, ar intra in mediana greșita si nimic n-ar
    // arunca.
    const obs = observatiiDinCatalog(materiale, [
      { materialId: "nu-exista", price: 99, supplier: "Brico", sourceUrl: null, observedAt: ZI },
      { materialId: "m1", price: 88, supplier: "Dedeman", sourceUrl: null, observedAt: ZI },
    ]);

    expect(obs).toHaveLength(1);
    expect(obs[0].name).toBe("Parchet laminat 12 mm");
  });

  it("arunca randurile fara furnizor: n-ar avea cui sa atribuie votul", () => {
    const obs = observatiiDinCatalog(materiale, [
      { materialId: "m1", price: 88, supplier: null, sourceUrl: null, observedAt: ZI },
    ]);
    expect(obs).toEqual([]);
  });

  it("da lista goala pe intrare goala", () => {
    expect(observatiiDinCatalog([], [])).toEqual([]);
    expect(observatiiDinCatalog(materiale, [])).toEqual([]);
  });
});
