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

const combinedLine = {
  denumire: "Zidarie din BCA de 30 cm cu adeziv",
  um: "mc",
  cantitate: 34.5,
  pret_unitar: 627.05,
  justificare: "perimetru 46 ml x h 2,80 x 0,30 m grosime = 38,6 mc, minus goluri",
  incredere: "medie",
};

const splitLine = {
  denumire: "Tencuiala mecanizata cu gips la interior",
  um: "mp",
  cantitate: 220,
  pret_material: 14.42,
  pret_manopera: 15.4,
  justificare: "pereti 180 mp + tavane 40 mp",
  incredere: "mare",
};

describe("mapToolCall — deviz cu un singur pret", () => {
  it("pune pretul intreg pe material si lasa manopera la zero", () => {
    const events = mapToolCall(
      TOOL_NAMES.addLines,
      addLines([combinedLine]),
      "COMBINAT",
    );

    expect(events[0]).toEqual({ type: "section", name: "Suprastructura" });

    const line = events[1];
    if (line?.type !== "line") throw new Error("asteptam o linie");

    expect(line.line.materialUnitPrice).toBe(627.05);
    expect(line.line.laborUnitPrice).toBe(0);
    expect(line.line.unitPrice).toBe(627.05);
    expect(line.line.total).toBe(21633.23); // 34.5 x 627.05
    expect(line.line.confidence).toBe("MEDIE");
    expect(line.line.justification).toBe(combinedLine.justificare);
  });

  it("intra fara cod cand modelul nu a gasit norma", () => {
    const events = mapToolCall(
      TOOL_NAMES.addLines,
      addLines([combinedLine]),
      "COMBINAT",
    );

    const line = events.find((e) => e.type === "line");
    if (line?.type !== "line") throw new Error("asteptam o linie");
    expect(line.line.code).toBeNull();
    expect(line.line.name).toBe(combinedLine.denumire);
  });

  it("refuza o linie care vine cu preturi separate in modul combinat", () => {
    const events = mapToolCall(TOOL_NAMES.addLines, addLines([splitLine]), "COMBINAT");
    expect(events).toEqual([]);
  });
});

describe("mapToolCall — deviz cu materiale si manopera separate", () => {
  it("pastreaza cele doua preturi si insumeaza componentele rotunjite", () => {
    const events = mapToolCall(TOOL_NAMES.addLines, addLines([splitLine]), "SEPARAT");

    const line = events.find((e) => e.type === "line");
    if (line?.type !== "line") throw new Error("asteptam o linie");

    expect(line.line.materialUnitPrice).toBe(14.42);
    expect(line.line.laborUnitPrice).toBe(15.4);
    expect(line.line.unitPrice).toBe(29.82);
    // 220 x 14.42 = 3172.4 si 220 x 15.4 = 3388
    expect(line.line.total).toBe(6560.4);
  });

  it("refuza o linie fara defalcare cand devizul e separat", () => {
    const events = mapToolCall(
      TOOL_NAMES.addLines,
      addLines([combinedLine]),
      "SEPARAT",
    );
    expect(events).toEqual([]);
  });

  it("accepta 0 pe manopera pentru o linie de pura furnizare", () => {
    const events = mapToolCall(
      TOOL_NAMES.addLines,
      addLines([{ ...splitLine, pret_manopera: 0 }]),
      "SEPARAT",
    );

    const line = events.find((e) => e.type === "line");
    if (line?.type !== "line") throw new Error("asteptam o linie");
    expect(line.line.laborUnitPrice).toBe(0);
  });
});

describe("mapToolCall — codul de norma", () => {
  it("ia denumirea si unitatea din indicator, nu de la model", () => {
    const events = mapToolCall(
      TOOL_NAMES.addLines,
      addLines([
        {
          ...combinedLine,
          cod_norma: "CA01A1",
          denumire: "ceva scris de model",
          um: "kg",
        },
      ]),
      "COMBINAT",
    );

    const line = events.find((e) => e.type === "line");
    if (line?.type !== "line") throw new Error("asteptam o linie");

    expect(line.line.code).toBe("CA01A1");
    expect(line.line.name).toContain("TURNARE BETON SIMPLU IN FUNDATII");
    expect(line.line.unit).toBe("mc");
    // Cantitatea si pretul raman ale modelului.
    expect(line.line.quantity).toBe(34.5);
  });

  it("pastreaza linia, dar fara cod, cand codul e inventat", () => {
    const input = addLines([{ ...combinedLine, cod_norma: "XX99Z9" }]);
    const events = mapToolCall(TOOL_NAMES.addLines, input, "COMBINAT");

    const line = events.find((e) => e.type === "line");
    if (line?.type !== "line") throw new Error("asteptam o linie");

    expect(line.line.code).toBeNull();
    expect(line.line.name).toBe(combinedLine.denumire);
    expect(unknownNormCodes(input, "COMBINAT")).toEqual(["XX99Z9"]);
  });

  it("nu raporteaza drept inventate codurile care exista", () => {
    const input = addLines([{ ...combinedLine, cod_norma: "CA01A1" }]);
    expect(unknownNormCodes(input, "COMBINAT")).toEqual([]);
  });
});

describe("mapToolCall — validarea liniilor", () => {
  it("respinge cantitatile nevalide in loc sa le rotunjeasca la zero", () => {
    for (const cantitate of [0, -5, Number.NaN]) {
      const events = mapToolCall(
        TOOL_NAMES.addLines,
        addLines([{ ...combinedLine, cantitate }]),
        "COMBINAT",
      );
      expect(events).toEqual([]);
    }
  });

  it("respinge liniile fara justificare, denumire sau unitate", () => {
    for (const patch of [{ justificare: "" }, { denumire: "" }, { um: "" }]) {
      const events = mapToolCall(
        TOOL_NAMES.addLines,
        addLines([{ ...combinedLine, ...patch }]),
        "COMBINAT",
      );
      expect(events).toEqual([]);
    }
  });

  it("respinge un pret negativ", () => {
    const events = mapToolCall(
      TOOL_NAMES.addLines,
      addLines([{ ...combinedLine, pret_unitar: -10 }]),
      "COMBINAT",
    );
    expect(events).toEqual([]);
  });

  it("respinge un nivel de incredere inventat", () => {
    const events = mapToolCall(
      TOOL_NAMES.addLines,
      addLines([{ ...combinedLine, incredere: "absoluta" }]),
      "COMBINAT",
    );
    expect(events).toEqual([]);
  });
});

describe("pricelessLines", () => {
  it("raporteaza liniile intrate cu pretul zero", () => {
    const input = addLines([
      { ...combinedLine, pret_unitar: 0 },
      combinedLine,
    ]);

    expect(pricelessLines(input, "COMBINAT")).toEqual([combinedLine.denumire]);
  });

  it("o linie separata e fara pret doar cand ambele preturi sunt zero", () => {
    const input = addLines([
      { ...splitLine, pret_material: 0 },
      { ...splitLine, denumire: "Demolare zidarie", pret_material: 0, pret_manopera: 0 },
    ]);

    expect(pricelessLines(input, "SEPARAT")).toEqual(["Demolare zidarie"]);
  });
});

describe("mapToolCall — cere_clarificare", () => {
  it("transmite intrebarea catre om", () => {
    const events = mapToolCall(
      TOOL_NAMES.clarify,
      { intrebare: "Fundatia e continua sau radier general?" },
      "COMBINAT",
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
      addLines([{ ...combinedLine, cod_norma, coduri_alternative: coduri }]),
      "COMBINAT",
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
      addLines([{ ...combinedLine, coduri_alternative: ["CA01A1", "CA02B1"] }]),
      "COMBINAT",
    );
    const line = events.find((e) => e.type === "line");
    if (line?.type !== "line") throw new Error("asteptam o linie");

    expect(line.line.code).toBeNull();
    expect(line.line.alternativeCodes).toEqual(["CA01A1", "CA02B1"]);
  });
});

describe("mapToolCall — apeluri necunoscute", () => {
  it("ignora o unealta pe care nu o cunoastem", () => {
    expect(mapToolCall("stergere_deviz", { tot: true }, "COMBINAT")).toEqual([]);
  });

  it("ignora un apel fara argumente", () => {
    expect(mapToolCall(TOOL_NAMES.addLines, {}, "COMBINAT")).toEqual([]);
    expect(mapToolCall(TOOL_NAMES.addLines, null, "COMBINAT")).toEqual([]);
  });
});
