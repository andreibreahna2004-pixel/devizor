import { describe, expect, it } from "vitest";
import { type PriceObservation } from "../import";
import {
  MAX_PRODUSE_PE_MAGAZIN,
  filtreazaPlauzibile,
  potrivesteInterogarea,
} from "./plauzibil";

/**
 * Ultimul gard dinaintea catalogului.
 *
 * Ce trece de aici se scrie in `MaterialPrice`, care creste si nu se rescrie:
 * randul gresit ramane acolo pentru totdeauna, si intra si in grafic. De aceea
 * filtrul se testeaza pe cazurile care chiar apar, nu pe unele inventate.
 */

const ACUM = new Date("2026-08-30T10:00:00.000Z");

const obs = (name: string, price: number): PriceObservation => ({
  name,
  unit: "buc",
  price,
  countyCode: null,
  observedAt: ACUM,
  supplier: "Magazin de proba",
  sourceUrl: null,
});

describe("filtreazaPlauzibile", () => {
  it("lasa sa treaca un produs obisnuit", () => {
    const iesire = filtreazaPlauzibile([obs("Ciment Portland 40 kg", 32.5)]);
    expect(iesire).toHaveLength(1);
  });

  it("arunca preturile din afara intervalului", () => {
    const iesire = filtreazaPlauzibile([
      obs("Ceva pe gratis", 0),
      obs("Ceva absurd", 250_000),
      obs("Ceva normal", 49.9),
    ]);
    expect(iesire.map((o) => o.name)).toEqual(["Ceva normal"]);
  });

  it("arunca etichetele de interfata", () => {
    // "Cosul meu 0,00 lei" din bara de sus arata, pentru euristica, exact ca un
    // card cu pret.
    const iesire = filtreazaPlauzibile([
      obs("Cosul meu", 0.5),
      obs("Livrare", 19.99),
      obs("Adeziv gresie 25 kg", 45),
    ]);
    expect(iesire.map((o) => o.name)).toEqual(["Adeziv gresie 25 kg"]);
  });

  it("arunca denumirile prea scurte si pe cele fara litere", () => {
    const iesire = filtreazaPlauzibile([obs("X", 10), obs("12345", 10)]);
    expect(iesire).toHaveLength(0);
  });

  it("dedubleaza acelasi produs la acelasi pret", () => {
    const iesire = filtreazaPlauzibile([
      obs("Ciment Portland 40 kg", 32.5),
      obs("CIMENT PORTLAND 40 KG", 32.5),
      obs("Ciment Portland 40 kg", 33.5),
    ]);
    expect(iesire).toHaveLength(2);
  });

  it("plafoneaza cate produse ia de la un magazin", () => {
    // Frana de avarie: un strat care o ia razna nu are voie sa scrie sute de
    // randuri intr-un tabel din care nu se sterge nimic.
    const multe = Array.from({ length: 200 }, (_, i) => obs(`Produsul numarul ${i}`, 10 + i));
    expect(filtreazaPlauzibile(multe)).toHaveLength(MAX_PRODUSE_PE_MAGAZIN);
  });

  it("cere ca pretul si numele sa fie in pagina, cand pagina e data", () => {
    // Verificarea care prinde un produs completat de model din ce stie el, nu citit
    // din pagina.
    const pagina = "Ciment Portland 40 kg 32,50 lei";
    const iesire = filtreazaPlauzibile(
      [obs("Ciment Portland 40 kg", 32.5), obs("Var hidratat 20 kg", 18.9)],
      { textPagina: pagina },
    );
    expect(iesire.map((o) => o.name)).toEqual(["Ciment Portland 40 kg"]);
  });

  it("accepta pretul scris cu punct in pagina si cu virgula in observatie", () => {
    const iesire = filtreazaPlauzibile([obs("Adeziv gresie 25 kg", 45.5)], {
      textPagina: '{"name":"Adeziv gresie 25 kg","price":45.50}',
    });
    expect(iesire).toHaveLength(1);
  });

  it("cere relevanta cand interogarea e data", () => {
    // Gardul pentru adresa de cautare ghicita gresit, care a nimerit o pagina de
    // categorie plina de altceva.
    const iesire = filtreazaPlauzibile(
      [obs("Ciment Portland 40 kg", 32.5), obs("Parchet laminat stejar", 59.9)],
      { interogare: "ciment" },
    );
    expect(iesire.map((o) => o.name)).toEqual(["Ciment Portland 40 kg"]);
  });
});

describe("potrivesteInterogarea", () => {
  it("nu se impiedica de diacritice", () => {
    expect(potrivesteInterogarea("Sapa autonivelanta 25 kg", "șapă")).toBe(true);
  });

  it("ii ajunge un cuvant din interogare", () => {
    expect(potrivesteInterogarea("Adeziv gresie si faianta", "adeziv gresie mare")).toBe(true);
  });

  it("ignora cuvintele scurte de legatura", () => {
    // "de" se regaseste in "decorative" si ar face orice interogare relevanta.
    expect(potrivesteInterogarea("Panou decorativ", "masa de spaclu")).toBe(false);
  });
});
