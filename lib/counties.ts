/**
 * Judetele Romaniei cu codurile ISO 3166-2:RO.
 *
 * Codul este obligatoriu in e-Factura (elementul `cbc:CountrySubentity` din
 * adresa), iar validatorul ANAF respinge factura daca lipseste sau nu e din
 * nomenclator. De aceea codul, nu denumirea, este ce stocam in baza de date.
 */

export interface County {
  code: string;
  name: string;
}

export const COUNTIES: County[] = [
  { code: "RO-AB", name: "Alba" },
  { code: "RO-AR", name: "Arad" },
  { code: "RO-AG", name: "Arges" },
  { code: "RO-BC", name: "Bacau" },
  { code: "RO-BH", name: "Bihor" },
  { code: "RO-BN", name: "Bistrita-Nasaud" },
  { code: "RO-BT", name: "Botosani" },
  { code: "RO-BR", name: "Braila" },
  { code: "RO-BV", name: "Brasov" },
  { code: "RO-B", name: "Bucuresti" },
  { code: "RO-BZ", name: "Buzau" },
  { code: "RO-CL", name: "Calarasi" },
  { code: "RO-CS", name: "Caras-Severin" },
  { code: "RO-CJ", name: "Cluj" },
  { code: "RO-CT", name: "Constanta" },
  { code: "RO-CV", name: "Covasna" },
  { code: "RO-DB", name: "Dambovita" },
  { code: "RO-DJ", name: "Dolj" },
  { code: "RO-GL", name: "Galati" },
  { code: "RO-GR", name: "Giurgiu" },
  { code: "RO-GJ", name: "Gorj" },
  { code: "RO-HR", name: "Harghita" },
  { code: "RO-HD", name: "Hunedoara" },
  { code: "RO-IL", name: "Ialomita" },
  { code: "RO-IS", name: "Iasi" },
  { code: "RO-IF", name: "Ilfov" },
  { code: "RO-MM", name: "Maramures" },
  { code: "RO-MH", name: "Mehedinti" },
  { code: "RO-MS", name: "Mures" },
  { code: "RO-NT", name: "Neamt" },
  { code: "RO-OT", name: "Olt" },
  { code: "RO-PH", name: "Prahova" },
  { code: "RO-SJ", name: "Salaj" },
  { code: "RO-SM", name: "Satu Mare" },
  { code: "RO-SB", name: "Sibiu" },
  { code: "RO-SV", name: "Suceava" },
  { code: "RO-TR", name: "Teleorman" },
  { code: "RO-TM", name: "Timis" },
  { code: "RO-TL", name: "Tulcea", },
  { code: "RO-VL", name: "Valcea" },
  { code: "RO-VS", name: "Vaslui" },
  { code: "RO-VN", name: "Vrancea" },
];

const BY_CODE = new Map(COUNTIES.map((c) => [c.code, c]));

export function countyName(code: string | null | undefined): string {
  if (!code) return "";
  return BY_CODE.get(code)?.name ?? code;
}

export function isValidCountyCode(code: string | null | undefined): boolean {
  return !!code && BY_CODE.has(code);
}

/**
 * In Bucuresti, e-Factura cere ca localitatea sa fie sectorul, scris exact in
 * forma "SECTOR 1".. "SECTOR 6". Restul tarii foloseste numele localitatii.
 */
export const BUCHAREST_SECTORS = [
  "SECTOR 1",
  "SECTOR 2",
  "SECTOR 3",
  "SECTOR 4",
  "SECTOR 5",
  "SECTOR 6",
];

export function isBucharest(countyCode: string | null | undefined): boolean {
  return countyCode === "RO-B";
}
