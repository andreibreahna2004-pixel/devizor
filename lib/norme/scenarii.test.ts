import { describe, expect, it } from "vitest";
import { searchNorme } from "./index";

/**
 * Zece lucrari de renovare, scrise cum le spune omul, sparte in pasii lor.
 *
 * Fisierul e referinta aplicatiei pentru "ce se poate coda si ce nu". A fost
 * scris pornind de la un set de exemple in care codurile erau inventate — toate
 * cele 44. Aratau plauzibil (`CO09A1` pentru trepte de lemn), dar `CO09A1` e in
 * indicator sistem de racire cu placi de azbociment pentru turnuri de racire.
 * De aceea aici nu se scrie niciun cod fara sa fie cautat: fiecare `toContain`
 * de mai jos a fost verificat pe indicatorul din `data/`.
 *
 * Constatarea care conteaza cel mai mult: la o renovare de apartament, **cele
 * mai multe linii nu au cod**, si asta nu e o scapare a cautarii. Indicatoarele
 * incarcate sint C, RpC si Ts — constructii, reparatii si terasamente. Lipsesc
 * instalatiile electrice si sanitare, izolatiile si transporturile, iar
 * materialele de dupa 1990 (rigips, termopan, termosistem, membrana sudata,
 * parchet laminat) nu existau cand s-au tiparit.
 *
 * Testele care cer ZERO rezultate sint la fel de importante ca celelalte: ele
 * opresc o cautare "imbunatatita" sa inceapa sa raspunda cu norma vecina.
 */

function coduri(query: string, limit = 5): string[] {
  return searchNorme(query, limit).map((n) => n.cod.replace(/\s+/g, ""));
}

function gaseste(query: string, prefix: string, limit = 5): boolean {
  return coduri(query, limit).some((cod) => cod.startsWith(prefix));
}

describe("1. tapet vechi jos, lavabila deasupra — 40 mp", () => {
  it("scoaterea tapetului are norma, cu varianta dupa material", () => {
    const found = coduri("scoaterea tapetelor pereti");
    expect(found).toContain("RPCT12A1"); // din hirtie
    expect(found).toContain("RPCT12B1"); // din pinza
  });

  it("repararea tencuielii si gletul au norme", () => {
    expect(gaseste("reparatii tencuieli interioare", "RPCJ")).toBe(true);
    expect(coduri("glet ipsos tencuieli interioare")).toContain("CF10C1");
  });

  it("lavabila e 'vopsitorie (zugraveli lavabile)' in RpC", () => {
    expect(coduri("zugraveli lavabile")).toContain("RPCR54A1");
  });

  it("amorsa de perete nu are norma", () => {
    expect(searchNorme("amorsa perete")).toEqual([]);
    expect(searchNorme("grund amorsa zugraveli")).toEqual([]);
  });
});

describe("2. perete de rigips daramat — 15 mp", () => {
  it("rigipsul nu are norma: nu exista in indicatoare", () => {
    for (const query of [
      "pereti gips carton",
      "desfacere pereti rigips",
      "demontare gips carton",
    ]) {
      expect(searchNorme(query)).toEqual([]);
    }
  });

  it("zugravirea zonei afectate are norma", () => {
    expect(gaseste("zugraveli interioare var", "RPCR")).toBe(true);
  });

  it("strangerea si transportul molozului nu au norma", () => {
    expect(searchNorme("transport moloz")).toEqual([]);
  });
});

describe("3. ferestre de lemn schimbate cu termopan — 8 mp", () => {
  it("demontarea ferestrelor vechi de lemn are norma", () => {
    expect(coduri("demontarea usilor ferestrelor lemn")).toContain("RPCT33A1");
  });

  it("tamplaria PVC nu are norma, oricum ar fi cautata", () => {
    for (const query of ["tamplarie pvc", "ferestre pvc termopan", "geam termopan"]) {
      expect(searchNorme(query)).toEqual([]);
    }
  });

  it("glafurile au norma, cu varianta dupa material", () => {
    const found = coduri("inlocuire glafuri ferestre");
    expect(found).toContain("RPCO10A1"); // cherestea rasinoase
    expect(found).toContain("RPCO10B1"); // stejar
  });

  it("spuma poliuretanica de rost nu are norma", () => {
    expect(searchNorme("spuma poliuretanica rosturi")).toEqual([]);
  });
});

describe("4. polistiren pe tavanul unui balcon — 6 mp", () => {
  it("polistirenul si masa de spaclu nu au norma", () => {
    for (const query of [
      "placi polistiren expandat",
      "masa spaclu plasa armare",
      "dibluri fixare polistiren",
    ]) {
      expect(searchNorme(query)).toEqual([]);
    }
  });

  it("zugraveala de finisaj are norma", () => {
    expect(gaseste("zugraveli pereti tavane", "RPCR")).toBe(true);
  });
});

describe("5. cada scoasa, dus in pardoseala", () => {
  it("obiectele sanitare nu au norma: indicatorul de instalatii lipseste", () => {
    for (const query of ["cada baie fonta", "obiecte sanitare", "rigola dus"]) {
      expect(searchNorme(query)).toEqual([]);
    }
  });

  it("hidroizolatia sub gresie nu are norma: indicatorul Iz lipseste", () => {
    expect(searchNorme("hidroizolatie lichida")).toEqual([]);
  });

  it("panta de sub gresie e strat suport, iar gresia are norma", () => {
    expect(coduri("sapa pardoseli")).toContain("CG01D1");
    expect(gaseste("pardoseli gresie ceramica", "RPCK40")).toBe(true);
  });
});

describe("6. hidroizolatie de terasa refacuta — 50 mp", () => {
  it("desfacerea cartonului bitumat vechi are norma", () => {
    expect(coduri("desfacerea invelitorilor carton bitumat")).toContain("RPCT26D1");
  });

  it("membrana sudata de azi nu are norma", () => {
    // RPCI01A1 exista, dar e carton bitumat BATUT IN CUIE — alta tehnologie.
    // Membrana bituminoasa sudata cu flacara nu are corespondent.
    for (const query of ["membrana bituminoasa sudata", "amorsa bituminoasa"]) {
      expect(searchNorme(query)).toEqual([]);
    }
  });
});

describe("7. tigla jos, tabla sus — 100 mp", () => {
  it("desfacerea invelitorii din tigla are norma", () => {
    expect(coduri("desfacerea invelitorilor olane tigle")).toContain("RPCT26B1");
  });

  it("astereala are norma exacta", () => {
    expect(coduri("astereala scinduri rasinoase")).toContain("CE18A1");
  });

  it("tabla are norma, dar pentru foi plane, nu pentru tabla tip tigla", () => {
    // CE04A1 e invelitoare din foi plane fataluite. Tabla tip tigla de azi e
    // alt produs; daca modelul pune CE04A1 pe ea, devizul minte.
    expect(coduri("invelitori tabla zincata foi plane")).toContain("CE04A1");
    expect(searchNorme("tabla tip tigla")).toEqual([]);
  });

  it("folia anticondens nu are norma", () => {
    expect(searchNorme("folie anticondens")).toEqual([]);
  });

  it("jgheaburile si burlanele au norme", () => {
    expect(gaseste("jgheaburi tabla zincata", "RPCI21")).toBe(true);
    expect(gaseste("burlane tabla zincata", "RPCI25")).toBe(true);
  });
});

describe("8. trotuar de beton in curte — 20 ml", () => {
  it("caseta trotuarului e sapatura in spatii limitate", () => {
    expect(gaseste("sapatura manuala sant fundatie", "TSA")).toBe(true);
  });

  it("pregatirea platformei inainte de asternere are norma in Ts", () => {
    expect(coduri("pregatirea platformei pamint")).toContain("TSE06");
  });

  it("cofrajele din scinduri au norma", () => {
    expect(gaseste("cofraje panouri scinduri", "CB04")).toBe(true);
  });

  it("plasa sudata nu are norma proprie", () => {
    // Armaturile din bare au (CC01x); plasa sudata ca produs, nu.
    expect(searchNorme("plase sudate")).toEqual([]);
  });
});

describe("9. instalatie electrica schimbata intr-o camera", () => {
  it("nimic din instalatii electrice nu are norma aici", () => {
    for (const query of [
      "conductori cupru tragere",
      "doze aparat ramificatie",
      "prize intrerupatoare montare",
      "tuburi pvc protectie electrice",
    ]) {
      expect(searchNorme(query)).toEqual([]);
    }
  });
});

describe("10. scara de beton imbracata in lemn", () => {
  it("placarea betonului cu trepte de lemn nu are norma", () => {
    // RPCL01x exista, dar e REPARARE de trepte la scari care sint deja din
    // lemn — nu placarea unei scari de beton.
    expect(searchNorme("placare trepte lemn pe beton")).toEqual([]);
    expect(searchNorme("montare trepte contratrepte lemn beton")).toEqual([]);
  });

  it("plinta de lemn are norma", () => {
    expect(gaseste("plinte lemn stejar", "RPCK13")).toBe(true);
  });
});
