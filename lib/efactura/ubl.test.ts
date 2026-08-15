import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import {
  CIUS_RO_CUSTOMIZATION,
  type UblInvoice,
  type UblParty,
  buildInvoiceXml,
  cityName,
  taxId,
  unitCode,
  validateForEfactura,
} from "./ubl";

const supplier: UblParty = {
  name: "Construct Expert SRL",
  cui: "12345678",
  vatPayer: true,
  regCom: "J40/1234/2020",
  address: "Str. Constructorilor nr. 12",
  city: "Cluj-Napoca",
  countyCode: "RO-CJ",
  postalCode: "400001",
  country: "RO",
  iban: "RO49AAAA1B31007593840000",
  bank: "Banca Transilvania",
  email: "office@construct.ro",
  phone: "0264111222",
};

const customer: UblParty = {
  name: "Beneficiar SRL",
  cui: "87654321",
  vatPayer: true,
  regCom: "J12/999/2019",
  address: "Bd. Eroilor nr. 5",
  city: "Cluj-Napoca",
  countyCode: "RO-CJ",
  postalCode: "400002",
  country: "RO",
};

const invoice: UblInvoice = {
  fullNumber: "FCT-000042",
  issueDate: new Date("2026-03-15T10:00:00Z"),
  dueDate: new Date("2026-04-14T10:00:00Z"),
  currency: "RON",
  supplier,
  customer,
  lines: [
    {
      code: "ZID-010",
      name: "Zidarie din BCA de 30 cm",
      unit: "mc",
      quantity: 34.5,
      unitPrice: 745,
      vatRate: 21,
    },
    {
      code: "TEN-010",
      name: "Tencuiala mecanizata la interior",
      unit: "mp",
      quantity: 220,
      unitPrice: 39,
      vatRate: 21,
    },
  ],
};

describe("buildInvoiceXml", () => {
  const xml = buildInvoiceXml(invoice);

  it("declara profilul CIUS-RO si tipul de document", () => {
    expect(xml).toContain(`<cbc:CustomizationID>${CIUS_RO_CUSTOMIZATION}</cbc:CustomizationID>`);
    expect(xml).toContain("<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>");
    expect(xml).toContain("<cbc:ID>FCT-000042</cbc:ID>");
    expect(xml).toContain("<cbc:DocumentCurrencyCode>RON</cbc:DocumentCurrencyCode>");
  });

  it("include judetul in ambele adrese", () => {
    // Fara CountrySubentity, ANAF respinge factura. Doua adrese -> doua aparitii.
    const occurrences = xml.match(/<cbc:CountrySubentity>RO-CJ<\/cbc:CountrySubentity>/g);
    expect(occurrences).toHaveLength(2);
  });

  it("prefixeaza CUI-ul cu RO pentru platitorii de TVA", () => {
    expect(xml).toContain("<cbc:ID>RO12345678</cbc:ID>");
    expect(xml).toContain("<cbc:CompanyID>RO12345678</cbc:CompanyID>");
  });

  it("converteste unitatile de masura in coduri UN/ECE", () => {
    // Factura are o linie in mc si una in mp; nicaieri nu apar "mc"/"mp" ca atare.
    expect(xml).toContain('unitCode="MTQ"'); // mc
    expect(xml).toContain('unitCode="MTK"'); // mp
    expect(xml).not.toContain('unitCode="mc"');
    expect(xml).not.toContain('unitCode="mp"');
  });

  it("calculeaza TVA-ul pe grupa de cota, nu prin insumarea liniilor", () => {
    // Baza: 34,5 x 745 = 25702,50 ; 220 x 39 = 8580 -> 34282,50
    // TVA 21% pe baza insumata = 7199,33
    expect(xml).toContain(
      '<cbc:TaxableAmount currencyID="RON">34282.50</cbc:TaxableAmount>',
    );
    expect(xml).toContain('<cbc:TaxAmount currencyID="RON">7199.33</cbc:TaxAmount>');
    expect(xml).toContain(
      '<cbc:TaxInclusiveAmount currencyID="RON">41481.83</cbc:TaxInclusiveAmount>',
    );
  });

  it("emite cate un TaxSubtotal pentru fiecare cota de TVA", () => {
    const mixed = buildInvoiceXml({
      ...invoice,
      lines: [
        { ...invoice.lines[0], vatRate: 21 },
        { ...invoice.lines[1], vatRate: 11 },
      ],
    });
    expect(mixed.match(/<cac:TaxSubtotal>/g)).toHaveLength(2);
    expect(mixed).toContain("<cbc:Percent>11.00</cbc:Percent>");
    expect(mixed).toContain("<cbc:Percent>21.00</cbc:Percent>");
  });

  it("include IBAN-ul si modalitatea de plata", () => {
    expect(xml).toContain("<cbc:PaymentMeansCode>31</cbc:PaymentMeansCode>");
    expect(xml).toContain("<cbc:ID>RO49AAAA1B31007593840000</cbc:ID>");
  });

  it("escapeaza caracterele speciale din denumiri", () => {
    const risky = buildInvoiceXml({
      ...invoice,
      customer: { ...customer, name: 'Ion & "Fiii" <SRL>' },
    });
    expect(risky).toContain("Ion &amp; &quot;Fiii&quot; &lt;SRL&gt;");
    expect(risky).not.toContain('<cbc:Name>Ion & "Fiii" <SRL></cbc:Name>');
  });

  it("marcheaza stornarea ca nota de credit cu referinta la factura initiala", () => {
    const storno = buildInvoiceXml({
      ...invoice,
      fullNumber: "FCT-000043",
      reversalOf: "FCT-000042",
      lines: invoice.lines.map((l) => ({ ...l, quantity: -l.quantity })),
    });
    expect(storno).toContain("<cbc:InvoiceTypeCode>381</cbc:InvoiceTypeCode>");
    expect(storno).toContain("<cac:BillingReference>");
    expect(storno).toContain("<cbc:ID>FCT-000042</cbc:ID>");
  });

  it("foloseste categoria O pentru un furnizor neplatitor de TVA", () => {
    const noVat = buildInvoiceXml({
      ...invoice,
      supplier: { ...supplier, vatPayer: false },
      lines: invoice.lines.map((l) => ({ ...l, vatRate: 0 })),
    });
    expect(noVat).toContain("<cbc:ID>O</cbc:ID>");
    expect(noVat).toContain("VATEX-EU-O");
    // Fara prefixul RO pe CUI-ul unui neplatitor.
    expect(noVat).not.toContain("<cbc:ID>RO12345678</cbc:ID>");
  });

  it("se verifica cu el insusi: cantitate x pret afisat = valoarea afisata", () => {
    // Bug-ul pe care il previne: XML-ul emitea PriceAmount rotunjit la doi
    // zecimali, dar calcula LineExtensionAmount din pretul cu patru. Rezulta un
    // document in care coloanele nu se aduna — respins de validatorul ANAF.
    const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@" })
      .parse(buildInvoiceXml({
        ...invoice,
        lines: [
          // Pret cu patru zecimale, exact cazul care strica rotunjirea.
          { ...invoice.lines[0], unitPrice: 745.1234, quantity: 34.5 },
          { ...invoice.lines[1], unitPrice: 39.5678, quantity: 220 },
        ],
      }));

    const root = parsed.Invoice;
    const lines = root["cac:InvoiceLine"];
    let sumOfLines = 0;

    for (const line of lines) {
      const price = Number(line["cac:Price"]["cbc:PriceAmount"]["#text"]);
      const qty = Number(line["cbc:InvoicedQuantity"]["#text"]);
      const net = Number(line["cbc:LineExtensionAmount"]["#text"]);

      expect(net).toBeCloseTo(Math.round(qty * price * 100) / 100, 2);
      sumOfLines += net;
    }

    // Suma liniilor trebuie sa fie baza impozabila declarata si totalul net.
    const taxable = Number(root["cac:TaxTotal"]["cac:TaxSubtotal"]["cbc:TaxableAmount"]["#text"]);
    const lineTotal = Number(root["cac:LegalMonetaryTotal"]["cbc:LineExtensionAmount"]["#text"]);

    expect(Math.round(sumOfLines * 100) / 100).toBe(taxable);
    expect(taxable).toBe(lineTotal);
  });

  it("inchide totalul: net + TVA = de plata", () => {
    const root = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@" })
      .parse(xml).Invoice;
    const monetary = root["cac:LegalMonetaryTotal"];

    const net = Number(monetary["cbc:TaxExclusiveAmount"]["#text"]);
    const gross = Number(monetary["cbc:TaxInclusiveAmount"]["#text"]);
    const payable = Number(monetary["cbc:PayableAmount"]["#text"]);
    const vat = Number(root["cac:TaxTotal"]["cbc:TaxAmount"]["#text"]);

    expect(Math.round((net + vat) * 100) / 100).toBe(gross);
    expect(payable).toBe(gross);
  });

  it("produce un XML bine format, verificat cu un parser real", () => {
    // Potrivirile pe text nu prind un document prost inchis; parserul da.
    const check = XMLValidator.validate(xml);
    expect(check).toBe(true);
  });

  it("are structura pe care o asteapta validatorul, citita din arbore", () => {
    const parsed = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@",
    }).parse(xml);

    const root = parsed.Invoice;
    expect(root["cbc:CustomizationID"]).toBe(CIUS_RO_CUSTOMIZATION);
    expect(root["cbc:InvoiceTypeCode"]).toBe(380);
    expect(root["cbc:DocumentCurrencyCode"]).toBe("RON");

    // Doua linii, doua parti, o singura grupa de TVA (ambele linii la 21%).
    expect(root["cac:InvoiceLine"]).toHaveLength(2);
    expect(root["cac:AccountingSupplierParty"]["cac:Party"]["cac:PartyName"]["cbc:Name"])
      .toBe("Construct Expert SRL");
    expect(root["cac:TaxTotal"]["cac:TaxSubtotal"]["cbc:TaxAmount"]["#text"]).toBe(7199.33);

    // Judetul, obligatoriu in CIUS-RO, exista in adresa beneficiarului.
    const customerAddress =
      root["cac:AccountingCustomerParty"]["cac:Party"]["cac:PostalAddress"];
    expect(customerAddress["cbc:CountrySubentity"]).toBe("RO-CJ");
    expect(customerAddress["cac:Country"]["cbc:IdentificationCode"]).toBe("RO");
  });

  it("ramane bine format cand denumirile contin caractere XML", () => {
    const risky = buildInvoiceXml({
      ...invoice,
      customer: { ...customer, name: 'Ion & "Fiii" <SRL> \'test\'' },
      notes: "Nota cu <tag> & ampersand",
    });
    expect(XMLValidator.validate(risky)).toBe(true);

    const parsed = new XMLParser().parse(risky);
    // Parserul trebuie sa intoarca denumirea originala, nu una stricata.
    expect(
      parsed.Invoice["cac:AccountingCustomerParty"]["cac:Party"]["cac:PartyName"]["cbc:Name"],
    ).toBe('Ion & "Fiii" <SRL> \'test\'');
  });
});

describe("taxId", () => {
  it("prefixeaza cu RO doar platitorii de TVA", () => {
    expect(taxId({ ...supplier, vatPayer: true })).toBe("RO12345678");
    expect(taxId({ ...supplier, vatPayer: false })).toBe("12345678");
  });

  it("nu dubleaza prefixul cand CUI-ul e deja scris cu RO", () => {
    expect(taxId({ ...supplier, cui: "RO12345678", vatPayer: true })).toBe("RO12345678");
  });
});

describe("cityName", () => {
  it("normalizeaza sectoarele Bucurestiului la forma ceruta de ANAF", () => {
    const buc = { ...customer, countyCode: "RO-B" };
    expect(cityName({ ...buc, city: "Sector 3" })).toBe("SECTOR 3");
    expect(cityName({ ...buc, city: "sectorul 1" })).toBe("SECTOR 1");
    expect(cityName({ ...buc, city: "Bucuresti Sector 6" })).toBe("SECTOR 6");
  });

  it("lasa neatinse localitatile din restul tarii", () => {
    expect(cityName(customer)).toBe("Cluj-Napoca");
  });
});

describe("unitCode", () => {
  it("mapeaza unitatile romanesti pe nomenclatorul UN/ECE", () => {
    expect(unitCode("mp")).toBe("MTK");
    expect(unitCode("mc")).toBe("MTQ");
    expect(unitCode("ml")).toBe("MTR");
    expect(unitCode("buc")).toBe("H87");
    expect(unitCode("to")).toBe("TNE");
    expect(unitCode("ORA")).toBe("HUR");
  });

  it("cade pe bucata pentru unitati necunoscute", () => {
    expect(unitCode("galeti")).toBe("H87");
  });
});

describe("validateForEfactura", () => {
  it("nu semnaleaza nimic pentru o factura completa", () => {
    expect(validateForEfactura(invoice)).toEqual([]);
  });

  it("cere judetul, care e obligatoriu in CIUS-RO", () => {
    const problems = validateForEfactura({
      ...invoice,
      customer: { ...customer, countyCode: null },
    });
    expect(problems.some((p) => p.field === "customer.countyCode")).toBe(true);
    expect(problems[0]?.message).toMatch(/judetul/i);
  });

  it("respinge un cod de judet care nu e in nomenclator", () => {
    const problems = validateForEfactura({
      ...invoice,
      customer: { ...customer, countyCode: "RO-XX" },
    });
    expect(problems.some((p) => p.field === "customer.countyCode")).toBe(true);
  });

  it("cere sectorul pentru adresele din Bucuresti", () => {
    const problems = validateForEfactura({
      ...invoice,
      customer: { ...customer, countyCode: "RO-B", city: "Bucuresti" },
    });
    expect(problems.some((p) => p.field === "customer.city")).toBe(true);
  });

  it("accepta Bucuresti cand localitatea contine sectorul", () => {
    const problems = validateForEfactura({
      ...invoice,
      customer: { ...customer, countyCode: "RO-B", city: "Sector 2" },
    });
    expect(problems).toEqual([]);
  });

  it("semnaleaza CUI-ul lipsa al beneficiarului", () => {
    const problems = validateForEfactura({
      ...invoice,
      customer: { ...customer, cui: null },
    });
    expect(problems.some((p) => p.field === "customer.cui")).toBe(true);
  });

  it("semnaleaza scadenta inaintea emiterii", () => {
    const problems = validateForEfactura({
      ...invoice,
      dueDate: new Date("2026-03-01T00:00:00Z"),
    });
    expect(problems.some((p) => p.field === "dueDate")).toBe(true);
  });

  it("semnaleaza liniile cu cantitate zero", () => {
    const problems = validateForEfactura({
      ...invoice,
      lines: [{ ...invoice.lines[0], quantity: 0 }],
    });
    expect(problems.some((p) => p.field === "lines.0.quantity")).toBe(true);
  });

  it("avertizeaza pentru o unitate de masura fara corespondent UN/ECE", () => {
    const problems = validateForEfactura({
      ...invoice,
      lines: [{ ...invoice.lines[0], unit: "galeti" }],
    });
    expect(problems.some((p) => p.field === "lines.0.unit")).toBe(true);
  });

  it("cere cursul BNR pentru facturile in alta moneda", () => {
    const problems = validateForEfactura({ ...invoice, currency: "EUR" });
    expect(problems.some((p) => p.field === "currency")).toBe(true);
  });
});
