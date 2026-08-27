import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

import { ARABIC_FAMILY, LATIN_FAMILY } from '@/features/billing/pdf/fonts';
import { PDF_PALETTE as palette } from '@/features/billing/pdf/palette';
import { stripBidiMarks } from '@/lib/format';
import type { Locale } from '@/i18n/routing';

/**
 * The bills export as a document, rather than as a file a spreadsheet opens.
 *
 * Drawn in `PDF_PALETTE`, the same four greys the statement uses — two printed
 * documents from one clinic that do not look related is the kind of detail a
 * patient never notices and an accountant does.
 *
 * ## Why it is its own document and not `BillDocument` with more rows
 *
 * That one is a statement: a clinic header, one subscriber's identity, a
 * running balance and a total to pay. This is a register — many subscribers,
 * no balance owed by anybody in particular, and a period rather than an issue
 * date. They share a look and nothing else, and merging them would mean a
 * component branching on which of two unrelated documents it was being.
 */
const styles = StyleSheet.create({
  page: { paddingVertical: 36, paddingHorizontal: 36, fontSize: 9, color: palette.ink, lineHeight: 1.4 },
  title: { fontSize: 14, fontWeight: 700 },
  meta: { fontSize: 9, color: palette.muted, marginTop: 3 },
  head: {
    flexDirection: 'row',
    backgroundColor: palette.band,
    paddingVertical: 5,
    paddingHorizontal: 5,
    marginTop: 16,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 5,
    borderBottomWidth: 1,
    borderBottomColor: palette.rule,
  },
  headCell: { fontSize: 8, fontWeight: 700, color: palette.muted },
  cell: { fontSize: 9 },
  footer: { marginTop: 14, fontSize: 8, color: palette.muted },
});

/**
 * How wide each column sits, as flex weights.
 *
 * The name gets the most because it is the only column a reader scans down;
 * the money columns are narrow and identical so the figures line up as a block
 * whichever level is being drawn. Six weights either way — the two levels have
 * the same shape, which is what lets one table draw both.
 */
const WEIGHTS = [3, 2, 2, 3, 2, 2];

export function BillsExportDocument({
  locale,
  title,
  subtitle,
  head,
  body,
  emptyLabel,
}: {
  locale: Locale;
  title: string;
  /** The period, already worded — "1 Jan 2026 – 31 Mar 2026", or "All time". */
  subtitle: string;
  head: string[];
  body: string[][];
  /** What to say when the window holds nothing. */
  emptyLabel: string;
}) {
  const rtl = locale === 'ar';

  return (
    <Document>
      <Page
        size="A4"
        /*
          Landscape: six columns of a register do not fit portrait without
          setting the names in something nobody can read. A statement is
          portrait because it is one account down a page; this is a table.
        */
        orientation="landscape"
        style={{
          ...styles.page,
          direction: rtl ? 'rtl' : 'ltr',
          /* The reader's script first, the other as fallback — a register holds
             Arabic names and Latin figures on the same line either way. */
          fontFamily: rtl ? [ARABIC_FAMILY, LATIN_FAMILY] : [LATIN_FAMILY, ARABIC_FAMILY],
        }}
      >
        <Text style={styles.title}>{stripBidiMarks(title)}</Text>
        <Text style={styles.meta}>{stripBidiMarks(subtitle)}</Text>

        <View style={styles.head} fixed>
          {head.map((label, index) => (
            <Text key={label} style={{ ...styles.headCell, flex: WEIGHTS[index] ?? 2 }}>
              {stripBidiMarks(label)}
            </Text>
          ))}
        </View>

        {body.length === 0 ? (
          <Text style={styles.footer}>{stripBidiMarks(emptyLabel)}</Text>
        ) : (
          body.map((row, rowIndex) => (
            <View
              key={`${row[0]}-${rowIndex}`}
              style={styles.row}
              /* A subscriber's line must not be split across a page break. */
              wrap={false}
            >
              {row.map((cell, index) => (
                <Text key={index} style={{ ...styles.cell, flex: WEIGHTS[index] ?? 2 }}>
                  {stripBidiMarks(cell)}
                </Text>
              ))}
            </View>
          ))
        )}
      </Page>
    </Document>
  );
}
