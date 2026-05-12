import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  pdf,
} from '@react-pdf/renderer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  formatCents,
  INVOICE_TYPE_LABEL,
  type InvoiceData,
} from './types';

const COLORS = {
  ink: '#0e1626',
  rule: '#0e1626',
  muted: '#0e1626',
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 52,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: COLORS.ink,
    lineHeight: 1.35,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  logo: { width: 80, height: 80, objectFit: 'contain' },
  headerRight: {
    fontSize: 12,
    fontFamily: 'Helvetica',
    letterSpacing: 1,
    color: COLORS.ink,
    textAlign: 'right',
    marginTop: 18,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  block: { flexDirection: 'column' },
  label: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    letterSpacing: 1,
    marginBottom: 1,
  },
  value: { fontSize: 8, color: COLORS.ink, marginBottom: 1 },
  bigType: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 18,
    letterSpacing: 1.5,
    textAlign: 'right',
    lineHeight: 1.2,
    marginBottom: 4,
  },
  bigNumber: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 18,
    letterSpacing: 1.5,
    textAlign: 'right',
    lineHeight: 1.2,
    marginBottom: 6,
  },
  recipient: { marginTop: 24 },
  hr: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.rule,
    marginVertical: 8,
  },
  tableHead: {
    flexDirection: 'row',
    paddingVertical: 5,
  },
  tableCol1: { flex: 4, fontFamily: 'Helvetica-Bold', letterSpacing: 1 },
  tableCol2: {
    flex: 1,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
    textAlign: 'right',
  },
  tableCol3: {
    flex: 1,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
    textAlign: 'right',
  },
  tableCol4: {
    flex: 1,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
    textAlign: 'right',
  },
  tableRow: { flexDirection: 'row', paddingVertical: 4 },
  tableCellL: { flex: 4, fontSize: 8 },
  tableCellR: { flex: 1, fontSize: 8, textAlign: 'right' },
  totalsBlock: { marginTop: 8, alignItems: 'flex-end' },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: '100%',
    paddingVertical: 2,
  },
  totalsLabel: {
    flex: 6,
    textAlign: 'right',
    paddingRight: 12,
    fontSize: 8,
  },
  totalsValue: { width: 80, textAlign: 'right', fontSize: 8 },
  bigTotal: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4,
    paddingVertical: 3,
  },
  bigTotalLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    letterSpacing: 1.2,
    textAlign: 'right',
    paddingRight: 16,
  },
  bigTotalValue: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    width: 100,
    textAlign: 'right',
  },
  noteText: {
    marginTop: 16,
    textAlign: 'center',
    fontSize: 9,
    color: COLORS.muted,
  },
  payInfo: { marginTop: 32 },
  payTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    letterSpacing: 1,
    marginBottom: 4,
  },
  payRow: { flexDirection: 'row', marginBottom: 1 },
  payLabel: { width: 100, fontSize: 8 },
  payValue: { fontSize: 8 },
  conditions: { marginTop: 20 },
  conditionsTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    letterSpacing: 1,
    marginBottom: 4,
  },
  conditionsText: { fontSize: 7, lineHeight: 1.4, color: COLORS.ink },
  conditionsItem: { flexDirection: 'row', marginBottom: 1 },
  conditionsBullet: { width: 10, fontSize: 7 },
  conditionsBody: { flex: 1, fontSize: 7 },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 52,
    right: 52,
    borderTopWidth: 1,
    borderTopColor: COLORS.rule,
    paddingTop: 6,
    textAlign: 'center',
    fontSize: 8,
  },
});

let cachedLogo: Buffer | null = null;
function loadLogo(): Buffer {
  if (cachedLogo) return cachedLogo;
  const path = join(process.cwd(), 'public', 'branding', 'logo-navy.png');
  cachedLogo = readFileSync(path);
  return cachedLogo;
}

interface InvoicePdfProps {
  data: InvoiceData;
}

function InvoicePdf({ data }: InvoicePdfProps): React.JSX.Element {
  const logo = loadLogo();

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Image style={styles.logo} src={logo} />
          <Text style={styles.headerRight}>GRAFIK- &amp; WEBDESIGN</Text>
        </View>

        <View style={styles.topRow}>
          <View style={styles.block}>
            <View style={{ flexDirection: 'row' }}>
              <Text style={[styles.label, { width: 130 }]}>
                LEISTUNGSERBRINGER:
              </Text>
              <View>
                <Text style={styles.value}>Fly &amp; Froth Grafik- &amp; Webdesign</Text>
                <Text style={styles.value}>Röderweg 19, 61184 Karben</Text>
                <Text style={[styles.value, { marginTop: 6 }]}>
                  Telefon: +49 163 1474127
                </Text>
                <Text style={styles.value}>E-Mail: info@fly-froth.com</Text>
                <Text style={styles.value}>Steuernummer: 01682103072</Text>
              </View>
            </View>
          </View>
          <View>
            <Text style={[styles.bigType, data.type === 'angebot' ? { fontSize: 14, letterSpacing: 1 } : {}]}>{INVOICE_TYPE_LABEL[data.type]}</Text>
            <Text style={[styles.bigNumber, data.type === 'angebot' ? { fontSize: 14, letterSpacing: 1 } : {}]}>#{data.number}</Text>
          </View>
        </View>

        <View style={[styles.recipient, { flexDirection: 'row' }]}>
          <Text style={[styles.label, { width: 130 }]}>RECHNUNG AN:</Text>
          <View>
            {data.recipient.company ? (
              <Text style={styles.value}>{data.recipient.company}</Text>
            ) : null}
            <Text style={styles.value}>{data.recipient.name}</Text>
            <Text style={styles.value}>{data.recipient.street}</Text>
            <Text style={styles.value}>{data.recipient.zipCity}</Text>
          </View>
        </View>

        <View style={[{ flexDirection: 'row', marginTop: 8 }]}>
          <Text style={[styles.label, { width: 130 }]}>DATUM:</Text>
          <Text style={styles.value}>{data.date}</Text>
        </View>

        {data.validUntil ? (
          <View style={[{ flexDirection: 'row', marginTop: 2 }]}>
            <Text style={[styles.label, { width: 130 }]}>GÜLTIG BIS:</Text>
            <Text style={styles.value}>{data.validUntil}</Text>
          </View>
        ) : null}

        <View style={styles.hr} />

        <View style={styles.tableHead}>
          <Text style={styles.tableCol1}>DIENSTLEISTUNGSVERGÜTUNG</Text>
          <Text style={styles.tableCol2}>PREIS</Text>
          <Text style={styles.tableCol3}>MENGE</Text>
          <Text style={styles.tableCol4}>GESAMT</Text>
        </View>
        <View style={{ borderBottomWidth: 1, borderBottomColor: COLORS.rule }} />

        {data.items.map((item, idx) => (
          <View key={idx} style={styles.tableRow}>
            <Text style={styles.tableCellL}>{item.description}</Text>
            <Text style={styles.tableCellR}>
              {formatCents(item.unitPriceCents)}
            </Text>
            <Text style={styles.tableCellR}>{item.quantity}</Text>
            <Text style={styles.tableCellR}>
              {formatCents(item.unitPriceCents * item.quantity)}
            </Text>
          </View>
        ))}

        <View style={{ borderBottomWidth: 1, borderBottomColor: COLORS.rule }} />

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Zwischensumme</Text>
            <Text style={styles.totalsValue}>{formatCents(data.totalCents)}</Text>
          </View>
          {data.type !== 'angebot' ? (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>
                Gemäß §19 UStG wird keine Umsatzsteuer berechnet.
              </Text>
              <Text style={styles.totalsValue}>0</Text>
            </View>
          ) : null}
          <View style={{ borderBottomWidth: 1, borderBottomColor: COLORS.rule, width: '60%', marginTop: 4 }} />
          <View style={styles.bigTotal}>
            <Text style={styles.bigTotalLabel}>GESAMTBETRAG</Text>
            <Text style={styles.bigTotalValue}>
              {formatCents(data.totalCents)}€
            </Text>
          </View>
        </View>

        {data.footerNote ? (
          <Text style={styles.noteText}>{data.footerNote}</Text>
        ) : null}

        <View style={styles.payInfo}>
          <Text style={styles.payTitle}>ZAHLUNGSINFORMATIONEN:</Text>
          <View style={styles.payRow}>
            <Text style={styles.payLabel}>Bank</Text>
            <Text style={styles.payValue}>N26</Text>
          </View>
          <View style={styles.payRow}>
            <Text style={styles.payLabel}>Kontoinhaber:</Text>
            <Text style={styles.payValue}>Mehmet Genco</Text>
          </View>
          <View style={styles.payRow}>
            <Text style={styles.payLabel}>IBAN:</Text>
            <Text style={styles.payValue}>DE29100110012403427850</Text>
          </View>
        </View>

        <View style={styles.conditions}>
          <Text style={styles.conditionsTitle}>PROJEKTBEDINGUNGEN:</Text>
          <View style={styles.conditionsItem}>
            <Text style={styles.conditionsBullet}>{'•'}</Text>
            <Text style={styles.conditionsBody}>
              Projektstart nach Eingang einer Anzahlung in Höhe von 50 % des Gesamtbetrags.
            </Text>
          </View>
          <View style={styles.conditionsItem}>
            <Text style={styles.conditionsBullet}>{'•'}</Text>
            <Text style={styles.conditionsBody}>
              Die restlichen 50 % werden nach Fertigstellung und vor Übergabe der finalen Dateien fällig.
            </Text>
          </View>
          <View style={styles.conditionsItem}>
            <Text style={styles.conditionsBullet}>{'•'}</Text>
            <Text style={styles.conditionsBody}>
              Im Preis sind zwei Korrekturrunden enthalten. Kleinere Anpassungen erfolgen in der Regel kostenfrei.
              Bei größeren nachträglichen Änderungen kann je nach Aufwand ein Aufpreis anfallen.
            </Text>
          </View>
          <View style={styles.conditionsItem}>
            <Text style={styles.conditionsBullet}>{'•'}</Text>
            <Text style={styles.conditionsBody}>
              Als kreative Dienstleistung sind begonnene Projekte von Rückerstattungen ausgeschlossen.
            </Text>
          </View>
          <View style={styles.conditionsItem}>
            <Text style={styles.conditionsBullet}>{'•'}</Text>
            <Text style={styles.conditionsBody}>
              Entsteht beim Druck ein Fehler auf unserer Seite, erfolgt eine kostenfreie Nachproduktion.
            </Text>
          </View>
          <View style={styles.conditionsItem}>
            <Text style={styles.conditionsBullet}>{'•'}</Text>
            <Text style={styles.conditionsBody}>
              Mit der Beauftragung gelten diese Bedingungen als akzeptiert.
            </Text>
          </View>
        </View>

        <Text style={styles.footer} fixed>
          Röderweg 19 • 61184 Karben • 0163 147 41 27 • www.fly-froth.com
        </Text>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(data: InvoiceData): Promise<Buffer> {
  const blob = await pdf(<InvoicePdf data={data} />).toBlob();
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
