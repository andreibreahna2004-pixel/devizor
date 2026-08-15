import { COUNTIES, isBucharest, isValidCountyCode } from "@/lib/counties";
import { round2 } from "@/lib/money";
import { computeInvoiceLine, computeInvoiceTotals } from "@/lib/pricing/calculator";

/**
 * Generator de e-Factura in format UBL 2.1, conform CIUS-RO.
 *
 * Modul pur: primeste un obiect simplu, intoarce XML. Fara acces la baza de
 * date, ca sa poata fi testat direct impotriva unui XML de referinta.
 *
 * Reguli specific romanesti care ne-au modelat codul:
 *  - `cbc:CountrySubentity` (judetul, cod ISO 3166-2:RO) e obligatoriu in
 *    ambele adrese; validatorul ANAF respinge factura fara el.
 *  - In Bucuresti, `cbc:CityName` trebuie sa fie sectorul, scris "SECTOR n".
 *  - TVA-ul se declara pe grupa de cota, calculat din baza insumata, nu prin
 *    adunarea TVA-ului de pe linii (EN 16931, regula BR-CO-17).
 */

export const CIUS_RO_CUSTOMIZATION =
  "urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1";

/** 380 = factura comerciala; 381 = nota de credit (storno). */
export const INVOICE_TYPE_CODE = 380;
export const CREDIT_NOTE_TYPE_CODE = 381;

export interface UblParty {
  name: string;
  cui: string | null;
  vatPayer: boolean;
  regCom: string | null;
  address: string | null;
  city: string | null;
  countyCode: string | null;
  postalCode: string | null;
  country: string;
  email?: string | null;
  phone?: string | null;
  iban?: string | null;
  bank?: string | null;
}

export interface UblLine {
  code: string | null;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
}

export interface UblInvoice {
  fullNumber: string;
  issueDate: Date;
  dueDate: Date;
  supplyDate?: Date | null;
  currency: string;
  supplier: UblParty;
  customer: UblParty;
  lines: UblLine[];
  notes?: string | null;
  /** Numarul facturii stornate, pentru nota de credit. */
  reversalOf?: string | null;
}

/**
 * Codurile UN/ECE Rec 20 pentru unitatile de masura folosite in constructii.
 * Validatorul ANAF accepta doar coduri din nomenclator, nu "mp" sau "mc".
 */
const UNIT_CODES: Record<string, string> = {
  buc: "H87", // piece
  bucata: "H87",
  mp: "MTK", // square metre
  mc: "MTQ", // cubic metre
  ml: "MTR", // metre
  m: "MTR",
  kg: "KGM",
  to: "TNE", // tonne
  t: "TNE",
  l: "LTR",
  ora: "HUR",
  ore: "HUR",
  luna: "MON",
  set: "SET",
  kit: "SET",
};

/** Codul UN/ECE pentru o unitate de masura; H87 (bucata) ca ultima solutie. */
export function unitCode(unit: string): string {
  return UNIT_CODES[unit.trim().toLowerCase()] ?? "H87";
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(value: number): string {
  return round2(value).toFixed(2);
}

/** CUI cu prefix RO pentru platitorii de TVA, fara prefix in rest. */
export function taxId(party: UblParty): string {
  const digits = (party.cui ?? "").replace(/^RO/i, "").trim();
  return party.vatPayer ? `RO${digits}` : digits;
}

/**
 * Localitatea, in forma pe care o cere CIUS-RO.
 * Pentru Bucuresti trebuie sa fie sectorul, scris exact "SECTOR n".
 */
export function cityName(party: UblParty): string {
  const city = (party.city ?? "").trim();
  if (!isBucharest(party.countyCode)) return city;

  const sector = city.match(/(\d)/)?.[1];
  return sector ? `SECTOR ${sector}` : city.toUpperCase();
}

function renderAddress(party: UblParty, indent: string): string {
  const lines = [
    `${indent}<cac:PostalAddress>`,
    `${indent}  <cbc:StreetName>${esc(party.address ?? "")}</cbc:StreetName>`,
    `${indent}  <cbc:CityName>${esc(cityName(party))}</cbc:CityName>`,
  ];

  if (party.postalCode) {
    lines.push(`${indent}  <cbc:PostalZone>${esc(party.postalCode)}</cbc:PostalZone>`);
  }

  // Obligatoriu in CIUS-RO. Fara el, factura e respinsa la incarcarea in SPV.
  lines.push(
    `${indent}  <cbc:CountrySubentity>${esc(party.countyCode ?? "")}</cbc:CountrySubentity>`,
    `${indent}  <cac:Country>`,
    `${indent}    <cbc:IdentificationCode>${esc(party.country || "RO")}</cbc:IdentificationCode>`,
    `${indent}  </cac:Country>`,
    `${indent}</cac:PostalAddress>`,
  );

  return lines.join("\n");
}

function renderParty(party: UblParty, indent: string): string {
  const id = taxId(party);
  const lines: string[] = [`${indent}<cac:Party>`];

  if (id) {
    lines.push(
      `${indent}  <cac:PartyIdentification>`,
      `${indent}    <cbc:ID>${esc(id)}</cbc:ID>`,
      `${indent}  </cac:PartyIdentification>`,
    );
  }

  lines.push(
    `${indent}  <cac:PartyName>`,
    `${indent}    <cbc:Name>${esc(party.name)}</cbc:Name>`,
    `${indent}  </cac:PartyName>`,
    renderAddress(party, `${indent}  `),
  );

  // PartyTaxScheme se completeaza doar pentru platitorii de TVA.
  if (party.vatPayer && id) {
    lines.push(
      `${indent}  <cac:PartyTaxScheme>`,
      `${indent}    <cbc:CompanyID>${esc(id)}</cbc:CompanyID>`,
      `${indent}    <cac:TaxScheme>`,
      `${indent}      <cbc:ID>VAT</cbc:ID>`,
      `${indent}    </cac:TaxScheme>`,
      `${indent}  </cac:PartyTaxScheme>`,
    );
  }

  lines.push(
    `${indent}  <cac:PartyLegalEntity>`,
    `${indent}    <cbc:RegistrationName>${esc(party.name)}</cbc:RegistrationName>`,
  );
  if (party.regCom) {
    lines.push(
      `${indent}    <cbc:CompanyID>${esc(party.regCom)}</cbc:CompanyID>`,
    );
  }
  lines.push(`${indent}  </cac:PartyLegalEntity>`);

  if (party.email || party.phone) {
    lines.push(`${indent}  <cac:Contact>`);
    if (party.phone) {
      lines.push(`${indent}    <cbc:Telephone>${esc(party.phone)}</cbc:Telephone>`);
    }
    if (party.email) {
      lines.push(
        `${indent}    <cbc:ElectronicMail>${esc(party.email)}</cbc:ElectronicMail>`,
      );
    }
    lines.push(`${indent}  </cac:Contact>`);
  }

  lines.push(`${indent}</cac:Party>`);
  return lines.join("\n");
}

/**
 * Categoria de TVA din EN 16931:
 *  S = cota standard, Z = cota zero, O = neplatitor / in afara sferei TVA.
 */
function taxCategory(rate: number, supplierIsVatPayer: boolean): string {
  if (!supplierIsVatPayer) return "O";
  return rate > 0 ? "S" : "Z";
}

/**
 * Rotunjeste preturile unitare la 2 zecimale INAINTE de orice calcul.
 *
 * XML-ul emite `cbc:PriceAmount` cu doua zecimale. Daca valoarea liniei s-ar
 * calcula din pretul nerotunjit, ar rezulta un document care nu se verifica cu
 * el insusi — cantitate x pret afisat nu ar da valoarea afisata — iar
 * validatorul ANAF respinge exact asta. Normalizand aici, tot ce urmeaza
 * (linii, grupe de TVA, totaluri) pleaca de la aceleasi cifre care ajung in
 * fisier.
 */
function normalizeLines(lines: UblLine[]): UblLine[] {
  return lines.map((line) => ({ ...line, unitPrice: round2(line.unitPrice) }));
}

export function buildInvoiceXml(input: UblInvoice): string {
  const invoice: UblInvoice = { ...input, lines: normalizeLines(input.lines) };
  const isCreditNote = Boolean(invoice.reversalOf);
  const typeCode = isCreditNote ? CREDIT_NOTE_TYPE_CODE : INVOICE_TYPE_CODE;
  const totals = computeInvoiceTotals(invoice.lines);
  const currency = invoice.currency || "RON";

  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"',
    '         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"',
    '         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">',
    `  <cbc:CustomizationID>${CIUS_RO_CUSTOMIZATION}</cbc:CustomizationID>`,
    `  <cbc:ID>${esc(invoice.fullNumber)}</cbc:ID>`,
    `  <cbc:IssueDate>${iso(invoice.issueDate)}</cbc:IssueDate>`,
    `  <cbc:DueDate>${iso(invoice.dueDate)}</cbc:DueDate>`,
    `  <cbc:InvoiceTypeCode>${typeCode}</cbc:InvoiceTypeCode>`,
  ];

  if (invoice.notes) {
    out.push(`  <cbc:Note>${esc(invoice.notes)}</cbc:Note>`);
  }

  out.push(
    `  <cbc:DocumentCurrencyCode>${esc(currency)}</cbc:DocumentCurrencyCode>`,
  );

  // Data livrarii se declara doar cand difera de data emiterii.
  if (invoice.supplyDate && iso(invoice.supplyDate) !== iso(invoice.issueDate)) {
    out.push(
      "  <cac:InvoicePeriod>",
      `    <cbc:EndDate>${iso(invoice.supplyDate)}</cbc:EndDate>`,
      "  </cac:InvoicePeriod>",
    );
  }

  if (invoice.reversalOf) {
    out.push(
      "  <cac:BillingReference>",
      "    <cac:InvoiceDocumentReference>",
      `      <cbc:ID>${esc(invoice.reversalOf)}</cbc:ID>`,
      "    </cac:InvoiceDocumentReference>",
      "  </cac:BillingReference>",
    );
  }

  out.push(
    "  <cac:AccountingSupplierParty>",
    renderParty(invoice.supplier, "    "),
    "  </cac:AccountingSupplierParty>",
    "  <cac:AccountingCustomerParty>",
    renderParty(invoice.customer, "    "),
    "  </cac:AccountingCustomerParty>",
  );

  if (invoice.supplier.iban) {
    out.push(
      "  <cac:PaymentMeans>",
      // 31 = virament bancar
      "    <cbc:PaymentMeansCode>31</cbc:PaymentMeansCode>",
      "    <cac:PayeeFinancialAccount>",
      `      <cbc:ID>${esc(invoice.supplier.iban)}</cbc:ID>`,
    );
    if (invoice.supplier.bank) {
      out.push(`      <cbc:Name>${esc(invoice.supplier.bank)}</cbc:Name>`);
    }
    out.push("    </cac:PayeeFinancialAccount>", "  </cac:PaymentMeans>");
  }

  // --- TaxTotal, cu cate un TaxSubtotal pe fiecare cota ---
  out.push(
    "  <cac:TaxTotal>",
    `    <cbc:TaxAmount currencyID="${currency}">${money(totals.vatAmount)}</cbc:TaxAmount>`,
  );

  for (const group of totals.vatGroups) {
    const category = taxCategory(group.vatRate, invoice.supplier.vatPayer);
    out.push(
      "    <cac:TaxSubtotal>",
      `      <cbc:TaxableAmount currencyID="${currency}">${money(group.taxableAmount)}</cbc:TaxableAmount>`,
      `      <cbc:TaxAmount currencyID="${currency}">${money(group.vatAmount)}</cbc:TaxAmount>`,
      "      <cac:TaxCategory>",
      `        <cbc:ID>${category}</cbc:ID>`,
      `        <cbc:Percent>${round2(group.vatRate).toFixed(2)}</cbc:Percent>`,
    );
    if (category === "O") {
      out.push(
        "        <cbc:TaxExemptionReasonCode>VATEX-EU-O</cbc:TaxExemptionReasonCode>",
        "        <cbc:TaxExemptionReason>Neplatitor de TVA</cbc:TaxExemptionReason>",
      );
    }
    out.push(
      "        <cac:TaxScheme>",
      "          <cbc:ID>VAT</cbc:ID>",
      "        </cac:TaxScheme>",
      "      </cac:TaxCategory>",
      "    </cac:TaxSubtotal>",
    );
  }

  out.push("  </cac:TaxTotal>");

  out.push(
    "  <cac:LegalMonetaryTotal>",
    `    <cbc:LineExtensionAmount currencyID="${currency}">${money(totals.netTotal)}</cbc:LineExtensionAmount>`,
    `    <cbc:TaxExclusiveAmount currencyID="${currency}">${money(totals.netTotal)}</cbc:TaxExclusiveAmount>`,
    `    <cbc:TaxInclusiveAmount currencyID="${currency}">${money(totals.grandTotal)}</cbc:TaxInclusiveAmount>`,
    `    <cbc:PayableAmount currencyID="${currency}">${money(totals.grandTotal)}</cbc:PayableAmount>`,
    "  </cac:LegalMonetaryTotal>",
  );

  invoice.lines.forEach((line, index) => {
    const lineTotals = computeInvoiceLine(line);
    const category = taxCategory(line.vatRate, invoice.supplier.vatPayer);

    out.push(
      "  <cac:InvoiceLine>",
      `    <cbc:ID>${index + 1}</cbc:ID>`,
      `    <cbc:InvoicedQuantity unitCode="${unitCode(line.unit)}">${line.quantity}</cbc:InvoicedQuantity>`,
      `    <cbc:LineExtensionAmount currencyID="${currency}">${money(lineTotals.netAmount)}</cbc:LineExtensionAmount>`,
      "    <cac:Item>",
      `      <cbc:Name>${esc(line.name)}</cbc:Name>`,
    );

    if (line.code) {
      out.push(
        "      <cac:SellersItemIdentification>",
        `        <cbc:ID>${esc(line.code)}</cbc:ID>`,
        "      </cac:SellersItemIdentification>",
      );
    }

    out.push(
      "      <cac:ClassifiedTaxCategory>",
      `        <cbc:ID>${category}</cbc:ID>`,
      `        <cbc:Percent>${round2(line.vatRate).toFixed(2)}</cbc:Percent>`,
      "        <cac:TaxScheme>",
      "          <cbc:ID>VAT</cbc:ID>",
      "        </cac:TaxScheme>",
      "      </cac:ClassifiedTaxCategory>",
      "    </cac:Item>",
      "    <cac:Price>",
      `      <cbc:PriceAmount currencyID="${currency}">${round2(line.unitPrice).toFixed(2)}</cbc:PriceAmount>`,
      "    </cac:Price>",
      "  </cac:InvoiceLine>",
    );
  });

  out.push("</Invoice>");
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Validare
// ---------------------------------------------------------------------------

export interface ValidationProblem {
  field: string;
  message: string;
}

const COUNTY_NAMES = new Map(COUNTIES.map((c) => [c.code, c.name]));

/**
 * Verifica factura inainte de export.
 *
 * Mesajele sunt in romana si spun exact ce lipseste si unde se completeaza —
 * altfel utilizatorul descopera problema abia cand SPV-ul respinge factura,
 * cu un cod de eroare pe care nu-l poate interpreta.
 */
export function validateForEfactura(invoice: UblInvoice): ValidationProblem[] {
  const problems: ValidationProblem[] = [];

  const checkParty = (party: UblParty, who: string, prefix: string) => {
    if (!party.name?.trim()) {
      problems.push({ field: `${prefix}.name`, message: `Lipseste denumirea ${who}.` });
    }
    if (!party.cui?.replace(/^RO/i, "").trim()) {
      problems.push({ field: `${prefix}.cui`, message: `Lipseste CUI-ul ${who}.` });
    }
    if (!party.address?.trim()) {
      problems.push({ field: `${prefix}.address`, message: `Lipseste adresa ${who}.` });
    }
    if (!party.city?.trim()) {
      problems.push({
        field: `${prefix}.city`,
        message: `Lipseste localitatea ${who}.`,
      });
    }
    if (!isValidCountyCode(party.countyCode)) {
      problems.push({
        field: `${prefix}.countyCode`,
        message: `Lipseste judetul ${who}. e-Factura il cere obligatoriu, in nomenclatorul ISO 3166-2:RO.`,
      });
    }
    if (isBucharest(party.countyCode) && !/\d/.test(party.city ?? "")) {
      problems.push({
        field: `${prefix}.city`,
        message: `Pentru Bucuresti, localitatea ${who} trebuie sa fie sectorul (ex. "Sector 3").`,
      });
    }
  };

  checkParty(invoice.supplier, "furnizorului", "supplier");
  checkParty(invoice.customer, "beneficiarului", "customer");

  if (!invoice.fullNumber?.trim()) {
    problems.push({ field: "number", message: "Factura nu are numar." });
  }

  if (invoice.dueDate < invoice.issueDate) {
    problems.push({
      field: "dueDate",
      message: "Scadenta este inaintea datei de emitere.",
    });
  }

  if (invoice.lines.length === 0) {
    problems.push({ field: "lines", message: "Factura nu are nicio linie." });
  }

  invoice.lines.forEach((line, index) => {
    const position = index + 1;
    if (!line.name?.trim()) {
      problems.push({
        field: `lines.${index}.name`,
        message: `Linia ${position} nu are denumire.`,
      });
    }
    if (!Number.isFinite(line.quantity) || line.quantity === 0) {
      problems.push({
        field: `lines.${index}.quantity`,
        message: `Linia ${position} are cantitatea zero sau invalida.`,
      });
    }
    if (!UNIT_CODES[line.unit?.trim().toLowerCase()]) {
      problems.push({
        field: `lines.${index}.unit`,
        message: `Unitatea de masura "${line.unit}" de pe linia ${position} nu are corespondent in nomenclatorul UN/ECE si va fi exportata ca bucata.`,
      });
    }
  });

  if (invoice.currency && invoice.currency !== "RON") {
    problems.push({
      field: "currency",
      message: `Moneda ${invoice.currency} necesita cursul BNR la data emiterii.`,
    });
  }

  return problems;
}

/** Denumirea judetului dintr-un cod, pentru mesaje si PDF. */
export function countyLabel(code: string | null): string {
  if (!code) return "";
  return COUNTY_NAMES.get(code) ?? code;
}
