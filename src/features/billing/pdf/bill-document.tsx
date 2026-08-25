import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

import {
  billNumber,
  describeEntry,
  entryTotals,
  type BillEntry,
  type BillTranslator,
} from '@/features/billing/bill';
import { formatAmount } from '@/features/billing/money';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { formatDate, stripBidiMarks } from '@/lib/format';

import { ARABIC_FAMILY, LATIN_FAMILY } from './fonts';

/**
 * What a bill looks like on paper.
 *
 * One component draws both documents the screen offers — a single operation and
 * a whole statement — because they are the same page with a different number of
 * rows in the middle. A statement is not a summary of bills; it is the bills,
 * listed. Two components would have meant a subscriber's total printing one way
 * on a receipt and another way on the statement that contains it, which is
 * exactly the disagreement the ledger is built to avoid.
 *
 * ## It is not a tax invoice
 *
 * No VAT number, no invoice sequence, no "paid" stamp. The app is a ledger of
 * what the clinic recorded — see the header of `src/db/schema/billing.ts` — and
 * a document that dressed itself up as a fiscal invoice would be making a claim
 * the data behind it cannot support. It says what was billed, what was
 * received, and where the account stands.
 *
 * ## Arabic
 *
 * The page is set in Almarai and given `direction: 'rtl'` for `ar`, which is
 * what makes the renderer lay each line out right-to-left and pick the
 * contextual letter forms — Arabic set without it comes out as disconnected
 * letters in reverse. Amounts and dates stay left-to-right inside that: they go
 * through `formatAmount` and `formatDate`, which pin both locales to Latin
 * digits, and each sits in its own `Text` so the surrounding direction cannot
 * pull a leading sign to the wrong end.
 */

/** Everything the page needs that is not an entry. */
export type BillHeader = {
  clinicName: string;
  clinicPhone: string | null;
  clinicAddress: string | null;
  clientName: string;
  clientPhone: string | null;
  /** `YYYY-MM-DD` in the clinic's zone — the day the document was produced. */
  issuedOn: string;
};

/*
  `plain` is `stripBidiMarks` under a shorter name, because this file calls it
  on nearly every value it draws. A PDF has no bidi engine and neither font has
  a glyph for a direction mark, so every formatted string is stripped on its way
  to the page. See the helper's own note in `src/lib/format.ts`.
*/
const plain = stripBidiMarks;

const palette = {
  ink: '#1b1b1b',
  muted: '#6b6b6b',
  rule: '#d9d9d9',
  band: '#f4f4f4',
};

const styles = StyleSheet.create({
  page: { paddingVertical: 44, paddingHorizontal: 48, fontSize: 10, color: palette.ink, lineHeight: 1.5 },
  clinic: { fontSize: 16, fontWeight: 700 },
  contact: { fontSize: 9, color: palette.muted },
  title: { fontSize: 13, fontWeight: 700 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  meta: { marginTop: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.rule, flexDirection: 'row', justifyContent: 'space-between' },
  metaLabel: { fontSize: 9, color: palette.muted },
  metaValue: { fontSize: 10 },
  tableHead: { flexDirection: 'row', backgroundColor: palette.band, paddingVertical: 5, paddingHorizontal: 6, marginTop: 20 },
  row: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: palette.rule },
  cellDate: { width: '22%' },
  cellWhat: { width: '48%' },
  cellAmount: { width: '30%' },
  headCell: { fontSize: 9, fontWeight: 700, color: palette.muted },
  note: { fontSize: 8, color: palette.muted },
  totals: { marginTop: 18, alignSelf: 'flex-end', width: '55%' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalStrong: { fontWeight: 700, borderTopWidth: 1, borderTopColor: palette.rule, marginTop: 4, paddingTop: 6 },
  footer: { position: 'absolute', bottom: 28, left: 48, right: 48, fontSize: 8, color: palette.muted, textAlign: 'center' },
});

export function BillDocument({
  locale,
  header,
  entries,
  t,
  /**
   * `single` prints one operation and heads the page with its bill number;
   * `statement` prints the lot and foots them to the account's position. The
   * rows are drawn by the same code either way.
   */
  variant,
}: {
  locale: Locale;
  header: BillHeader;
  entries: readonly BillEntry[];
  t: BillTranslator;
  variant: 'single' | 'statement';
}) {
  const rtl = getLocaleDirection(locale) === 'rtl';
  const totals = entryTotals(entries);
  const single = variant === 'single' ? entries[0] : undefined;

  /*
    `direction` on the page is what turns on right-to-left layout for every
    flex row and text run inside it. The typeface follows the same switch:
    Almarai carries both scripts, so an English word inside an Arabic bill still
    has outlines, while IBM Plex Sans has no Arabic at all and is only ever the
    English page's face.
  */
  return (
    <Document
      title={single ? billNumber(single) : t('bills.statementTitle')}
      author={header.clinicName}
      creator={header.clinicName}
      producer={header.clinicName}
      language={locale}
    >
      <Page
        size="A4"
        style={[
          styles.page,
          {
            /*
              Two families, not one. Neither face covers the page on its own:
              Almarai has no ₪ — every amount on an Arabic bill would lose its
              currency sign — and IBM Plex Sans has no Arabic at all, so an
              Arabic name or charge description inside an English bill would be
              a row of blanks. The reader's own script leads and the other
              catches what it is missing.
            */
            fontFamily: rtl ? [ARABIC_FAMILY, LATIN_FAMILY] : [LATIN_FAMILY, ARABIC_FAMILY],
            direction: rtl ? 'rtl' : 'ltr',
          },
        ]}
      >
        <View style={styles.headRow}>
          <View>
            <Text style={styles.clinic}>{header.clinicName}</Text>
            {header.clinicPhone ? <Text style={styles.contact}>{plain(header.clinicPhone)}</Text> : null}
            {header.clinicAddress ? <Text style={styles.contact}>{header.clinicAddress}</Text> : null}
          </View>

          <View>
            <Text style={styles.title}>{single ? t('bills.billTitle') : t('bills.statementTitle')}</Text>
            {single ? (
              /* `direction: ltr` — the number is a reference, not a sentence. */
              <Text style={{ fontSize: 9, color: palette.muted, direction: 'ltr' }}>
                {plain(`${t('bills.billNo')} ${billNumber(single)}`)}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.meta}>
          <View>
            <Text style={styles.metaLabel}>{t('bills.subscriber')}</Text>
            <Text style={styles.metaValue}>{header.clientName}</Text>
            {header.clientPhone ? <Text style={styles.contact}>{plain(header.clientPhone)}</Text> : null}
          </View>

          <View>
            <Text style={styles.metaLabel}>{t('bills.issuedOn')}</Text>
            <Text style={styles.metaValue}>{plain(formatDate(locale, `${header.issuedOn}T12:00:00Z`))}</Text>
          </View>
        </View>

        <View style={styles.tableHead}>
          <Text style={[styles.headCell, styles.cellDate]}>{t('bills.date')}</Text>
          <Text style={[styles.headCell, styles.cellWhat]}>{t('bills.description')}</Text>
          <Text style={[styles.headCell, styles.cellAmount]}>{t('bills.amount')}</Text>
        </View>

        {entries.length === 0 ? (
          <View style={styles.row}>
            <Text style={{ color: palette.muted }}>{t('bills.emptyLedger')}</Text>
          </View>
        ) : null}

        {entries.map((entry) => {
          const described = describeEntry(entry, locale, t);

          return (
            <View key={entry.id} style={styles.row} wrap={false}>
              <Text style={styles.cellDate}>{plain(described.date)}</Text>

              <View style={styles.cellWhat}>
                <Text>{described.title}</Text>
                <Text style={styles.note}>
                  {entry.kind === 'charge' ? t('bills.charge') : t('bills.payment')}
                  {entry.note ? ` · ${entry.note}` : ''}
                </Text>
              </View>

              {/*
                The amount as it was recorded, sign and all. No minus is added
                to a payment for being one: what the subscriber handed over is
                ₪1,500, and a receipt that says −₪1,500 is a receipt they will
                ask about. The row says which side of the ledger it is on in
                words, in the line under its description.

                A refund is stored negative and prints negative — that one is a
                fact rather than a presentation, and it is money going back out.
                The totals below are summed from the stored values either way,
                by `entryTotals`.
              */}
              <Text style={styles.cellAmount}>{described.amount}</Text>
            </View>
          );
        })}

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.metaLabel}>{t('fields.totalPrice')}</Text>
            <Text>{plain(formatAmount(locale, totals.chargedMinor))}</Text>
          </View>

          <View style={styles.totalRow}>
            <Text style={styles.metaLabel}>{t('fields.totalPayment')}</Text>
            <Text>{plain(formatAmount(locale, totals.paidMinor))}</Text>
          </View>

          {/*
            Remaining, not balance, is the strong line: it is the figure the
            clinic acts on. The balance is printed under it only when it says
            something remaining cannot — a subscriber in credit.
          */}
          <View style={[styles.totalRow, styles.totalStrong]}>
            <Text>{t('fields.remaining')}</Text>
            <Text>{plain(formatAmount(locale, totals.remainingMinor))}</Text>
          </View>

          {totals.balanceMinor < 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.metaLabel}>{t('fields.balance')}</Text>
              <Text>{plain(formatAmount(locale, totals.balanceMinor))}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.footer} fixed>
          {t('bills.footer')}
        </Text>
      </Page>
    </Document>
  );
}
