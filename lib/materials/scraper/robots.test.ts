import { afterEach, describe, expect, it } from "vitest";
import { caleDinUrl, estePermis, golesteCacheRobots, iaRobots, parseRobots } from "./robots";

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

  // Regulile de mai jos sunt copiate din robots.txt-urile adevarate ale
  // magazinelor, nu inventate: de aia sunt scrise pe cazurile lor.
  it("vede o interdictie scrisa pe query string", () => {
    // Leroy Merlin: `/produse/search/` e permis, dar filtrele nu.
    const r = parseRobots(`User-agent: *
Disallow: /*filters=*`, AGENT);
    expect(estePermis(r, "/produse/search/?filters=culoare")).toBe(false);
    expect(estePermis(r, "/produse/search/?q=parchet")).toBe(true);
  });

  it("vede si interdictia pe limit", () => {
    const r = parseRobots(`User-agent: *
Disallow: /*limit=*`, AGENT);
    expect(estePermis(r, "/s/parchet?limit=96")).toBe(false);
    expect(estePermis(r, "/s/parchet")).toBe(true);
  });

  it("interzice cautarea Magento a Dedemanului", () => {
    const r = parseRobots(`User-agent: *
Disallow: /catalogsearch/
Disallow: /ro/catalogsearch/`, AGENT);
    expect(estePermis(r, "/ro/catalogsearch/result/?q=parchet")).toBe(false);
    // Categoria nu e interzisa: acolo e calea cuviincioasa, daca o vrem.
    expect(estePermis(r, "/ro/parchet-laminat/c/131")).toBe(true);
  });

  it("ancoreaza $ la capatul adresei, nu al pathname-ului", () => {
    // Regula Google: `$` e sfirsitul URL-ului, deci cu query nu se mai potriveste.
    const r = parseRobots(`User-agent: *
Disallow: /cauta$`, AGENT);
    expect(estePermis(r, "/cauta")).toBe(false);
    expect(estePermis(r, "/cauta?q=x")).toBe(true);
  });

  it("nu ia grupul altui agent din cauza unei potriviri partiale", () => {
    // Un grup numit cu o litera s-ar potrivi prin `includes` cu orice agent care
    // o are in nume, si am asculta regulile altcuiva in loc de cele pentru `*`.
    const r = parseRobots(`User-agent: e
Disallow: /

User-agent: *
Allow: /`, AGENT);
    expect(estePermis(r, "/cauta")).toBe(true);
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
});

describe("caleDinUrl", () => {
  it("pastreaza query-string-ul", () => {
    expect(caleDinUrl("https://www.dedeman.ro/ro/catalogsearch/result/?q=parchet")).toBe(
      "/ro/catalogsearch/result/?q=parchet",
    );
  });

  it("da doar calea cand nu exista query", () => {
    expect(caleDinUrl("https://www.hornbach.ro/s/parchet")).toBe("/s/parchet");
  });
});
