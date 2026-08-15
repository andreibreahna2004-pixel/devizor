/**
 * Cind se mai poate modifica un deviz.
 *
 * Modul pur, fara `server-only`, fara baza de date: aici se decide ce poate
 * face omul cu documentul, deci se testeaza direct — la fel ca
 * `lib/ai/map-tool-output.ts`. `lib/estimates/service.ts` le reexporta, ca
 * restul aplicatiei sa le ia de acolo.
 */

/**
 * Ce anume inchide un deviz pentru editare.
 *
 * Nu starea lui: un deviz trimis clientului se negociaza, iar clientul cere
 * modificari. Blocarea la iesirea din ciorna il obliga pe om sa faca un deviz
 * nou la fiecare schimbare de virgula.
 *
 * Se inchide cand din el a iesit ceva ce nu mai poate fi retras:
 *
 *  - o FACTURA. Liniile facturii sint instantanee (isi copiaza denumirea,
 *    cantitatea si pretul), deci o editare de deviz n-ar strica factura in
 *    sine — dar ar face ca devizul si factura emisa din el sa nu mai spuna
 *    acelasi lucru, iar beneficiarul le are pe amindoua.
 *
 *  - o SITUATIE de lucrari. Aici pericolul e concret: `ProgressLine` are
 *    `onDelete: Cascade` spre linia de deviz, deci stergerea unei linii ar
 *    sterge tacut cantitatea executata din fiecare situatie care o pomeneste,
 *    inclusiv una semnata de dirigintele de santier. Situatia si-ar schimba
 *    totalul retroactiv, fara ca cineva sa fi cerut asta.
 *
 * Un deviz ANULAT ramine inchis: anularea e o decizie luata, nu o stare de
 * lucru.
 */
export function isEditable(estimate: {
  status: string;
  invoiceCount: number;
  progressCount: number;
}): boolean {
  if (estimate.status === "ANULAT") return false;
  return estimate.invoiceCount === 0 && estimate.progressCount === 0;
}

/**
 * De ce s-a inchis devizul, in cuvintele omului.
 *
 * "Nu mai e ciorna" nu spunea nimic util: acum devizul se inchide dintr-un
 * motiv anume, iar omul trebuie sa stie care, ca sa stie si ce are de facut —
 * storneaza factura, sau isi vede de un deviz nou.
 */
export function lockReason(estimate: {
  status: string;
  _count: { invoices: number; progressReports: number };
}): string {
  if (estimate.status === "ANULAT") return "Devizul e anulat si nu mai poate fi modificat";
  if (estimate._count.invoices > 0) {
    return "Devizul are deja factura emisa. Storneaz-o intii, daca trebuie schimbat ceva";
  }
  if (estimate._count.progressReports > 0) {
    return "Devizul are situatii de lucrari. Cantitatile contractate nu se mai schimba sub o situatie inregistrata";
  }
  return "Devizul nu poate fi modificat";
}
