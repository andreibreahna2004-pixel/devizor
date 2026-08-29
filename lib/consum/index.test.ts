import { describe, expect, it } from "vitest";
import { CATEGORII, RETETE, cautaRetete, getReteta } from "./index";

/**
 * Integritatea datelor de consum.
 *
 * La 121 de retete si aproape 400 de rinduri de material, verificarea cu ochiul
 * nu scaleaza: testele astea sunt singurul lucru care tine datele curate cind se
 * adauga o reteta noua. Aceeasi grija ca la indicatoarele de norme.
 */

const UM_LUCRARE = ["mp", "mc", "ml", "buc", "to", "punct", "mc beton"];
const UM_MATERIAL = ["kg", "l", "buc", "mp", "ml", "mc", "to", "ml tub"];

describe("datele de consum", () => {
  it("are cel putin 100 de retete", () => {
    expect(RETETE.length).toBeGreaterThanOrEqual(100);
  });

  it("nu are id-uri duplicate", () => {
    const ids = RETETE.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("foloseste numai unitati cunoscute", () => {
    for (const reteta of RETETE) {
      expect(UM_LUCRARE, `${reteta.id}: um lucrare`).toContain(reteta.um);
      for (const material of reteta.materiale) {
        expect(UM_MATERIAL, `${reteta.id} / ${material.denumire}`).toContain(material.um);
      }
    }
  });

  it("fiecare reteta are denumire, categorie si cel putin un material", () => {
    for (const reteta of RETETE) {
      expect(reteta.denumire.length, reteta.id).toBeGreaterThan(3);
      expect(reteta.categorie.length, reteta.id).toBeGreaterThan(2);
      expect(reteta.materiale.length, reteta.id).toBeGreaterThan(0);
    }
  });

  it("fiecare material are exact o forma de consum", () => {
    // Doua forme deodata ar face rezultatul dependent de ordinea din cod, si
    // niciuna ar face materialul sa dispara tacut din tabel.
    for (const reteta of RETETE) {
      for (const material of reteta.materiale) {
        const forme = [material.consum, material.peMm, material.peVarianta].filter(Boolean);
        expect(forme.length, `${reteta.id} / ${material.denumire}`).toBe(1);
      }
    }
  });

  it("fiecare interval are min mai mic sau egal cu max", () => {
    for (const reteta of RETETE) {
      for (const material of reteta.materiale) {
        for (const interval of [material.consum, material.peMm]) {
          if (!interval) continue;
          expect(interval[0], `${reteta.id} / ${material.denumire}`).toBeLessThanOrEqual(interval[1]);
          expect(interval[0], `${reteta.id} / ${material.denumire}`).toBeGreaterThan(0);
        }
        for (const [eticheta, interval] of Object.entries(material.peVarianta ?? {})) {
          expect(interval[0], `${reteta.id} / ${eticheta}`).toBeLessThanOrEqual(interval[1]);
          expect(interval[0], `${reteta.id} / ${eticheta}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("variantele acopera exact optiunile parametrului", () => {
    for (const reteta of RETETE) {
      for (const material of reteta.materiale) {
        if (!material.peVarianta) continue;
        expect(reteta.parametru?.cheie, reteta.id).toBe("varianta");
        expect(Object.keys(material.peVarianta).sort()).toEqual(
          [...(reteta.parametru?.optiuni ?? [])].sort(),
        );
      }
    }
  });

  it("consumul pe milimetru apare numai unde exista parametru de grosime", () => {
    for (const reteta of RETETE) {
      for (const material of reteta.materiale) {
        if (!material.peMm) continue;
        expect(reteta.parametru?.cheie, `${reteta.id} / ${material.denumire}`).toBe("grosime");
      }
    }
  });

  it("fiecare cifra isi spune sursa", () => {
    // Fara asta, un numar intra in baza fara sa spuna de unde vine, si nimeni
    // nu mai poate verifica daca e o fisa tehnica sau o parere.
    for (const reteta of RETETE) {
      for (const material of reteta.materiale) {
        expect(material.sursa, `${reteta.id} / ${material.denumire}`).toBeTruthy();
        const valida =
          material.sursa.startsWith("https://") || material.sursa === "practica curenta";
        expect(valida, `${reteta.id} / ${material.denumire}: ${material.sursa}`).toBe(true);
      }
    }
  });

  it("ambalajele au continut pozitiv", () => {
    for (const reteta of RETETE) {
      for (const material of reteta.materiale) {
        if (!material.ambalaj) continue;
        expect(material.ambalaj.continut, `${reteta.id} / ${material.denumire}`).toBeGreaterThan(0);
        expect(material.ambalaj.um.length).toBeGreaterThan(0);
      }
    }
  });

  it("rezerva implicita e intre 0 si 20 la suta", () => {
    for (const reteta of RETETE) {
      expect(reteta.rezervaImplicita, reteta.id).toBeGreaterThanOrEqual(0);
      expect(reteta.rezervaImplicita, reteta.id).toBeLessThanOrEqual(20);
    }
  });

  it("acopera capitolele mari de lucrari", () => {
    expect(CATEGORII.length).toBeGreaterThanOrEqual(10);
    for (const capitol of ["Zidarii", "Acoperis", "Termoizolatii", "Pardoseli"]) {
      expect(CATEGORII).toContain(capitol);
    }
  });
});

describe("cautaRetete", () => {
  it("gaseste dupa denumire, fara diacritice", () => {
    const rezultate = cautaRetete("zidarie bca");
    expect(rezultate.length).toBeGreaterThan(0);
    expect(rezultate.every((r) => r.denumire.toLowerCase().includes("bca"))).toBe(true);
  });

  it("trece peste diacriticele scrise de om", () => {
    expect(cautaRetete("tâmplărie").length).toBeGreaterThan(0);
    expect(cautaRetete("hidroizolație").length).toBeGreaterThan(0);
  });

  it("cauta si in denumirile materialelor", () => {
    // Cine scrie "adeziv" vrea sa vada unde intra adeziv, nu doar lucrarile
    // care au cuvintul in titlu.
    const rezultate = cautaRetete("adeziv");
    expect(rezultate.length).toBeGreaterThan(3);
    expect(rezultate.some((r) => r.id === "gresie-pardoseala")).toBe(true);
  });

  it("cere toate cuvintele, nu doar unul", () => {
    const larg = cautaRetete("beton");
    const ingust = cautaRetete("beton armat");
    expect(ingust.length).toBeLessThan(larg.length);
  });

  it("intoarce lista goala cind nu gaseste nimic", () => {
    expect(cautaRetete("zzzz nimic")).toHaveLength(0);
  });
});

describe("getReteta", () => {
  it("gaseste dupa id", () => {
    expect(getReteta("gresie-pardoseala")?.um).toBe("mp");
  });

  it("intoarce null pentru un id inexistent", () => {
    expect(getReteta("nu-exista")).toBeNull();
  });
});
