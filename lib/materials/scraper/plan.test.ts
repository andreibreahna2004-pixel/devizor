import { describe, expect, it } from "vitest";
import {
  type TermenDeScanat,
  ordoneazaPlanul,
  taiePlanul,
  termeniCareIncap,
  vechimeaDinCatalog,
} from "./plan";

function t(termen: string, zile: number | null, um = "sac"): TermenDeScanat {
  return {
    termen,
    um,
    ultimaObservatie:
      zile === null ? null : new Date(Date.now() - zile * 24 * 3600 * 1000),
  };
}

describe("ordoneazaPlanul", () => {
  it("pune intii ce n-a fost cerut niciodata", () => {
    const plan = ordoneazaPlanul([t("ciment", 1), t("gresie", null), t("amorsa", 5)]);
    expect(plan.map((x) => x.termen)).toEqual(["gresie", "amorsa", "ciment"]);
  });

  it("apoi cele mai vechi", () => {
    const plan = ordoneazaPlanul([t("a", 1), t("b", 30), t("c", 7)]);
    expect(plan.map((x) => x.termen)).toEqual(["b", "c", "a"]);
  });

  it("la egalitate ordoneaza alfabetic, ca planul sa fie reproductibil", () => {
    // Doua rulari peste aceleasi date trebuie sa dea acelasi plan, altfel logul
    // unei rulari picate nu se mai poate reproduce.
    const acum = new Date("2026-09-09T00:00:00.000Z");
    const date: TermenDeScanat[] = [
      { termen: "vopsea", um: "buc", ultimaObservatie: acum },
      { termen: "amorsa", um: "buc", ultimaObservatie: acum },
      { termen: "gresie", um: "mp", ultimaObservatie: acum },
    ];
    expect(ordoneazaPlanul(date).map((x) => x.termen)).toEqual([
      "amorsa",
      "gresie",
      "vopsea",
    ]);
    expect(ordoneazaPlanul([...date].reverse()).map((x) => x.termen)).toEqual([
      "amorsa",
      "gresie",
      "vopsea",
    ]);
  });

  it("departajeaza pe unitate cand termenul e acelasi", () => {
    const acum = new Date("2026-09-09T00:00:00.000Z");
    const plan = ordoneazaPlanul([
      { termen: "parchet", um: "pachet", ultimaObservatie: acum },
      { termen: "parchet", um: "mp", ultimaObservatie: acum },
    ]);
    expect(plan.map((x) => x.um)).toEqual(["mp", "pachet"]);
  });

  it("nu schimba lista primita", () => {
    const date = [t("b", 1), t("a", 2)];
    ordoneazaPlanul(date);
    expect(date.map((x) => x.termen)).toEqual(["b", "a"]);
  });
});

describe("taiePlanul", () => {
  it("ia primii n", () => {
    const plan = [t("a", 1), t("b", 2), t("c", 3)];
    expect(taiePlanul(plan, 2).map((x) => x.termen)).toEqual(["a", "b"]);
  });

  it("da tot planul cand bugetul e mai mare", () => {
    expect(taiePlanul([t("a", 1)], 10)).toHaveLength(1);
  });

  it("nu cere nimic la buget zero sau negativ", () => {
    expect(taiePlanul([t("a", 1)], 0)).toEqual([]);
    expect(taiePlanul([t("a", 1)], -3)).toEqual([]);
    expect(taiePlanul([t("a", 1)], NaN)).toEqual([]);
  });
});

describe("termeniCareIncap", () => {
  it("socoteste din ritm si timp, cu rezerva scazuta", () => {
    // 300s pe Vercel, 60s rezerva, 2s pauza si 8s timeout: (240)/(2+2) = 60.
    expect(termeniCareIncap(300_000, 2000, 8000)).toBe(60);
  });

  it("da zero cand rezerva inghite tot bugetul", () => {
    expect(termeniCareIncap(60_000, 2000, 8000)).toBe(0);
    expect(termeniCareIncap(30_000, 2000, 8000)).toBe(0);
  });

  it("nu imparte la zero cand pauza e zero", () => {
    expect(termeniCareIncap(300_000, 0, 8000)).toBeGreaterThan(0);
  });
});

describe("vechimeaDinCatalog", () => {
  const potriveste = (nume: string, termen: string) =>
    termen.split(" ").every((c) => nume.toLowerCase().includes(c));

  const ZI = (s: string) => new Date(s + "T00:00:00.000Z");

  it("cere si potrivirea unitatii, nu doar a denumirii", () => {
    // Acelasi parchet exista in catalog si pe mp si pe pachet. Daca s-ar lua
    // oricare, termenul de pe mp ar parea proaspat pentru ca s-a citit cel pe
    // pachet, si n-ar mai fi cerut niciodata.
    const materiale = [
      { id: "m1", name: "Parchet laminat 8 mm", unit: "pachet" },
      { id: "m2", name: "Parchet laminat 8 mm", unit: "mp" },
    ];
    const ultima = new Map<string, Date | null>([
      ["m1", ZI("2026-09-09")],
      ["m2", null],
    ]);

    const plan = vechimeaDinCatalog(
      [{ termen: "parchet laminat", um: "mp" }],
      materiale,
      ultima,
      potriveste,
    );

    expect(plan[0].ultimaObservatie).toBeNull();
  });

  it("ia cea mai recenta dintre materialele potrivite", () => {
    // Cu prima gasita, un material vechi ar tine termenul in capul cozii la
    // infinit si trecerea zilnica ar reciti mereu acelasi lucru.
    const materiale = [
      { id: "m1", name: "Adeziv gresie 25 kg", unit: "sac" },
      { id: "m2", name: "Adeziv gresie flexibil", unit: "sac" },
    ];
    const ultima = new Map<string, Date | null>([
      ["m1", ZI("2026-08-01")],
      ["m2", ZI("2026-09-09")],
    ]);

    const plan = vechimeaDinCatalog(
      [{ termen: "adeziv gresie", um: "sac" }],
      materiale,
      ultima,
      potriveste,
    );

    expect(plan[0].ultimaObservatie).toEqual(ZI("2026-09-09"));
  });

  it("da null cand niciun material nu se potriveste", () => {
    const plan = vechimeaDinCatalog(
      [{ termen: "nu exista", um: "sac" }],
      [{ id: "m1", name: "Ciment", unit: "sac" }],
      new Map([["m1", ZI("2026-09-09")]]),
      potriveste,
    );
    expect(plan[0].ultimaObservatie).toBeNull();
  });

  it("da null cand materialul se potriveste dar n-are nicio observatie", () => {
    const plan = vechimeaDinCatalog(
      [{ termen: "ciment", um: "sac" }],
      [{ id: "m1", name: "Ciment", unit: "sac" }],
      new Map([["m1", null]]),
      potriveste,
    );
    expect(plan[0].ultimaObservatie).toBeNull();
  });

  it("pastreaza toti termenii ceruti, si in ordinea primita", () => {
    // Ordonarea e treaba lui `ordoneazaPlanul`; aici nu se pierde si nu se
    // rearanjeaza nimic, altfel bugetul s-ar aplica pe alta lista.
    const plan = vechimeaDinCatalog(
      [
        { termen: "b", um: "sac" },
        { termen: "a", um: "sac" },
      ],
      [],
      new Map(),
      potriveste,
    );
    expect(plan.map((p) => p.termen)).toEqual(["b", "a"]);
  });
});
