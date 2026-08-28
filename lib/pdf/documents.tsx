import "server-only";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { countyLabel } from "@/lib/efactura/ubl";
import type { EstimateForView } from "@/lib/estimates/service";
import type { InvoiceForView, PartySnapshot } from "@/lib/invoices/service";
import { amountInWords, formatLei, formatQty, toNumber } from "@/lib/money";
import {
  computeEstimateLine,
  computeEstimateTotals,
} from "@/lib/pricing/calculator";
import { PDF_FONT, registerPdfFonts } from "./fonts";

const DATE = new Intl.DateTimeFormat("ro-RO", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const styles = StyleSheet.create({
  page: {
    fontFamily: PDF_FONT,
    fontSize: 8.5,
    paddingTop: 32,
    paddingBottom: 44,
    paddingHorizontal: 32,
    color: "#191c24",
  },
  title: { fontSize: 15, fontWeight: 700 },
  subtitle: { fontSize: 9, color: "#66718a", marginTop: 2 },
  parties: { flexDirection: "row", gap: 16, marginTop: 18 },
  party: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: "#d5d9e2",
    borderRadius: 3,
    padding: 8,
  },
  partyLabel: {
    fontSize: 7,
    color: "#66718a",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  partyName: { fontSize: 10, fontWeight: 700, marginBottom: 2 },
  partyLine: { fontSize: 8, color: "#42495c", lineHeight: 1.4 },

  sectionTitle: {
    fontSize: 9,
    fontWeight: 700,
    backgroundColor: "#eceef2",
    paddingVertical: 3.5,
    paddingHorizontal: 5,
    marginTop: 12,
  },

  thead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#191c24",
    paddingBottom: 3,
    paddingTop: 5,
  },
  th: { fontSize: 7, fontWeight: 700, color: "#42495c" },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e3e6ec",
    paddingVertical: 3.5,
  },
  td: { fontSize: 8 },

  colNr: { width: 20 },
  colCode: { width: 48 },
  colName: { flex: 1, paddingRight: 6 },
  colUnit: { width: 28 },
  colQty: { width: 52, textAlign: "right" },
  colPrice: { width: 58, textAlign: "right" },
  colTotal: { width: 66, textAlign: "right" },

  recap: { marginTop: 14, marginLeft: "auto", width: 260 },
  recapRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  recapLabel: { fontSize: 8.5, color: "#42495c" },
  recapValue: { fontSize: 8.5 },
  recapDivider: {
    borderTopWidth: 0.5,
    borderTopColor: "#d5d9e2",
    marginTop: 3,
    paddingTop: 3,
  },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1.2,
    borderTopColor: "#191c24",
    marginTop: 4,
    paddingTop: 4,
  },
  grandLabel: { fontSize: 10, fontWeight: 700 },
  grandValue: { fontSize: 12, fontWeight: 700 },

  notes: { marginTop: 16, fontSize: 8, color: "#42495c", lineHeight: 1.5 },
  words: { marginTop: 8, fontSize: 8.5, color: "#42495c" },

  footer: {
    position: "absolute",
    bottom: 22,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: "#e3e6ec",
    paddingTop: 5,
    fontSize: 7,
    color: "#8590a6",
  },
  signatures: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 26,
  },
  signature: { width: 200 },
  signatureLine: {
    borderTopWidth: 0.5,
    borderTopColor: "#8590a6",
    marginTop: 24,
    paddingTop: 3,
    fontSize: 7.5,
    color: "#66718a",
  },
});

function PartyBox({
  label,
  name,
  cui,
  vatPayer,
  regCom,
  address,
  city,
  countyCode,
  iban,
  bank,
  email,
  phone,
}: {
  label: string;
  name: string;
  cui: string | null;
  vatPayer: boolean;
  regCom: string | null;
  address: string | null;
  city: string | null;
  countyCode: string | null;
  iban?: string | null;
  bank?: string | null;
  email?: string | null;
  phone?: string | null;
}) {
  const taxCode = cui ? `${vatPayer ? "RO" : ""}${cui.replace(/^RO/i, "")}` : null;
  const place = [city, countyLabel(countyCode)].filter(Boolean).join(", ");

  return (
    <View style={styles.party}>
      <Text style={styles.partyLabel}>{label}</Text>
      <Text style={styles.partyName}>{name}</Text>
      {taxCode && <Text style={styles.partyLine}>CUI: {taxCode}</Text>}
      {regCom && <Text style={styles.partyLine}>Reg. Com.: {regCom}</Text>}
      {address && <Text style={styles.partyLine}>{address}</Text>}
      {place && <Text style={styles.partyLine}>{place}</Text>}
      {iban && <Text style={styles.partyLine}>IBAN: {iban}</Text>}
      {bank && <Text style={styles.partyLine}>Banca: {bank}</Text>}
      {phone && <Text style={styles.partyLine}>Tel: {phone}</Text>}
      {email && <Text style={styles.partyLine}>{email}</Text>}
    </View>
  );
}

function Footer({ label }: { label: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>{label}</Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          `Pagina ${pageNumber} din ${totalPages}`
        }
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Deviz
// ---------------------------------------------------------------------------

const ESTIMATE_TITLE = "DEVIZ OFERTA";

/**
 * Devizul se tipareste in landscape, factura ramane portret.
 *
 * Linia are patru coloane de pret plus valoarea. Pe A4 portret raman sub 90pt
 * pentru denumire, iar "Tencuiala interioara driscuita la pereti si tavane" se
 * rupe pe patru rinduri. In landscape denumirea are peste 380pt si tabelul se
 * citeste — asa se tiparesc si formularele de deviz analitic.
 */
function EstimateDocument({ estimate }: { estimate: EstimateForView }) {
  const vatRate = toNumber(estimate.vatRate);

  const priced = estimate.lines.map((line) => ({
    id: line.id,
    sectionId: line.sectionId,
    code: line.code,
    name: line.name,
    unit: line.unit,
    quantity: toNumber(line.quantity),
    materialUnitPrice: toNumber(line.materialUnitPrice),
    laborUnitPrice: toNumber(line.laborUnitPrice),
    equipmentUnitPrice: toNumber(line.equipmentUnitPrice),
    transportUnitPrice: toNumber(line.transportUnitPrice),
  }));

  const totals = computeEstimateTotals(priced, vatRate);

  // Liniile fara sectiune se aduna intr-un grup la final.
  const groups = [
    ...estimate.sections.map((section) => ({
      name: section.name,
      lines: priced.filter((l) => l.sectionId === section.id),
    })),
    { name: "Alte lucrari", lines: priced.filter((l) => !l.sectionId) },
  ].filter((g) => g.lines.length > 0);

  let index = 0;

  return (
    <Document
      title={`${ESTIMATE_TITLE} ${estimate.fullNumber}`}
      author={estimate.org.name}
      language="ro"
    >
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>
          {ESTIMATE_TITLE} {estimate.fullNumber}
        </Text>
        <Text style={styles.subtitle}>
          {estimate.title} · Data: {DATE.format(estimate.issueDate)}
          {estimate.validUntil && ` · Valabil pana la: ${DATE.format(estimate.validUntil)}`}
        </Text>

        <View style={styles.parties}>
          <PartyBox
            label="Executant"
            name={estimate.org.name}
            cui={estimate.org.cui}
            vatPayer={estimate.org.vatPayer}
            regCom={estimate.org.regCom}
            address={estimate.org.address}
            city={estimate.org.city}
            countyCode={estimate.org.countyCode}
            iban={estimate.org.iban}
            bank={estimate.org.bank}
            email={estimate.org.email}
            phone={estimate.org.phone}
          />
          {estimate.client ? (
            <PartyBox
              label="Beneficiar"
              name={estimate.client.name}
              cui={estimate.client.cui}
              vatPayer={estimate.client.vatPayer}
              regCom={estimate.client.regCom}
              address={estimate.client.address}
              city={estimate.client.city}
              countyCode={estimate.client.countyCode}
              email={estimate.client.email}
              phone={estimate.client.phone}
            />
          ) : (
            <View style={styles.party}>
              <Text style={styles.partyLabel}>Beneficiar</Text>
              <Text style={styles.partyLine}>—</Text>
            </View>
          )}
        </View>

        {estimate.project?.address && (
          <Text style={[styles.partyLine, { marginTop: 8 }]}>
            Amplasament: {estimate.project.address}
            {estimate.project.city ? `, ${estimate.project.city}` : ""}
          </Text>
        )}

        {groups.map((group) => (
          <View key={group.name} wrap>
            <Text style={styles.sectionTitle}>{group.name.toUpperCase()}</Text>

            <View style={styles.thead} fixed>
              <Text style={[styles.th, styles.colNr]}>Nr.</Text>
              <Text style={[styles.th, styles.colCode]}>Cod</Text>
              <Text style={[styles.th, styles.colName]}>Denumire lucrare</Text>
              <Text style={[styles.th, styles.colUnit]}>U.M.</Text>
              <Text style={[styles.th, styles.colQty]}>Cantitate</Text>
              <Text style={[styles.th, styles.colPrice]}>Material</Text>
              <Text style={[styles.th, styles.colPrice]}>Manopera</Text>
              <Text style={[styles.th, styles.colPrice]}>Utilaj</Text>
              <Text style={[styles.th, styles.colPrice]}>Transport</Text>
              <Text style={[styles.th, styles.colTotal]}>Valoare</Text>
            </View>

            {group.lines.map((line) => {
              index += 1;
              const lineTotals = computeEstimateLine(line);

              return (
                <View key={line.id} style={styles.tr} wrap={false}>
                  <Text style={[styles.td, styles.colNr]}>{index}</Text>
                  <Text style={[styles.td, styles.colCode]}>{line.code ?? "—"}</Text>
                  <Text style={[styles.td, styles.colName]}>{line.name}</Text>
                  <Text style={[styles.td, styles.colUnit]}>{line.unit}</Text>
                  <Text style={[styles.td, styles.colQty]}>
                    {formatQty(line.quantity)}
                  </Text>
                  <Text style={[styles.td, styles.colPrice]}>
                    {formatLei(line.materialUnitPrice)}
                  </Text>
                  <Text style={[styles.td, styles.colPrice]}>
                    {formatLei(line.laborUnitPrice)}
                  </Text>
                  <Text style={[styles.td, styles.colPrice]}>
                    {formatLei(line.equipmentUnitPrice)}
                  </Text>
                  <Text style={[styles.td, styles.colPrice]}>
                    {formatLei(line.transportUnitPrice)}
                  </Text>
                  <Text style={[styles.td, styles.colTotal]}>
                    {formatLei(lineTotals.total)}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}

        <View style={styles.recap} wrap={false}>
          <Text style={[styles.th, { marginBottom: 3 }]}>RECAPITULATIE</Text>

          <RecapRow label="Materiale" value={totals.totalMaterial} />
          <RecapRow label="Manopera" value={totals.totalLabor} />
          <RecapRow label="Utilaj" value={totals.totalEquipment} />
          <RecapRow label="Transport" value={totals.totalTransport} />

          <View style={styles.recapDivider}>
            <RecapRow label="Total fara TVA" value={totals.netTotal} bold />
          </View>

          <RecapRow label={`TVA ${vatRate}%`} value={totals.vatAmount} />

          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>TOTAL GENERAL</Text>
            <Text style={styles.grandValue}>{formatLei(totals.grandTotal)} lei</Text>
          </View>
        </View>

        {estimate.notes && <Text style={styles.notes}>{estimate.notes}</Text>}

        <View style={styles.signatures} wrap={false}>
          <View style={styles.signature}>
            <Text style={styles.signatureLine}>Executant — nume, semnatura</Text>
          </View>
          <View style={styles.signature}>
            <Text style={styles.signatureLine}>Beneficiar — nume, semnatura</Text>
          </View>
        </View>

        <Footer
          label={`${estimate.org.name} · ${ESTIMATE_TITLE.toLowerCase()} ${estimate.fullNumber}`}
        />
      </Page>
    </Document>
  );
}

function RecapRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: number;
  bold?: boolean;
}) {
  return (
    <View style={styles.recapRow}>
      <Text style={[styles.recapLabel, bold ? { fontWeight: 700 } : {}]}>{label}</Text>
      <Text style={[styles.recapValue, bold ? { fontWeight: 700 } : {}]}>
        {formatLei(value)}
      </Text>
    </View>
  );
}

export async function renderEstimatePdf(
  estimate: EstimateForView,
): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<EstimateDocument estimate={estimate} />);
}

// ---------------------------------------------------------------------------
// Factura
// ---------------------------------------------------------------------------

function InvoiceDocument({ invoice }: { invoice: InvoiceForView }) {
  // Partile se citesc din snapshot, nu din tabelele curente: factura trebuie
  // sa arate exact cum a fost emisa, chiar daca firma si-a schimbat sediul.
  const supplier = invoice.supplierSnapshot as unknown as PartySnapshot;
  const customer = invoice.clientSnapshot as unknown as PartySnapshot;
  const grandTotal = toNumber(invoice.grandTotal);
  const isReversal = Boolean(invoice.reversalOfId);

  return (
    <Document
      title={`Factura ${invoice.fullNumber}`}
      author={supplier.name}
      language="ro"
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>
          {isReversal ? "FACTURA STORNO" : "FACTURA"} {invoice.fullNumber}
        </Text>
        <Text style={styles.subtitle}>
          Data emiterii: {DATE.format(invoice.issueDate)} · Scadenta:{" "}
          {DATE.format(invoice.dueDate)}
          {invoice.supplyDate && ` · Data livrarii: ${DATE.format(invoice.supplyDate)}`}
        </Text>

        <View style={styles.parties}>
          <PartyBox label="Furnizor" {...supplier} />
          <PartyBox label="Client" {...customer} />
        </View>

        <View style={styles.thead}>
          <Text style={[styles.th, styles.colNr]}>Nr.</Text>
          <Text style={[styles.th, styles.colName]}>Denumire</Text>
          <Text style={[styles.th, styles.colUnit]}>U.M.</Text>
          <Text style={[styles.th, styles.colQty]}>Cantitate</Text>
          <Text style={[styles.th, styles.colPrice]}>Pret unitar</Text>
          <Text style={[styles.th, styles.colPrice]}>Valoare</Text>
          <Text style={[styles.th, styles.colPrice]}>TVA</Text>
        </View>

        {invoice.lines.map((line, index) => (
          <View key={line.id} style={styles.tr} wrap={false}>
            <Text style={[styles.td, styles.colNr]}>{index + 1}</Text>
            <Text style={[styles.td, styles.colName]}>{line.name}</Text>
            <Text style={[styles.td, styles.colUnit]}>{line.unit}</Text>
            <Text style={[styles.td, styles.colQty]}>{formatQty(line.quantity)}</Text>
            <Text style={[styles.td, styles.colPrice]}>
              {formatLei(line.unitPrice)}
            </Text>
            <Text style={[styles.td, styles.colPrice]}>
              {formatLei(line.netAmount)}
            </Text>
            <Text style={[styles.td, styles.colPrice]}>
              {formatLei(line.vatAmount)}
            </Text>
          </View>
        ))}

        <View style={styles.recap} wrap={false}>
          <RecapRow label="Total fara TVA" value={toNumber(invoice.netTotal)} />
          <RecapRow label="Total TVA" value={toNumber(invoice.vatAmount)} />
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>TOTAL DE PLATA</Text>
            <Text style={styles.grandValue}>
              {formatLei(grandTotal)} {invoice.currency}
            </Text>
          </View>
        </View>

        <Text style={styles.words}>
          Suma in litere: {amountInWords(grandTotal)}.
        </Text>

        {invoice.notes && <Text style={styles.notes}>{invoice.notes}</Text>}

        <View style={styles.signatures} wrap={false}>
          <View style={styles.signature}>
            <Text style={styles.signatureLine}>Semnatura furnizor</Text>
          </View>
          <View style={styles.signature}>
            <Text style={styles.signatureLine}>Semnatura de primire</Text>
          </View>
        </View>

        <Footer label={`${supplier.name} · Factura ${invoice.fullNumber}`} />
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(invoice: InvoiceForView): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<InvoiceDocument invoice={invoice} />);
}
