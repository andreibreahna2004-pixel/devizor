import { describe, expect, it } from "vitest";
import { mapToolCall, pricelessLines, unknownNormCodes } from "./map-tool-output";
import { TOOL_NAMES } from "./tools";

/**
 * Aici se decide ce ajunge in fata omului ca linie de deviz, deci merita
 * acoperit direct. Doua reguli se verifica in continuare: denumirea unei linii
 * cu cod oficial vine din indicator, nu de la model, iar preturile intra ca
 * propuneri de verificat.
 */

function addLines(linii: unknown[], sectiune = "Suprastructura") {
  return { sectiune, linii };
}

const tencuiala = {
  denumire: "Tencuiala mecanizata cu gips la interior",
  um: "mp",
  cantitate: 220,
  pret_material: 14.42,
  pret_manopera: 15.4,
  justificare: "pereti 180 mp + tavane 40 mp",
  incredere: "mare",
};

/** Lucrare cu utilaj si transport: sapatura mecanica cu evacuare. */
const sapatura = {
  denumire: "Sapatura mecanica in spatii limitate",
  um: "mc",
  cantitate: 34.5,
  pret_material: 0,
  pret_manopera: 8.5,
  pret_utilaj: 22.4,
  pret_transport: 11.15,
  justificare: "46 ml x 0,75 m latime x 1,00 m adancime",
  incredere: "medie",
};

describe("mapToolCall — liniile de deviz", () => {
  it("pastreaza cele patru preturi si insumeaza componentele rotunjite", () => {
    const events = mapToolCall(TOOL_NAMES.addLines, addLines([tencuiala]));

    expect(events[0]).toEqual({ type: "section", name: "Suprastructura" });

    const mapped = events[1];
    if (mapped?.type !== "line") throw new Error("asteptam o linie");

    expect(mapped.line.materialUnitPrice).toBe(14.42);
    expect(mapped.line.laborUnitPrice).toBe(15.4);
    expect(mapped.line.unitPrice).toBe(29.82);
    // 220 x 14.42 = 3172.4 si 220 x 15.4 = 3388
    expect(mapped.line.total).toBe(6560.4);
    expect(mapped.line.confidence).toBe("MARE");
    expect(mapped.line.justification).toBe(tencuiala.justificare);
  });

  it("utilajul si transportul lipsa intra ca zero, nu blocheaza linia", () => {
    const events = mapToolCall(TOOL_NAMES.addLines, addLines([tencuiala]));

    const mapped = events.find((e) => e.type === "line");
    if (mapped?.type !== "line") throw new Error("asteptam o linie");

    expect(mapped.line.equipmentUnitPrice).toBe(0);
    expect(mapped.line.transportUnitPrice).toBe(0);
  });

  it("duce utilajul si transportul pe linie cand modelul le trimite", () => {
    const events = mapToolCall(TOOL_NAMES.addLines, addLines([sapatura]));

    const mapped = events.find((e) => e.type === "line");
    if (mapped?.type !== "line") throw new Error("asteptam o linie");

    expect(mapped.line.materialUnitPrice).toBe(0);
    expect(mapped.line.laborUnitPrice).toBe(8.5);
    expect(mapped.line.equipmentUnitPrice).toBe(22.4);
    expect(mapped.line.transportUnitPrice).toBe(11.15);
    expect(mapped.line.unitPrice).toBe(42.05);
    // 34.5 x 8.5 = 293.25, x 22.4 = 772.8, x 11.15 = 384.68
    expect(mapped.line.total).toBe(1450.73);
  });

  it("accepta 0 pe manopera pentru o linie de pura furnizare", () => {
    const events = mapToolCall(
      TOOL_NAMES.addLines,
      addLines([{ ...tencuiala, pret_manopera: 0 }]),
    );

    const mapped = events.find((e) => e.type === "line");
    if (mapped?.type !== "line") throw new Error("asteptam o linie");
    expect(mapped.line.laborUnitPrice).toBe(0);
  });

  it("intra fara cod cand modelul nu a gasit norma", () => {
    const events = mapToolCall(TOOL_NAMES.addLines, addLines([tencuiala]));

    const mapped = events.find((e) => e.type === "line");
    if (mapped?.type !== "line") throw new Error("asteptam o linie");
    expect(mapped.line.code).toBeNull();
    expect(mapped.line.name).toBe(tencuiala.denumire);
  });
});

describe("mapToolCall — codul de norma", () => {
  it("ia denumirea si unitatea din indicator, nu de la model", () => {
    const events = mapToolCall(
      TOOL_NAMES.addLines,
      addLines([
        {
          ...tencuiala,
          cod_norma: "CA01A1",
          denumire: "ceva scris de model",
          um: "kg",
        },
      ]),
    );

    const line = events.find((e) => e.type === "line");
    if (line?.type !== "line") throw new Error("asteptam o linie");

    expect(line.line.code).toBe("CA01A1");
    expect(line.line.name).toContain("TURNARE BETON SIMPLU IN FUNDATII");
    expect(line.line.unit).toBe("mc");
    // Cantitatea si preturile raman ale modelului.
    expect(line.line.quantity).toBe(220);
    expect(line.line.materialUnitPrice).toBe(14.42);
  });

  it("pastreaza linia, dar fara cod, cand codul e inventat", () => {
    const input = addLines([{ ...tencuiala, cod_norma: "XX99Z9" }]);
    const events = mapToolCall(TOOL_NAMES.addLines, input);

    const line = events.find((e) => e.type === "line");
    if (line?.type !== "line") throw new Error("asteptam o linie");

    expect(line.line.code).toBeNull();
    expect(line.line.name).toBe(tencuiala.denumire);
    expect(unknownNormCodes(input)).toEqual(["XX99Z9"]);
  });

  it("nu raporteaza drept inventate codurile care exista", () => {
    const input = addLines([{ ...tencuiala, cod_norma: "CA01A1" }]);
    expect(unknownNormCodes(input)).toEqual([]);
  });
});

describe("mapToolCall — validarea liniilor", () => {
  it("respinge cantitatile nevalide in loc sa le rotunjeasca la zero", () => {
    for (const cantitate of [0, -5, Number.NaN]) {
      const events = mapToolCall(
        TOOL_NAMES.addLines,
        addLines([{ ...tencuiala, cantitate }]),
      );
      expect(events).toEqual([]);
    }
  });

  it("respinge liniile fara justificare, denumire sau unitate", () => {
    for (const patch of [{ justificare: "" }, { denumire: "" }, { um: "" }]) {
      const events = mapToolCall(
        TOOL_NAMES.addLines,
        addLines([{ ...tencuiala, ...patch }]),
      );
      expect(events).toEqual([]);
    }
  });

  it("respinge un pret negativ", () => {
    const events = mapToolCall(
      TOOL_NAMES.addLines,
      addLines([{ ...tencuiala, pret_material: -10 }]),
    );
    expect(events).toEqual([]);
  });

  it("respinge un nivel de incredere inventat", () => {
    const events = mapToolCall(
      TOOL_NAMES.addLines,
      addLines([{ ...tencuiala, incredere: "absoluta" }]),
    );
    expect(events).toEqual([]);
  });
});

describe("pricelessLines", () => {
  it("o linie e fara pret doar cand toate patru componentele sunt zero", () => {
    const input = addLines([
      // Are manopera: e o demolare, nu o linie fara pret.
      { ...tencuiala, pret_material: 0 },
      // Are doar utilaj: tot pret e.
      { ...tencuiala, denumire: "Ore excavator", pret_material: 0, pret_manopera: 0, pret_utilaj: 45 },
      {
        ...tencuiala,
        denumire: "Hidroizolatie terasa",
        pret_material: 0,
        pret_manopera: 0,
      },
    ]);

    expect(pricelessLines(input)).toEqual(["Hidroizolatie terasa"]);
  });
});

describe("mapToolCall — cere_clarificare", () => {
  it("transmite intrebarea catre om", () => {
    const events = mapToolCall(
      TOOL_NAMES.clarify,
      { intrebare: "Fundatia e continua sau radier general?" },
    );
    expect(events).toEqual([
      { type: "question", question: "Fundatia e continua sau radier general?" },
    ]);
  });
});

describe("mapToolCall — variantele de norma", () => {
  /** "Beton in fundatie" poate fi simplu sau armat: fraza nu departajeaza. */
  function lineWith(coduri: string[] | undefined, cod_norma = "CA01A1") {
    const events = mapToolCall(
      TOOL_NAMES.addLines,
      addLines([{ ...tencuiala, cod_norma, coduri_alternative: coduri }]),
    );
    const line = events.find((e) => e.type === "line");
    if (line?.type !== "line") throw new Error("asteptam o linie");
    return line.line;
  }

  it("tine si codul ales in lista, ca omul sa poata reveni la el", () => {
    const line = lineWith(["CA02A1", "CA02B1"]);

    expect(line.code).toBe("CA01A1");
    expect(line.alternativeCodes).toEqual(["CA01A1", "CA02A1", "CA02B1"]);
  });

  it("arunca variantele care nu exista in indicator", () => {
    expect(lineWith(["CA02A1", "XX99Z9"]).alternativeCodes).toEqual([
      "CA01A1",
      "CA02A1",
    ]);
  });

  it("nu repeta codul ales cand modelul il trimite si intre variante", () => {
    expect(lineWith(["CA01A1", "CA02A1"]).alternativeCodes).toEqual([
      "CA01A1",
      "CA02A1",
    ]);
  });

  it("nu afiseaza nimic cand nu ramane o alegere reala", () => {
    // O singura varianta valida, care e chiar cea de pe linie.
    expect(lineWith(["XX99Z9"]).alternativeCodes).toEqual([]);
    expect(lineWith(undefined).alternativeCodes).toEqual([]);
    expect(lineWith([]).alternativeCodes).toEqual([]);
  });

  it("merge si cand linia nu are cod: alegerea e intre normele propuse", () => {
    const events = mapToolCall(
      TOOL_NAMES.addLines,
      addLines([{ ...tencuiala, coduri_alternative: ["CA01A1", "CA02B1"] }]),
    );
    const line = events.find((e) => e.type === "line");
    if (line?.type !== "line") throw new Error("asteptam o linie");

    expect(line.line.code).toBeNull();
    expect(line.line.alternativeCodes).toEqual(["CA01A1", "CA02B1"]);
  });
});

describe("mapToolCall — apeluri necunoscute", () => {
  it("ignora o unealta pe care nu o cunoastem", () => {
    expect(mapToolCall("stergere_deviz", { tot: true })).toEqual([]);
  });

  it("ignora un apel fara argumente", () => {
    expect(mapToolCall(TOOL_NAMES.addLines, {})).toEqual([]);
    expect(mapToolCall(TOOL_NAMES.addLines, null)).toEqual([]);
  });
});

/**
 * Pasii dedusi ies pe alt canal decat liniile si nu ajung in deviz pina nu-i
 * bifeaza omul. Testele de aici pazesc exact ce face canalul sigur: cantitatea
 * lipsa ramine lipsa, iar un cod inventat nu se lipeste de propunere.
 */
describe("mapToolCall — propune_pasi", () => {
  const pas = {
    denumire: "Demontare pardoseala din placi de gresie",
    um: "mp",
    motiv: "gresia noua nu se monteaza peste cea veche",
  };

  it("intoarce pasii ca propuneri, nu ca linii", () => {
    const events = mapToolCall(TOOL_NAMES.proposeSteps, { pasi: [pas] });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("steps");
    expect(events.some((e) => e.type === "line")).toBe(false);
  });

  it("pastreaza ordinea in care au venit", () => {
    const events = mapToolCall(
      TOOL_NAMES.proposeSteps,
      {
        pasi: [
          { ...pas, denumire: "Demontare gresie veche" },
          { ...pas, denumire: "Amorsare strat suport" },
          { ...pas, denumire: "Chituire rosturi" },
        ],
      },
    );

    const steps = events[0].type === "steps" ? events[0].steps : [];
    expect(steps.map((s) => s.name)).toEqual([
      "Demontare gresie veche",
      "Amorsare strat suport",
      "Chituire rosturi",
    ]);
  });

  it("lasa cantitatea null cand modelul nu o trimite", () => {
    // Cifra lipsa e un semnal, nu o scapare: pasul depinde de starea de pe
    // teren si il masoara omul.
    const events = mapToolCall(TOOL_NAMES.proposeSteps, { pasi: [pas] });
    const steps = events[0].type === "steps" ? events[0].steps : [];

    expect(steps[0].quantity).toBeNull();
  });

  it("pastreaza cantitatea cand rezulta din ce a spus omul", () => {
    const events = mapToolCall(
      TOOL_NAMES.proposeSteps,
      { pasi: [{ ...pas, cantitate: 6 }] },
    );
    const steps = events[0].type === "steps" ? events[0].steps : [];

    expect(steps[0].quantity).toBe(6);
  });

  it("ia denumirea din indicator cand codul exista", () => {
    const events = mapToolCall(
      TOOL_NAMES.proposeSteps,
      { pasi: [{ ...pas, cod_norma: "CA01A1" }] },
    );
    const steps = events[0].type === "steps" ? events[0].steps : [];

    expect(steps[0].code).toBe("CA01A1");
    expect(steps[0].name).not.toBe(pas.denumire);
  });

  it("arunca un cod care nu exista si pastreaza denumirea scrisa", () => {
    const events = mapToolCall(
      TOOL_NAMES.proposeSteps,
      { pasi: [{ ...pas, cod_norma: "XX99Z9" }] },
    );
    const steps = events[0].type === "steps" ? events[0].steps : [];

    expect(steps[0].code).toBeNull();
    expect(steps[0].name).toBe(pas.denumire);
  });

  it("ignora un apel fara pasi", () => {
    expect(mapToolCall(TOOL_NAMES.proposeSteps, { pasi: [] })).toEqual([]);
    expect(mapToolCall(TOOL_NAMES.proposeSteps, {})).toEqual([]);
  });
});
