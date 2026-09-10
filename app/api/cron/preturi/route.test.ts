import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

/**
 * Paza rutei de cron.
 *
 * Ruta porneste cereri catre site-uri strine de pe serverul nostru. Nepazita, ar
 * face-o oricine, de cate ori vrea, si de pe adresa noastra, adica exact felul
 * de defect care se descopera cand un magazin ne blocheaza. De aia se testeaza
 * paza, nu doar trecerea.
 *
 * Toate cazurile de mai jos se opresc **inainte** de orice atingere a bazei sau a
 * retelei, deci testul n-are nevoie nici de PostgreSQL, nici de internet.
 */

afterEach(() => {
  delete process.env.CRON_SECRET;
  vi.restoreAllMocks();
});

const cerere = (antet?: string) =>
  new Request("https://exemplu.invalid/api/cron/preturi", {
    headers: antet ? { authorization: antet } : {},
  });

describe("GET /api/cron/preturi", () => {
  it("nu exista cand CRON_SECRET nu e setat", async () => {
    const r = await GET(cerere("Bearer orice"));
    // 404, nu 401: nu confirma nici macar ca exista ceva aici.
    expect(r.status).toBe(404);
  });

  it("da 404 fara antet de autorizare", async () => {
    process.env.CRON_SECRET = "secret-de-proba";
    expect((await GET(cerere())).status).toBe(404);
  });

  it("da 404 la secret greșit", async () => {
    process.env.CRON_SECRET = "secret-de-proba";
    expect((await GET(cerere("Bearer altceva"))).status).toBe(404);
  });

  it("da 404 la antet fara Bearer", async () => {
    process.env.CRON_SECRET = "secret-de-proba";
    expect((await GET(cerere("secret-de-proba"))).status).toBe(404);
  });

  it("trece cu secretul potrivit, si atunci raspunde trecerea", async () => {
    process.env.CRON_SECRET = "secret-de-proba";
    // Scraperul e oprit, deci trecerea se opreste singura inainte de retea si de
    // baza: rularea zilnica nu e o cale de a ocoli comutatorul.
    delete process.env.SCRAPER_ACTIV;
    vi.spyOn(console, "log").mockImplementation(() => {});

    const r = await GET(cerere("Bearer secret-de-proba"));
    expect(r.status).toBe(200);

    const corp = await r.json();
    expect(corp.sarit).toMatch(/SCRAPER_ACTIV/);
    expect(corp.termeni).toBe(0);
  });
});
