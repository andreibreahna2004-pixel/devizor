import { afterEach, describe, expect, it } from "vitest";
import { estePermis, golesteCacheRobots, iaRobots, parseRobots } from "./robots";

const AGENT = "Devizor/1.0";

afterEach(() => golesteCacheRobots());

function raspunde(text: string, ok = true): typeof fetch {
  return (async () =>
    ({ ok, text: async () => text }) as unknown as Response) as unknown as typeof fetch;
}

describe("parseRobots si estePermis", () => {
  it("respecta interdictia pentru toti", () => {
    const r = parseRobots("User-agent: *\nDisallow: /cauta", AGENT);
    expect(estePermis(r, "/cauta?q=parchet")).toBe(false);
    expect(estePermis(r, "/ro/parchet-laminat/c/131")).toBe(true);
  });

  it("permite tot cand nu exista reguli", () => {
    expect(estePermis(parseRobots("", AGENT), "/orice")).toBe(true);
  });

  it("trateaza 'Disallow:' gol ca permisiune", () => {
    const r = parseRobots("User-agent: *\nDisallow:", AGENT);
    expect(estePermis(r, "/cauta")).toBe(true);
  });

  it("da cistig potrivirii mai lungi", () => {
    // Allow mai specific bate Disallow mai general.
    const r = parseRobots("User-agent: *\nDisallow: /ro\nAllow: /ro/cauta", AGENT);
    expect(estePermis(r, "/ro/cauta?q=x")).toBe(true);
    expect(estePermis(r, "/ro/altceva")).toBe(false);
  });

  it("la lungime egala, Allow bate Disallow", () => {
    const r = parseRobots("User-agent: *\nDisallow: /cauta\nAllow: /cauta", AGENT);
    expect(estePermis(r, "/cauta")).toBe(true);
  });

  it("prefera grupul scris pentru agentul nostru", () => {
    const r = parseRobots(
      "User-agent: *\nDisallow: /\n\nUser-agent: Devizor\nDisallow: /admin",
      AGENT,
    );
    expect(estePermis(r, "/cauta")).toBe(true);
    expect(estePermis(r, "/admin")).toBe(false);
  });

  it("intelege * si $ in tipar", () => {
    const r = parseRobots("User-agent: *\nDisallow: /*.pdf$", AGENT);
    expect(estePermis(r, "/fisiere/manual.pdf")).toBe(false);
    expect(estePermis(r, "/fisiere/manual.pdf?x=1")).toBe(true);
  });

  it("ignora comentariile", () => {
    const r = parseRobots("# comentariu\nUser-agent: *  # si aici\nDisallow: /cauta", AGENT);
    expect(estePermis(r, "/cauta")).toBe(false);
  });
});

describe("iaRobots", () => {
  it("cere fisierul o singura data pe origine", async () => {
    let cereri = 0;
    const fals = (async () => {
      cereri++;
      return { ok: true, text: async () => "User-agent: *\nDisallow: /cauta" } as unknown as Response;
    }) as unknown as typeof fetch;

    await iaRobots("https://exemplu.invalid", AGENT, fals);
    const r = await iaRobots("https://exemplu.invalid", AGENT, fals);

    expect(cereri).toBe(1);
    expect(estePermis(r, "/cauta")).toBe(false);
  });

  it("un robots.txt lipsa inseamna permis", async () => {
    const r = await iaRobots("https://exemplu.invalid", AGENT, raspunde("", false));
    expect(estePermis(r, "/orice")).toBe(true);
  });

  it("o cadere de retea nu blocheaza catalogul", async () => {
    // Un 5xx tratat ca interdictie ar opri preturile din cauza unei caderi
    // trecatoare a magazinului.
    const cade = (async () => {
      throw new Error("retea cazuta");
    }) as unknown as typeof fetch;

    const r = await iaRobots("https://exemplu.invalid", AGENT, cade);
    expect(estePermis(r, "/orice")).toBe(true);
  });

  it("renunta la timp daca robots.txt nu raspunde", async () => {
    // Fara semnal de oprire, un singur magazin mut ar tine in loc toata cautarea:
    // robots.txt se cere inaintea paginii.
    let semnal: AbortSignal | undefined;
    const impl = (async (_url: string, init?: RequestInit) => {
      semnal = init?.signal ?? undefined;
      return { ok: true, text: async () => "" } as unknown as Response;
    }) as unknown as typeof fetch;

    await iaRobots("https://exemplu.invalid", "Devizor/1.0", impl, 50);

    expect(semnal).toBeInstanceOf(AbortSignal);
  });
});
