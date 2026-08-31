import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { type ReactNode } from 'react';

import {
  billNumber,
  describeEntry,
  entryTotals,
  type BillEntry,
  type BillTranslator,
} from '@/features/billing/bill';
import { formatAmount } from '@/features/billing/money';
import {
  DEFAULT_PLACEMENTS,
  DEFAULT_TOTALS_ALIGNMENT,
  isCustomItem,
  LOGO_SIZE,
  storedSize,
  totalsAlignSelf,
  type TotalsAlignment,
  ZONE_HEIGHT,
  zoneInset,
  type Placement,
  type Zone,
} from '@/features/forms/zones';
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
  /** Who practises at the clinic, when the head of the page names them. */
  doctorName?: string | null;
  /**
   * The clinic's mark as a `data:` URL, or `null` for a clinic that has not
   * uploaded one — see the `logo` column.
   *
   * Whether it is *printed*, and where, is the layout's business rather than
   * this one's: a clinic can have a logo and choose not to put it on bills.
   */
  logo?: string | null;
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

import { PDF_PALETTE as palette } from './palette';

const styles = StyleSheet.create({
  page: { paddingVertical: 44, paddingHorizontal: 48, fontSize: 10, color: palette.ink, lineHeight: 1.5 },
  clinic: { fontSize: 16, fontWeight: 700 },
  contact: { fontSize: 9, color: palette.muted },
  title: { fontSize: 13, fontWeight: 700 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  /* The row turned around, so the title leads and the clinic block follows.
     `row-reverse` and not two orderings of the JSX: one arrangement of the
     blocks, drawn from either end. */
  headRowSwapped: { flexDirection: 'row-reverse' },
  headStack: { flexDirection: 'column', alignItems: 'center', gap: 6 },
  centred: { alignItems: 'center' },
  clinicBlock: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  /* 40pt tall and free in width, which keeps a wide mark and a square one the
     same weight beside the clinic's name — a logo sized by width would make a
     long wordmark tower over the address under it. */
  logoMark: { height: 40, objectFit: 'contain' },
  logoBanner: { alignItems: 'center', marginBottom: 14 },
  logoWide: { height: 56, objectFit: 'contain' },
  meta: { marginTop: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.rule, flexDirection: 'row', justifyContent: 'space-between' },
  metaLabel: { fontSize: 9, color: palette.muted },
  metaValue: { fontSize: 10 },
  /* A wrapping row of pairs: each takes about half the width, so two lines sit
     side by side and a long one takes the width it needs. */
  extras: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  extraRow: { width: '45%' },
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
  placements = DEFAULT_PLACEMENTS,
  totalsAlignment,
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
  /**
   * Where the clinic put the things in the two free zones — see
   * `placementsFrom`. Omitted, the page draws the arrangement it always had.
   */
  placements?: readonly Placement[];
  /**
   * Which side of the page the totals block takes — see `totalsAlignmentFrom`.
   *
   * Omitted, they take the side they always have: the far one, resolved per
   * script rather than stored as a side.
   */
  totalsAlignment?: TotalsAlignment;
}) {
  const rtl = getLocaleDirection(locale) === 'rtl';
  const totals = entryTotals(entries);
  const single = variant === 'single' ? entries[0] : undefined;
  /* The mark, if the clinic has one. Whether it prints, and where, is a
     placement now — see the header zone. */
  const logo = header.logo ?? null;

  /*
    `direction` on the page is what turns on right-to-left layout for every
    flex row and text run inside it. The typeface follows the same switch:
    Almarai carries both scripts, so an English word inside an Arabic bill still
    has outlines, while IBM Plex Sans has no Arabic at all and is only ever the
    English page's face.
  */
  /*
    Every band of the page, by name, so the clinic's own order can decide which
    follows which — see `BILL_BLOCKS`. Built as values rather than rendered in
    place: an arrangement is a list to map over, and a document that read its
    order out of the JSX would have the order written twice.
  */
  /**
   * What each placeable thing draws, and how it is set.
   *
   * One table, so a thing looks the same wherever a clinic drags it — and so
   * that adding a placeable thing is an entry here rather than a branch in the
   * layout below.
   */
  /**
   * Everything placeable, drawn at the page's own scale — or at the size the
   * clinic set, when it set one. `undefined` leaves the styles alone, which is
   * the ordinary case.
   */
  const drawn = (size: number | undefined): Record<string, ReactNode> => ({
    /* Sized by the clinic, from the placement — see `LOGO_SIZE`. Free in
       width so a wordmark and a monogram both keep their proportions. */
    /* The mark has no type scale to fall back on, so it takes a height either
       way — the clinic's, or the default. */
    logo: logo ? (
      /* eslint-disable-next-line jsx-a11y/alt-text -- `Image` here is
         react-pdf's, which draws into a PDF and takes no alt text. */
      <Image src={logo} style={{ height: size ?? LOGO_SIZE.default, objectFit: 'contain' }} />
    ) : null,
    clinicName: <Text style={[styles.clinic, size ? { fontSize: size } : undefined]}>{header.clinicName}</Text>,
    doctorName: header.doctorName ? (
      <Text style={[styles.metaValue, size ? { fontSize: size } : undefined]}>{header.doctorName}</Text>
    ) : null,
    clinicPhone: header.clinicPhone ? (
      <Text style={[styles.contact, size ? { fontSize: size } : undefined]}>
        {plain(header.clinicPhone)}
      </Text>
    ) : null,
    clinicAddress: header.clinicAddress ? (
      <Text style={[styles.contact, size ? { fontSize: size } : undefined]}>{header.clinicAddress}</Text>
    ) : null,
    docTitle: (
      <Text style={[styles.title, size ? { fontSize: size } : undefined]}>
        {single ? t('bills.billTitle') : t('bills.statementTitle')}
      </Text>
    ),
    /* Only a single bill has a number; a statement is the account. */
    billNo: single ? (
      /* `direction: ltr` — the number is a reference, not a sentence. */
      <Text style={{ fontSize: size ?? 9, color: palette.muted, direction: 'ltr' }}>
        {plain(`${t('bills.billNo')} ${billNumber(single)}`)}
      </Text>
    ) : null,
    subscriberLabel: (
      <Text style={[styles.metaLabel, size ? { fontSize: size } : undefined]}>
        {t('bills.subscriber')}
      </Text>
    ),
    subscriberValue: (
      <Text style={[styles.metaValue, size ? { fontSize: size } : undefined]}>{header.clientName}</Text>
    ),
    issuedLabel: (
      <Text style={[styles.metaLabel, size ? { fontSize: size } : undefined]}>
        {t('bills.issuedOn')}
      </Text>
    ),
    issuedValue: (
      <Text style={[styles.metaValue, size ? { fontSize: size } : undefined]}>
        {plain(formatDate(locale, `${header.issuedOn}T12:00:00Z`))}
      </Text>
    ),
  });

  /**
   * One free zone: a band of known height with the clinic's things placed in
   * it — see `src/features/forms/zones.ts` for why only these two are free.
   */
  const zone = (name: Zone) => (
    <View style={{ height: ZONE_HEIGHT[name], position: 'relative' }}>
      {placements
        .filter((item) => item.zone === name && !item.hidden)
        .map((item) => {
          /* Only what the clinic set: absent leaves the page's own scale in
             place — see `storedSize`. */
          const size = storedSize(item);

          const content = isCustomItem(item.id) ? (
            <Text style={[styles.metaValue, size ? { fontSize: size } : undefined]}>{item.text}</Text>
          ) : (
            drawn(size)[item.id]
          );

          /* A thing with nothing to draw — no logo uploaded, no bill number on
             a statement — takes no space rather than leaving a gap where a
             clinic put something. */
          if (!content) return null;

          return (
            <View
              key={item.id}
              style={{
                position: 'absolute',
                ...zoneInset(item, name, rtl),
                /* A centred thing spans the band and centres its child; an
                   offset one is as wide as what it holds. */
                ...(item.centred ? { alignItems: 'center' } : null),
              }}
            >
              {content}
            </View>
          );
        })}
    </View>
  );

  const blocks: Record<'header' | 'details' | 'table' | 'totals', ReactNode> = {
    header: zone('header'),
    details: <View style={styles.meta}>{zone('details')}</View>,
    table: (
      <>
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
      </>
    ),
    totals: (
      <View
        style={[
          styles.totals,
          {
            alignSelf: totalsAlignSelf(
              totalsAlignment ?? DEFAULT_TOTALS_ALIGNMENT[rtl ? 'rtl' : 'ltr'],
              rtl,
            ),
          },
        ]}
      >
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
    ),
  };
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
        {/*
          The two free zones, then the ledger and what it comes to. This order
          is the document's own: a table dragged above the details it belongs to
          would be a bill nobody could read, and the two blocks that *can* be
          arranged are arranged inside themselves — see `../zones.ts`.
        */}
        {blocks.header}
        {blocks.details}
        {blocks.table}
        {blocks.totals}

        {/* Centred, and `fixed`: it prints at the foot of every page rather
            than after the totals, which is why it is not one of the bands
            above. */}
        <Text style={styles.footer} fixed>
          {t('bills.footer')}
        </Text>
      </Page>
    </Document>
  );
}
